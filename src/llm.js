import {
  appTimezone,
  azureAiEndpoint,
  azureAiKey,
  azureAiModel,
  hasAzureAiConfig,
  todayDateInTimezone,
} from "./config.js";

const allowed = {
  audience: ["founders", "investors", "engineers", "students", "gtm"],
  topic: [
    "ai",
    "ai-infra",
    "fintech",
    "hackathon",
    "engineering",
    "sales",
    "marketing",
    "venture",
    "infrastructure",
    "crypto",
    "devtools",
    "health",
    "enterprise",
  ],
  format: [
    "meetup",
    "mixer",
    "happy-hour",
    "dinner",
    "lunch",
    "breakfast",
    "hackathon",
    "demo",
    "pitch",
    "panel",
    "workshop",
    "fireside",
    "party",
  ],
  intent: ["networking", "fundraising", "learning", "building", "hiring", "social"],
};

export async function parseUserEventQuery(message, { messages = [] } = {}) {
  if (!hasAzureAiConfig()) {
    return fallbackParseUserEventQuery(message, { messages });
  }

  const chatMessages = buildChatMessages(message, messages);
  const endpoint = azureAiEndpoint.replace(/\/$/, "");
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": azureAiKey,
    },
    body: JSON.stringify({
      model: azureAiModel,
      messages: chatMessages,
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Azure query parse failed ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = JSON.parse(text);
  const content = payload.choices?.[0]?.message?.content || payload.choices?.[0]?.content;
  if (!content) {
    throw new Error("Azure query parse returned no content");
  }

  return normalizeParsedQuery(JSON.parse(content));
}

export async function parseScrapeQuery(message, { tracks = [], limitFallback = 10 } = {}) {
  if (!hasAzureAiConfig()) {
    return fallbackParseScrapeQuery(message, { tracks, limitFallback });
  }

  const endpoint = azureAiEndpoint.replace(/\/$/, "");
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": azureAiKey,
    },
    body: JSON.stringify({
      model: azureAiModel,
      messages: [
        {
          role: "system",
          content: buildScrapeSystemPrompt(tracks, limitFallback),
        },
        {
          role: "user",
          content: String(message || ""),
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Azure scrape parse failed ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = JSON.parse(text);
  const content = payload.choices?.[0]?.message?.content || payload.choices?.[0]?.content;
  if (!content) {
    throw new Error("Azure scrape parse returned no content");
  }

  return normalizeScrapePlan(JSON.parse(content), { tracks, limitFallback });
}

export function normalizeParsedQuery(parsed) {
  const today = todayDateInTimezone(appTimezone);
  const date = isIsoDate(parsed?.date) ? parsed.date : today;

  return {
    date,
    timeWindow: normalizeTimeWindow(parsed?.timeWindow),
    audience: normalizeAllowedArray(parsed?.audience, allowed.audience),
    topic: normalizeAllowedArray(parsed?.topic, allowed.topic),
    format: normalizeAllowedArray(parsed?.format, allowed.format),
    intent: normalizeAllowedArray(parsed?.intent, allowed.intent),
    keywords: normalizeKeywords(parsed?.keywords),
  };
}

export function normalizeScrapePlan(parsed, { tracks = [], limitFallback = 10 } = {}) {
  const today = todayDateInTimezone(appTimezone);
  const trackChoices = knownTrackSlugs(tracks);
  const day = parsed?.day === "all" ? "all" : isIsoDate(parsed?.day) ? parsed.day : today;
  const limit = clampNumber(parsed?.limit, limitFallback, 1, 50);

  return {
    day,
    track: normalizeAllowedArray(parsed?.track, trackChoices),
    q: normalizeSearchQuery(parsed?.q),
    limit,
  };
}

export function fallbackParseUserEventQuery(message, { messages = [] } = {}) {
  const text = normalizeUserMessages(message, messages).join(" ").toLowerCase();
  return normalizeParsedQuery({
    date: text.includes("tomorrow") ? null : todayDateInTimezone(appTimezone),
    timeWindow: parseTimeWindow(text),
    audience: [
      ...valueIf(/\bfounder|startup|operator|ceo\b/.test(text), "founders"),
      ...valueIf(/\binvestor|vc|venture|angel\b/.test(text), "investors"),
      ...valueIf(/\bengineer|developer|builder|technical\b/.test(text), "engineers"),
      ...valueIf(/\bstudent|college|university\b/.test(text), "students"),
      ...valueIf(/\bgtm|sales|marketing\b/.test(text), "gtm"),
    ],
    topic: [
      ...valueIf(/\bai|llm|agent\b/.test(text), "ai"),
      ...valueIf(/\bfintech|finance|payment\b/.test(text), "fintech"),
      ...valueIf(/\bhackathon\b/.test(text), "hackathon"),
      ...valueIf(/\bdevtool|api|code\b/.test(text), "devtools"),
      ...valueIf(/\bhealth|bio|medical\b/.test(text), "health"),
    ],
    format: [
      ...valueIf(/\bpitch\b/.test(text), "pitch"),
      ...valueIf(/\bpanel\b/.test(text), "panel"),
      ...valueIf(/\bdemo|showcase\b/.test(text), "demo"),
      ...valueIf(/\bdinner\b/.test(text), "dinner"),
      ...valueIf(/\blunch\b/.test(text), "lunch"),
      ...valueIf(/\bbreakfast\b/.test(text), "breakfast"),
      ...valueIf(/\bhappy hour\b/.test(text), "happy-hour"),
      ...valueIf(/\bmixer\b/.test(text), "mixer"),
    ],
    intent: [
      ...valueIf(/\brais|fundrais|capital|investor|vc|pitch\b/.test(text), "fundraising"),
      ...valueIf(/\bnetwork|meet|connect\b/.test(text), "networking"),
      ...valueIf(/\blearn|panel|workshop\b/.test(text), "learning"),
      ...valueIf(/\bbuild|hackathon\b/.test(text), "building"),
    ],
    keywords: text.split(/\s+/).filter((word) => word.length > 3).slice(0, 8),
  });
}

export function fallbackParseScrapeQuery(message, { tracks = [], limitFallback = 10 } = {}) {
  const text = String(message || "").toLowerCase();
  const track = [
    ...valueIf(/\bfounder|startup|operator|ceo\b/.test(text), "founders"),
    ...valueIf(/\binvestor|vc|venture|angel|rais|fundrais|capital\b/.test(text), "investors"),
    ...valueIf(/\bengineer|developer|builder|technical\b/.test(text), "engineers"),
    ...valueIf(/\bstudent|college|university\b/.test(text), "students"),
    ...valueIf(/\bgtm|sales|marketing\b/.test(text), "gtm"),
    ...valueIf(/\bai|llm|agent|infra\b/.test(text), "ai-infra"),
    ...valueIf(/\bfintech|finance|payment\b/.test(text), "fintech"),
    ...valueIf(/\bhackathon|hack\b/.test(text), "hackathons"),
  ];

  return normalizeScrapePlan(
    {
      day: parseScrapeDay(text),
      track,
      q: "",
      limit: parseScrapeLimit(text) || limitFallback,
    },
    { tracks, limitFallback }
  );
}

function buildScrapeSystemPrompt(tracks, limitFallback) {
  const today = todayDateInTimezone(appTimezone);
  const trackList = knownTrackSlugs(tracks).join(", ");
  return `
You convert a user's natural-language NYC Tech Week scraping request into Tech Week API filters.
Current date is ${today}. Timezone is ${appTimezone}.

Return JSON only with this exact shape:
{
  "day": "YYYY-MM-DD",
  "track": [],
  "q": "",
  "limit": ${limitFallback}
}

Allowed track values: ${trackList}

Rules:
- Use "day": "${today}" for today or when no day is given.
- Use "day": "all" only if the user asks for all days or the whole event.
- Track must only contain allowed track slugs.
- Map "AI", "LLM", or "infra" to "ai-infra".
- Map "builder" or "developer" to "engineers"; map "hackathon" to "hackathons".
- Map "raising", "fundraising", "VC", or "capital" to "investors"; keep "founders" too if the user says founder.
- Use q only for a specific host, company, venue, or phrase not represented by day/track.
- Use limit from the user if present. Otherwise use ${limitFallback}. Never exceed 50.
`.trim();
}

function knownTrackSlugs(tracks) {
  const source = tracks.length > 0
    ? tracks.map((track) => track.slug)
    : ["ai-infra", "hackathons", "fintech", "students", "engineers", "founders", "gtm", "investors"];
  return [...new Set(source.map(String).filter(Boolean))];
}

function parseScrapeDay(text) {
  if (/\ball\b|whole event|entire event/.test(text)) {
    return "all";
  }

  const isoDate = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (isoDate) {
    return isoDate;
  }

  if (text.includes("tomorrow")) {
    return addDays(todayDateInTimezone(appTimezone), 1);
  }

  return todayDateInTimezone(appTimezone);
}

function parseScrapeLimit(text) {
  const match = text.match(/\b(?:first|top|limit|show|get|scrape)\s+(\d{1,2})\b/) ||
    text.match(/\b(\d{1,2})\s+events?\b/);
  return match ? Number(match[1]) : null;
}

function buildSystemPrompt() {
  const today = todayDateInTimezone(appTimezone);
  return `
You convert a user's natural-language NYC Tech Week event request into JSON filters.
Current date is ${today}. Timezone is ${appTimezone}.

Return JSON only with this exact shape:
{
  "date": "YYYY-MM-DD",
  "timeWindow": {"start": "HH:MM:SS", "end": "HH:MM:SS"},
  "audience": [],
  "topic": [],
  "format": [],
  "intent": [],
  "keywords": []
}

Allowed audience: ${allowed.audience.join(", ")}
Allowed topic: ${allowed.topic.join(", ")}
Allowed format: ${allowed.format.join(", ")}
Allowed intent: ${allowed.intent.join(", ")}

Rules:
- You may receive multiple user messages. Treat them as one conversation.
- Preserve constraints from earlier messages unless a later message changes them.
- The latest user message wins when there is a conflict.
- If the user says today, use ${today}.
- If no date is given, use ${today}.
- If no time window is given, use {"start":"00:00:00","end":"23:59:59"}.
- Map "raising funds", "fundraise", "meet VCs", "investors" to intent "fundraising".
- Keep arrays small and precise. Unknown values go into keywords, not the enum arrays.
`.trim();
}

function buildChatMessages(message, messages) {
  const userMessages = normalizeUserMessages(message, messages);
  const priorMessages = userMessages.slice(0, -1).slice(-6);
  const latestMessage = userMessages.at(-1) || "";

  return [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    ...priorMessages.map((content) => ({
      role: "user",
      content: `Earlier user request: ${content}`,
    })),
    {
      role: "user",
      content: `Latest user request: ${latestMessage}`,
    },
  ];
}

function normalizeUserMessages(message, messages) {
  const values = Array.isArray(messages) ? messages : [];
  const normalized = values
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && item.role === "user") return item.content;
      return "";
    })
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const latest = String(message || "").trim();
  if (latest && normalized.at(-1) !== latest) {
    normalized.push(latest);
  }

  return normalized;
}

function normalizeAllowedArray(value, choices) {
  const values = Array.isArray(value) ? value : [];
  const choiceSet = new Set(choices);
  return [...new Set(values.map(String).map((item) => item.toLowerCase()).filter((item) => choiceSet.has(item)))];
}

function normalizeKeywords(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(String).map((item) => item.toLowerCase().trim()).filter(Boolean))].slice(0, 12);
}

function normalizeSearchQuery(value) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function normalizeTimeWindow(value) {
  const start = isTime(value?.start) ? value.start : "00:00:00";
  const end = isTime(value?.end) ? value.end : "23:59:59";
  return { start, end };
}

function parseTimeWindow(text) {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!match) {
    return { start: "00:00:00", end: "23:59:59" };
  }

  const firstPeriod = match[3] || match[6] || "";
  const secondPeriod = match[6] || firstPeriod;
  return {
    start: toTime(match[1], match[2], firstPeriod),
    end: toTime(match[4], match[5], secondPeriod),
  };
}

function toTime(hour, minute = "00", period = "") {
  let value = Number(hour);
  if (period === "pm" && value < 12) value += 12;
  if (period === "am" && value === 12) value = 0;
  return `${String(value).padStart(2, "0")}:${String(minute || "00").padStart(2, "0")}:00`;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
}

function valueIf(condition, value) {
  return condition ? [value] : [];
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
