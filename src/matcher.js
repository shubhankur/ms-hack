import { listEventsForMatch, searchEvents } from "./db.js";
import { parseUserEventQuery } from "./llm.js";

export async function recommendEvents({ message, limit = 10 }) {
  const query = normalizeUserQuery(message);
  const rows = await searchEvents({ query, limit });
  return rows.map(formatEvent);
}

export async function chatRecommendEvents({ message, messages = [], limit = 10 }) {
  const filters = await parseUserEventQuery(message, { messages });
  const rows = await listEventsForMatch({
    date: filters.date,
    startTime: filters.timeWindow.start,
    endTime: filters.timeWindow.end,
  });
  const events = rows
    .map((row) => scoreEvent(row, filters))
    .sort((a, b) => b.score - a.score || String(a.time).localeCompare(String(b.time)))
    .slice(0, limit);

  return {
    filters,
    events,
  };
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

export function scoreEvent(row, filters) {
  const event = formatEvent(row);
  const reasons = [];
  let score = 0;

  score += scoreArrayMatch("audience", event.audience, filters.audience, 12, reasons);
  score += scoreArrayMatch("intent", event.intent, filters.intent, 14, reasons);
  score += scoreArrayMatch("topic", event.topic, filters.topic, 8, reasons);
  score += scoreArrayMatch("track", event.tracks, [...filters.audience, ...filters.topic], 8, reasons);
  score += scoreArrayMatch("format", event.format ? [event.format] : [], filters.format, 5, reasons);
  score += scoreKeywordMatch(event, filters.keywords, reasons);

  if (event.rsvpUrl) {
    score += 2;
    reasons.push("has RSVP link");
  }

  return {
    ...event,
    score,
    reasons,
  };
}

function scoreArrayMatch(label, eventValues, filterValues, weight, reasons) {
  const matches = filterValues.filter((value) => eventValues.includes(value));
  if (matches.length === 0) return 0;
  reasons.push(`${label}: ${matches.join(", ")}`);
  return matches.length * weight;
}

function scoreKeywordMatch(event, keywords, reasons) {
  if (keywords.length === 0) return 0;
  const text = [
    event.name,
    event.company,
    event.location,
    event.summary,
    ...event.keywords,
    ...event.hosts,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const matches = keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
  if (matches.length === 0) return 0;
  reasons.push(`keywords: ${matches.slice(0, 4).join(", ")}`);
  return Math.min(matches.length, 4) * 3;
}
