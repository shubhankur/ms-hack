// Conversational profile capture [component #2].
// Each turn: produce a natural reply AND the updated structured profile, plus a
// `ready` flag once we have enough to curate.

import { z } from "zod";
import { chatJSON } from "./aoai";
import type { ChatMessage } from "./aoai";
import type { UserProfile } from "./types";
import { TECH_WEEK_DAYS } from "./techweek";

const ProfileTurnSchema = z.object({
  reply: z.string(),
  ready: z.boolean(),
  profile: z.object({
    role: z.string().optional(),
    oneLiner: z.string().optional(),
    goals: z.array(z.string()).default([]),
    interests: z.array(z.string()).default([]),
    days: z.array(z.string()).default([]),
    neighborhoods: z.array(z.string()).default([]),
    socialEnergy: z.enum(["low", "medium", "high"]).optional(),
    avoid: z.array(z.string()).default([]),
  }),
});

export type ProfileTurn = z.infer<typeof ProfileTurnSchema>;

const SYSTEM = `You are the onboarding concierge for a Tech Week (NYC, June 1-7 2026) event curator.
Your job: in a FEW friendly turns, learn who the person is and what they want out of the week, then hand off to the curator.

Collect, conversationally (don't interrogate — infer aggressively from whatever they say):
- role (founder, VC, BD, engineer, designer, operator...)
- oneLiner (what they do / their company)
- goals (raise, hire, find customers, partnerships, learn, network, recruit-able...)
- interests (topics: AI infra, fintech, devtools, climate, consumer...)
- days available (subset of ${TECH_WEEK_DAYS.join(", ")})
- neighborhoods preferred (optional)
- socialEnergy (low=~2 events/day, medium=~4, high=~6)
- avoid (anything to skip)

Rules:
- If the user pastes a bio/LinkedIn, extract everything you can in one shot.
- Ask at most ONE crisp follow-up per turn, only for what materially changes curation (usually goals + days + energy).
- Set ready=true as soon as you have role/oneLiner, at least one goal, some interests, and days. Don't over-collect.
- Always return the FULL cumulative profile (merge with what you already knew), not just the delta.
- Normalize days to ISO (YYYY-MM-DD). "all week" => all 7 days. "tuesday" => 2026-06-02, etc.

Return JSON: {"reply": string, "ready": boolean, "profile": {...}}.`;

export async function profileTurn(
  history: ChatMessage[],
  knownProfile?: Partial<UserProfile>,
): Promise<ProfileTurn> {
  const seed: ChatMessage[] = knownProfile
    ? [{ role: "system", content: `Known so far: ${JSON.stringify(knownProfile)}` }]
    : [];
  return chatJSON(
    [{ role: "system", content: SYSTEM }, ...seed, ...history],
    ProfileTurnSchema,
    { temperature: 0.5 },
  );
}

/** Merge a ProfileTurn result into a stored UserProfile. */
export function mergeProfile(
  id: string,
  turn: ProfileTurn,
  prev?: UserProfile,
): UserProfile {
  const p = turn.profile;
  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))];
  return {
    id,
    role: p.role ?? prev?.role,
    oneLiner: p.oneLiner ?? prev?.oneLiner,
    goals: uniq([...(prev?.goals ?? []), ...p.goals]),
    interests: uniq([...(prev?.interests ?? []), ...p.interests]),
    days: uniq([...(prev?.days ?? []), ...p.days]).sort(),
    neighborhoods: uniq([...(prev?.neighborhoods ?? []), ...p.neighborhoods]),
    socialEnergy: p.socialEnergy ?? prev?.socialEnergy ?? "medium",
    avoid: uniq([...(prev?.avoid ?? []), ...p.avoid]),
    updatedAt: new Date().toISOString(),
  };
}
