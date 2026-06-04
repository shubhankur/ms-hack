// Tech Week ingestion client [component #1].
// Talks to the public tRPC endpoint that powers tech-week.com/calendar/<city>.
// No auth required. Paginates every day of the week and normalizes events.

import type { RawTechWeekEvent, TechWeekEvent } from "./types";

const BASE = "https://www.tech-week.com/calendar/api/trpc/calendar.events?batch=1";

/** Tech Week NYC 2026 runs June 1-7. Override via ingest options if needed. */
export const TECH_WEEK_DAYS = [
  "2026-06-01",
  "2026-06-02",
  "2026-06-03",
  "2026-06-04",
  "2026-06-05",
  "2026-06-06",
  "2026-06-07",
];

interface QueryInput {
  city: string;
  q: string;
  featured: boolean;
  day: string;
  track: string[];
  sponsor: string[];
  theme: string[];
  format: string[];
  location: string[];
  time: string[];
  host: string[];
  sortBy: string;
  sortOrder: string;
  cursor: number;
  direction: string;
}

function buildBody(day: string, cursor: number, city: string): string {
  const input: QueryInput = {
    city,
    q: "",
    featured: false,
    day,
    track: [],
    sponsor: [],
    theme: [],
    format: [],
    location: [],
    time: [],
    host: [],
    sortBy: "time",
    sortOrder: "asc",
    cursor,
    direction: "forward",
  };
  return JSON.stringify({ "0": input });
}

interface PageData {
  page: number;
  perPage: number;
  total: number;
  results: RawTechWeekEvent[];
}

async function fetchPage(day: string, cursor: number, city: string): Promise<PageData> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (compatible; tech-week-curator/1.0)",
    },
    body: buildBody(day, cursor, city),
    // Always hit the network; this runs server-side on a 12h cron.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`tech-week tRPC ${res.status} for day ${day} cursor ${cursor}`);
  }
  const json = (await res.json()) as Array<{ result: { data: PageData } }>;
  return json[0].result.data;
}

function normalize(raw: RawTechWeekEvent, ingestedAt: string): TechWeekEvent {
  return {
    id: raw.id,
    name: raw.name?.trim() ?? "",
    date: raw.date,
    time: raw.time,
    timeOfDay: raw.facets?.time?.label ?? "",
    location: raw.location ?? raw.facets?.locations?.[0]?.label ?? "",
    company: raw.company ?? "",
    hosts: raw.facets?.hosts ?? [],
    rsvpUrl: raw.externalHref,
    isInviteOnly: !!raw.isInviteOnly,
    sponsorTier: raw.sponsorTier ?? null,
    city: raw.city ?? "",
    ingestedAt,
  };
}

/** Fetch and normalize every event for a single day (all pages). */
export async function fetchDay(day: string, city = "nyc"): Promise<TechWeekEvent[]> {
  const ingestedAt = new Date().toISOString();
  const first = await fetchPage(day, 1, city);
  const pages = Math.max(1, Math.ceil(first.total / first.perPage));
  const all: RawTechWeekEvent[] = [...first.results];
  for (let cursor = 2; cursor <= pages; cursor++) {
    const p = await fetchPage(day, cursor, city);
    all.push(...p.results);
    if (p.results.length === 0) break; // safety
  }
  return all.map((r) => normalize(r, ingestedAt));
}

/** Fetch and normalize every event across all days. De-dupes by id. */
export async function fetchAll(
  days: string[] = TECH_WEEK_DAYS,
  city = "nyc",
): Promise<TechWeekEvent[]> {
  const seen = new Map<number, TechWeekEvent>();
  for (const day of days) {
    const evs = await fetchDay(day, city);
    for (const e of evs) if (!seen.has(e.id)) seen.set(e.id, e);
  }
  return [...seen.values()];
}
