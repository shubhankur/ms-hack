// POST /api/rsvp — [component #4]
// Body: { profile, picks }. Returns assisted RSVP drafts (message + deep-link).

import { NextResponse } from "next/server";
import { draftRsvps } from "@/lib/rsvp";
import type { AgendaItem, UserProfile } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { profile, picks } = (await req.json()) as {
      profile: UserProfile;
      picks: AgendaItem[];
    };
    if (!profile?.id || !Array.isArray(picks)) {
      return NextResponse.json({ ok: false, error: "profile and picks required" }, { status: 400 });
    }
    const drafts = await draftRsvps(picks, profile);
    return NextResponse.json({ ok: true, drafts });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
