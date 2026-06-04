// POST /api/ingest — [component #1 trigger]
// Pulls the full Tech Week catalog and upserts it into Cosmos. Called by the
// Azure Functions timer every 12h, or manually for a fresh load.

import { NextResponse } from "next/server";
import { fetchAll, TECH_WEEK_DAYS } from "@/lib/techweek";
import { upsertEvents } from "@/lib/cosmos";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const days: string[] = Array.isArray(body.days) ? body.days : TECH_WEEK_DAYS;
    const city: string = body.city ?? "nyc";

    const events = await fetchAll(days, city);
    const stored = await upsertEvents(events);

    return NextResponse.json({
      ok: true,
      fetched: events.length,
      stored,
      days,
      city,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

// Allow GET for easy cron/manual pings.
export async function GET() {
  return POST(new Request("http://internal/ingest", { method: "POST", body: "{}" }));
}
