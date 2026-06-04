// POST /api/curate — [component #3]
// Body: { profile }. Returns the curated agenda + the scored shortlist + the
// total catalog size (for the "1600 -> N" before/after story).
//
// Reads events from Cosmos; if Cosmos is empty/unconfigured it falls back to a
// live fetch so the curator is demoable before the 12h pipeline is wired.

import { NextResponse } from "next/server";
import { getEvents } from "@/lib/cosmos";
import { fetchAll } from "@/lib/techweek";
import { curate } from "@/lib/curate";
import type { TechWeekEvent, UserProfile } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { profile } = (await req.json()) as { profile: UserProfile };
    if (!profile?.id) {
      return NextResponse.json({ ok: false, error: "profile required" }, { status: 400 });
    }

    let events: TechWeekEvent[] = [];
    let source = "cosmos";
    try {
      events = await getEvents();
    } catch {
      events = [];
    }
    if (events.length === 0) {
      events = await fetchAll();
      source = "live";
    }

    const { shortlist, scored, agenda } = await curate(events, profile);

    return NextResponse.json({
      ok: true,
      source,
      totalEvents: events.length,
      shortlistSize: shortlist.length,
      scored,
      agenda,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
