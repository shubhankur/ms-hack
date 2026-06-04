// Assisted RSVP [component #4].
// Partiful hosts approve registrations, so we don't auto-submit — we draft a
// short, personalized note the user can paste/send in one click, plus the link.

import { z } from "zod";
import { chatJSON, MINI_DEPLOYMENT } from "./aoai";
import type { AgendaItem, RsvpDraft, UserProfile } from "./types";

const DraftSchema = z.object({
  drafts: z.array(z.object({ id: z.number(), message: z.string() })),
});

/**
 * Generate one short application/intro message per agenda pick. Tuned to read
 * like a real person, reference why they're a fit, and respect host approval.
 */
export async function draftRsvps(
  picks: AgendaItem[],
  profile: UserProfile,
): Promise<RsvpDraft[]> {
  if (picks.length === 0) return [];

  const compact = picks.map((p) => ({
    id: p.event.id,
    name: p.event.name,
    host: p.event.company,
    why: p.why,
  }));

  const system = `Write a SHORT RSVP/application note for each event, from this person to the host.
2-3 sentences, warm and specific, first person. Mention who they are and one concrete reason they'd add value or want to attend. No emojis, no "Dear", no signature. Return JSON {"drafts":[{"id","message"}]}.`;

  const user = `ME: ${profile.role ?? ""} — ${profile.oneLiner ?? ""}. Goals: ${profile.goals.join(", ")}.
EVENTS:
${JSON.stringify(compact)}`;

  const out = await chatJSON(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    DraftSchema,
    { deployment: MINI_DEPLOYMENT, temperature: 0.6 },
  );

  const byId = new Map(picks.map((p) => [p.event.id, p]));
  return out.drafts
    .map((d) => {
      const pick = byId.get(d.id);
      if (!pick) return null;
      return {
        eventId: d.id,
        eventName: pick.event.name,
        rsvpUrl: pick.event.rsvpUrl,
        message: d.message,
        isInviteOnly: pick.event.isInviteOnly,
      } satisfies RsvpDraft;
    })
    .filter((x): x is RsvpDraft => x !== null);
}
