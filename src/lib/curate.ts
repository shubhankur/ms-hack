// Curation engine [component #3].
// Pipeline: cheap pre-filter (1600 -> ~80) -> LLM scoring -> agenda assembly
// with time-conflict + travel-buffer resolution and a social-energy cap.

import { z } from "zod";
import { chatJSON, MINI_DEPLOYMENT } from "./aoai";
import type {
  Agenda,
  AgendaItem,
  ScoredEvent,
  TechWeekEvent,
  UserProfile,
} from "./types";

const SHORTLIST_SIZE = 80;
const EVENT_DURATION_MIN = 120; // assume 2h when only start time is known
const TRAVEL_BUFFER_MIN = 30; // gap required between events in different areas
const ENERGY_CAP: Record<NonNullable<UserProfile["socialEnergy"]>, number> = {
  low: 2,
  medium: 4,
  high: 6,
};

/** Tokenized text used for keyword pre-filtering. */
function haystack(e: TechWeekEvent): string {
  return [
    e.name,
    e.company,
    e.location,
    e.timeOfDay,
    ...(e.themes ?? []),
    ...e.hosts.map((h) => h.label),
  ]
    .join(" ")
    .toLowerCase();
}

function profileTerms(p: UserProfile): string[] {
  return [...p.interests, ...p.goals, p.role ?? ""]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 2);
}

/**
 * Stage 1 — pre-filter. Keeps events on the user's available days, drops the
 * ones they asked to avoid, and ranks the rest by keyword overlap so the LLM
 * only has to score a relevant shortlist.
 */
export function preFilter(events: TechWeekEvent[], profile: UserProfile): TechWeekEvent[] {
  const terms = profileTerms(profile);
  const avoid = (profile.avoid ?? []).map((a) => a.toLowerCase());
  const days = new Set(profile.days);
  const hoods = new Set((profile.neighborhoods ?? []).map((h) => h.toLowerCase()));

  const candidates = events.filter((e) => {
    if (days.size && !days.has(e.date)) return false;
    const hay = haystack(e);
    if (avoid.some((a) => a && hay.includes(a))) return false;
    return true;
  });

  const scored = candidates.map((e) => {
    const hay = haystack(e);
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 1;
    if (hoods.size && hoods.has(e.location.toLowerCase())) score += 1;
    if (e.sponsorTier) score += 0.25; // marquee events are slightly likelier relevant
    return { e, score };
  });

  // Keep keyword hits first, then fill with remaining to guarantee coverage.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, SHORTLIST_SIZE).map((s) => s.e);
}

const ScoreSchema = z.object({
  scores: z.array(
    z.object({
      id: z.number(),
      fitScore: z.number().min(0).max(100),
      why: z.string(),
      hiddenGem: z.boolean(),
    }),
  ),
});

/**
 * Stage 2 — LLM scoring. One call scores the whole shortlist so the model can
 * reason comparatively (and flag genuine hidden gems vs. the obvious marquee
 * events). Uses the cheap mini deployment.
 */
export async function scoreEvents(
  shortlist: TechWeekEvent[],
  profile: UserProfile,
): Promise<ScoredEvent[]> {
  if (shortlist.length === 0) return [];

  const compact = shortlist.map((e) => ({
    id: e.id,
    name: e.name,
    host: e.company,
    cohosts: e.hosts.filter((h) => h.role !== "primary").map((h) => h.label),
    when: `${e.date} ${e.timeOfDay}`,
    where: e.location,
    sponsorTier: e.sponsorTier,
    inviteOnly: e.isInviteOnly,
  }));

  const system = `You are an elite Tech Week concierge. Score how well each event fits THIS person.
Return JSON: {"scores":[{"id,fitScore(0-100),why,hiddenGem}]}.
- fitScore reflects fit with their role, goals, and interests — not generic prestige.
- "why" is ONE short sentence, specific to them ("good for hiring senior infra eng"), max 16 words.
- hiddenGem = true when fit is high but the event is small/low-profile (no sponsorTier, niche host). The whole point is surfacing gems they'd never find in 1600 events.
Score every id provided.`;

  const user = `PERSON:
role: ${profile.role ?? "unknown"}
bio: ${profile.oneLiner ?? ""}
goals: ${profile.goals.join(", ") || "unspecified"}
interests: ${profile.interests.join(", ") || "unspecified"}
avoid: ${(profile.avoid ?? []).join(", ") || "nothing"}

EVENTS:
${JSON.stringify(compact)}`;

  const out = await chatJSON(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ScoreSchema,
    { deployment: MINI_DEPLOYMENT, temperature: 0.3 },
  );

  const byId = new Map(shortlist.map((e) => [e.id, e]));
  return out.scores
    .map((s) => {
      const event = byId.get(s.id);
      if (!event) return null;
      return { event, fitScore: s.fitScore, why: s.why, hiddenGem: s.hiddenGem };
    })
    .filter((x): x is ScoredEvent => x !== null)
    .sort((a, b) => b.fitScore - a.fitScore);
}

function startMinutes(e: TechWeekEvent): number {
  const [h, m] = e.time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function overlaps(a: TechWeekEvent, b: TechWeekEvent): boolean {
  const aS = startMinutes(a);
  const bS = startMinutes(b);
  const buffer = a.location !== b.location ? TRAVEL_BUFFER_MIN : 0;
  const aE = aS + EVENT_DURATION_MIN + buffer;
  const bE = bS + EVENT_DURATION_MIN + buffer;
  return aS < bE && bS < aE;
}

/**
 * Stage 3 — agenda assembly. Greedy by fitScore within each day: take the best
 * event that doesn't collide (time + travel buffer) with an already-picked one,
 * up to the social-energy cap. Records what each pick bumped.
 */
export function buildAgenda(scored: ScoredEvent[], profile: UserProfile): Agenda {
  const cap = ENERGY_CAP[profile.socialEnergy ?? "medium"];
  const byDay: Record<string, AgendaItem[]> = {};

  const groups = new Map<string, ScoredEvent[]>();
  for (const s of scored) {
    if (!groups.has(s.event.date)) groups.set(s.event.date, []);
    groups.get(s.event.date)!.push(s);
  }

  for (const [day, items] of groups) {
    items.sort((a, b) => b.fitScore - a.fitScore);
    const picked: AgendaItem[] = [];
    for (const cand of items) {
      if (picked.length >= cap) break;
      const clash = picked.filter((p) => overlaps(p.event, cand.event));
      if (clash.length === 0) {
        picked.push({ ...cand, conflictsWith: [] });
      } else {
        // candidate loses (lower score, came later) — note it on the winners.
        for (const w of clash) {
          w.conflictsWith = [...(w.conflictsWith ?? []), cand.event.id];
        }
      }
    }
    picked.sort((a, b) => startMinutes(a.event) - startMinutes(b.event));
    byDay[day] = picked;
  }

  return { profileId: profile.id, byDay, generatedAt: new Date().toISOString() };
}

/** Full pipeline convenience wrapper. */
export async function curate(
  events: TechWeekEvent[],
  profile: UserProfile,
): Promise<{ shortlist: TechWeekEvent[]; scored: ScoredEvent[]; agenda: Agenda }> {
  const shortlist = preFilter(events, profile);
  const scored = await scoreEvents(shortlist, profile);
  const agenda = buildAgenda(scored, profile);
  return { shortlist, scored, agenda };
}
