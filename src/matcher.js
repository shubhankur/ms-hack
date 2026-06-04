import { searchEvents } from "./db.js";

export async function recommendEvents({ message, limit = 10 }) {
  const query = normalizeUserQuery(message);
  const rows = await searchEvents({ query, limit });
  return rows.map(formatEvent);
}

export function normalizeUserQuery(message) {
  return String(message || "")
    .toLowerCase()
    .replace(/[^a-z0-9+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatEvent(row) {
  return {
    id: Number(row.id),
    name: row.name,
    company: row.company,
    date: row.event_date,
    time: row.start_time,
    location: row.location,
    rsvpUrl: row.rsvp_url,
    isInviteOnly: row.is_invite_only,
    sponsorTier: row.sponsor_tier,
    timeLabel: row.time_label,
    tracks: row.tracks || [],
    hosts: row.hosts || [],
    audience: row.audience || [],
    topic: row.topic || [],
    format: row.format,
    intent: row.intent || [],
    keywords: row.keywords || [],
    summary: row.summary,
    rank: row.rank ? Number(row.rank) : null,
  };
}
