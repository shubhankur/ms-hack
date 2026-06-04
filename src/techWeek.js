import { techWeekBaseUrl, techWeekCity, userAgent } from "./config.js";
import {
  addEventTrack,
  getPool,
  setupDatabase,
  upsertEvent,
  upsertTracks,
} from "./db.js";

const EVENT_ENDPOINT = `${techWeekBaseUrl}/api/trpc/calendar.events`;

const defaultInput = {
  q: "",
  featured: false,
  day: "all",
  track: [],
  sponsor: [],
  theme: [],
  format: [],
  location: [],
  time: [],
  host: [],
  sortBy: "time",
  sortOrder: "asc",
};

export async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/json",
      "user-agent": userAgent,
    },
  });
  if (!response.ok) {
    throw new Error(`Tech Week request failed ${response.status}: ${url}`);
  }
  return response.text();
}

export async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

export function buildEventsUrl({
  city = techWeekCity,
  cursor = 1,
  day = "all",
  track = [],
} = {}) {
  const input = { city, ...defaultInput, day, track, cursor };
  const params = new URLSearchParams({
    input: JSON.stringify(input),
  });
  return `${EVENT_ENDPOINT}?${params.toString()}`;
}

export async function fetchEventsPage(options = {}) {
  const payload = await fetchJson(buildEventsUrl(options));
  const data = payload?.result?.data;
  if (!data || !Array.isArray(data.results)) {
    throw new Error("Unexpected Tech Week events response shape");
  }
  return data;
}

export async function fetchAllEvents(options = {}) {
  const events = [];
  let cursor = 1;
  while (true) {
    const page = await fetchEventsPage({ ...options, cursor });
    events.push(...page.results);
    if (page.page * page.perPage >= page.total || page.results.length === 0) {
      return events;
    }
    cursor = page.page + 1;
  }
}

export async function fetchTracks({ city = techWeekCity } = {}) {
  const sourceUrl = `${techWeekBaseUrl}/${city}`;
  const html = await fetchText(sourceUrl);
  return parseTracksFromHtml(html, { city, sourceUrl });
}

export function parseTracksFromHtml(html, { city = techWeekCity, sourceUrl = null } = {}) {
  const tracks = new Map();
  const escapedCity = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `href="/calendar/${escapedCity}/tracks/([^"]+)"(?:(?!href="/calendar/${escapedCity}/tracks/).)*?<h3[^>]*>([^<]+)</h3>`,
    "gs"
  );

  for (const match of html.matchAll(pattern)) {
    const slug = decodeHtml(match[1]).trim();
    const label = decodeHtml(match[2]).trim();
    if (slug && label) {
      tracks.set(slug, { slug, label, sourceUrl });
    }
  }

  return [...tracks.values()];
}

export function normalizeEvent(raw, { tracks = [] } = {}) {
  const facets = raw.facets || {};
  const hosts = Array.isArray(facets.hosts)
    ? facets.hosts
        .filter((host) => host?.key && host?.label)
        .map((host) => ({
          key: String(host.key),
          label: String(host.label).trim(),
          role: String(host.role || "unknown"),
        }))
    : [];

  const locationLabels = Array.isArray(facets.locations)
    ? facets.locations
        .map((location) => location?.label)
        .filter(Boolean)
        .map(String)
    : [];

  const timeLabel =
    facets.time && typeof facets.time === "object" ? facets.time.label || null : null;

  const inferred = inferDemoFields(raw, { hosts, locationLabels, timeLabel, tracks });

  const searchParts = [
    raw.name,
    raw.company,
    raw.city,
    raw.location,
    raw.sponsorTier,
    timeLabel,
    ...locationLabels,
    ...hosts.map((host) => host.label),
    ...tracks.flatMap((track) => [track.slug, track.label]),
    ...inferred.audience,
    ...inferred.topic,
    inferred.format,
    ...inferred.intent,
    ...inferred.keywords,
    inferred.summary,
  ];

  return {
    id: Number(raw.id),
    city: raw.city,
    date: raw.date || null,
    time: raw.time || null,
    location: raw.location || null,
    name: String(raw.name || "").trim(),
    company: raw.company ? String(raw.company).trim() : null,
    rsvpUrl: raw.externalHref || null,
    isInviteOnly: Boolean(raw.isInviteOnly),
    sponsorTier: raw.sponsorTier || null,
    timeLabel,
    locationLabels,
    hosts,
    ...inferred,
    raw,
    searchText: searchParts.filter(Boolean).join(" ").toLowerCase(),
  };
}

export function inferDemoFields(raw, { hosts = [], tracks = [] } = {}) {
  const trackSlugs = tracks.map((track) => track.slug);
  const trackLabels = tracks.map((track) => track.label);
  const text = [
    raw.name,
    raw.company,
    raw.location,
    ...hosts.map((host) => host.label),
    ...trackSlugs,
    ...trackLabels,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const audience = unique([
    ...valuesWhen(trackSlugs.includes("founders"), ["founders"]),
    ...valuesWhen(trackSlugs.includes("investors"), ["investors"]),
    ...valuesWhen(trackSlugs.includes("engineers"), ["engineers"]),
    ...valuesWhen(trackSlugs.includes("students"), ["students"]),
    ...valuesWhen(trackSlugs.includes("gtm"), ["gtm"]),
    ...valuesWhen(/\b(founder|startup|operator|ceo)\b/.test(text), ["founders"]),
    ...valuesWhen(/\b(vc|investor|venture|capital|angel)\b/.test(text), ["investors"]),
    ...valuesWhen(/\b(engineer|developer|builder|cto|technical)\b/.test(text), ["engineers"]),
    ...valuesWhen(/\b(student|college|university)\b/.test(text), ["students"]),
  ]).slice(0, 4);

  const topic = unique([
    ...valuesWhen(trackSlugs.includes("ai-infra"), ["ai", "ai-infra"]),
    ...valuesWhen(trackSlugs.includes("fintech"), ["fintech"]),
    ...valuesWhen(trackSlugs.includes("hackathons"), ["hackathon"]),
    ...valuesWhen(trackSlugs.includes("engineers"), ["engineering"]),
    ...valuesWhen(trackSlugs.includes("gtm"), ["sales", "marketing"]),
    ...valuesWhen(trackSlugs.includes("investors"), ["venture"]),
    ...valuesWhen(/\b(ai|artificial intelligence|llm|agent)\b/.test(text), ["ai"]),
    ...valuesWhen(/\b(infra|infrastructure|cloud|data)\b/.test(text), ["infrastructure"]),
    ...valuesWhen(/\b(fintech|payment|bank|finance)\b/.test(text), ["fintech"]),
    ...valuesWhen(/\b(crypto|web3|blockchain)\b/.test(text), ["crypto"]),
    ...valuesWhen(/\b(devtool|developer|api|code|engineering)\b/.test(text), ["devtools"]),
    ...valuesWhen(/\b(health|bio|biotech|med)\b/.test(text), ["health"]),
    ...valuesWhen(/\b(enterprise|b2b|saas)\b/.test(text), ["enterprise"]),
  ]).slice(0, 5);

  const format = inferFormat(text, trackSlugs);
  const intent = unique([
    ...valuesWhen(["mixer", "happy-hour", "dinner", "breakfast", "party"].includes(format), [
      "networking",
    ]),
    ...valuesWhen(["panel", "fireside", "workshop", "demo"].includes(format), ["learning"]),
    ...valuesWhen(format === "hackathon", ["building"]),
    ...valuesWhen(/\b(fundraising|raise|capital|investor|vc|pitch)\b/.test(text), [
      "fundraising",
    ]),
    ...valuesWhen(/\b(hiring|talent|recruit)\b/.test(text), ["hiring"]),
    ...valuesWhen(/\b(party|social|happy hour)\b/.test(text), ["social"]),
  ]);

  const keywords = unique([
    ...trackSlugs,
    ...extractKeywords(text),
  ]).slice(0, 12);

  return {
    audience,
    topic,
    format,
    intent: intent.length > 0 ? intent : ["networking"],
    keywords,
    summary: buildSummary(raw, { audience, topic, format }),
  };
}

export async function syncTechWeek({ city = techWeekCity } = {}) {
  await setupDatabase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const tracks = await fetchTracks({ city });
    await upsertTracks(client, tracks);
    if (tracks.length > 0) {
      await client.query("DELETE FROM event_tracks WHERE track_slug = ANY($1::text[])", [
        tracks.map((track) => track.slug),
      ]);
    }

    const allEvents = await fetchAllEvents({ city });
    for (const rawEvent of allEvents) {
      await upsertEvent(client, normalizeEvent(rawEvent));
    }

    const trackCounts = {};
    for (const track of tracks) {
      const trackEvents = await fetchAllEvents({ city, track: [track.slug] });
      trackCounts[track.slug] = trackEvents.length;
      for (const rawEvent of trackEvents) {
        const event = normalizeEvent(rawEvent);
        await upsertEvent(client, event);
        await addEventTrack(client, event.id, track.slug);
      }
    }

    await client.query("COMMIT");
    return {
      city,
      eventCount: allEvents.length,
      trackCount: tracks.length,
      trackCounts,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function syncSampleEvents({ city = techWeekCity, limit = 10 } = {}) {
  await setupDatabase();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const tracks = await fetchTracks({ city });
    await upsertTracks(client, tracks);

    const trackEventPages = [];
    for (const track of tracks) {
      const page = await fetchEventsPage({ city, track: [track.slug] });
      trackEventPages.push({ track, events: page.results });
    }

    const selected = new Map();
    let index = 0;
    while (selected.size < limit) {
      let hadEventThisRound = false;
      for (const page of trackEventPages) {
        const rawEvent = page.events[index];
        if (!rawEvent) {
          continue;
        }
        hadEventThisRound = true;

        const id = Number(rawEvent.id);
        if (!selected.has(id)) {
          selected.set(id, { rawEvent, tracks: new Map() });
        }
        selected.get(id).tracks.set(page.track.slug, page.track);

        if (selected.size >= limit) {
          break;
        }
      }

      if (!hadEventThisRound) {
        break;
      }
      index += 1;
    }

    const events = [];
    for (const item of selected.values()) {
      const eventTracks = [...item.tracks.values()];
      const event = normalizeEvent(item.rawEvent, { tracks: eventTracks });
      await upsertEvent(client, event);
      for (const track of eventTracks) {
        await addEventTrack(client, event.id, track.slug);
      }
      events.push(toEventPreview(event, eventTracks));
    }

    await client.query("COMMIT");
    return { city, inserted: events.length, events };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function syncEventsForDay({ city = techWeekCity, date } = {}) {
  if (!date) {
    throw new Error("Missing date for day sync");
  }

  await setupDatabase();

  const tracks = await fetchTracks({ city });
  const allEvents = (await fetchAllEvents({ city, day: date })).filter(
    (event) => event.date === date
  );
  const selected = new Map(
    allEvents.map((rawEvent) => [
      Number(rawEvent.id),
      { rawEvent, tracks: new Map() },
    ])
  );
  const trackCounts = {};

  for (const track of tracks) {
    const trackEvents = (await fetchAllEvents({ city, day: date, track: [track.slug] })).filter(
      (event) => event.date === date
    );
    trackCounts[track.slug] = trackEvents.length;

    for (const rawEvent of trackEvents) {
      const id = Number(rawEvent.id);
      if (!selected.has(id)) {
        selected.set(id, { rawEvent, tracks: new Map() });
      }
      selected.get(id).tracks.set(track.slug, track);
    }
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await upsertTracks(client, tracks);

    const eventIds = [...selected.keys()];
    if (eventIds.length > 0) {
      await client.query("DELETE FROM event_tracks WHERE event_id = ANY($1::bigint[])", [
        eventIds,
      ]);
    }

    const events = [];
    for (const item of selected.values()) {
      const eventTracks = [...item.tracks.values()];
      const event = normalizeEvent(item.rawEvent, { tracks: eventTracks });
      await upsertEvent(client, event);
      for (const track of eventTracks) {
        await addEventTrack(client, event.id, track.slug);
      }
      events.push(toEventPreview(event, eventTracks));
    }

    await client.query("COMMIT");
    return {
      city,
      date,
      inserted: events.length,
      withRsvp: events.filter((event) => event.rsvpUrl).length,
      trackCounts,
      preview: events.slice(0, 20),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function inferFormat(text, trackSlugs) {
  if (/\bhackathon\b/.test(text) || trackSlugs.includes("hackathons")) return "hackathon";
  if (/\bbreakfast\b/.test(text)) return "breakfast";
  if (/\blunch\b/.test(text)) return "lunch";
  if (/\bdinner\b/.test(text)) return "dinner";
  if (/\bhappy hour\b/.test(text)) return "happy-hour";
  if (/\bpanel\b/.test(text)) return "panel";
  if (/\bworkshop\b/.test(text)) return "workshop";
  if (/\bdemo|showcase\b/.test(text)) return "demo";
  if (/\bpitch\b/.test(text)) return "pitch";
  if (/\bfireside\b/.test(text)) return "fireside";
  if (/\bparty\b/.test(text)) return "party";
  if (/\bmixer|networking|meetup\b/.test(text)) return "mixer";
  return "meetup";
}

function buildSummary(raw, { audience, topic, format }) {
  const name = String(raw.name || "").trim();
  const company = raw.company ? String(raw.company).trim() : "";
  const host = company ? ` by ${company}` : "";
  const bestFor = unique([...audience, ...topic]).slice(0, 3).join(", ");
  return `${name}${host}. ${format} best matched for ${
    bestFor || "tech week attendees"
  }.`;
}

function extractKeywords(text) {
  const stopWords = new Set([
    "and",
    "the",
    "for",
    "with",
    "from",
    "into",
    "nyc",
    "new",
    "york",
    "city",
    "tech",
    "week",
    "event",
    "events",
  ]);

  return text
    .replace(/[^a-z0-9+\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function toEventPreview(event, tracks) {
  return {
    id: event.id,
    name: event.name,
    company: event.company,
    date: event.date,
    time: event.time,
    location: event.location,
    rsvpUrl: event.rsvpUrl,
    tracks: tracks.map((track) => track.slug),
    audience: event.audience,
    topic: event.topic,
    format: event.format,
    intent: event.intent,
    keywords: event.keywords,
    summary: event.summary,
  };
}

function valuesWhen(condition, values) {
  return condition ? values : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
