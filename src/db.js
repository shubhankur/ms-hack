import pg from "pg";
import { requireDbUrl } from "./config.js";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDbUrl(),
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function setupDatabase() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS tech_week_events (
      id BIGINT PRIMARY KEY,
      city TEXT NOT NULL,
      event_date DATE,
      start_time TIME,
      location TEXT,
      name TEXT NOT NULL,
      company TEXT,
      rsvp_url TEXT,
      is_invite_only BOOLEAN NOT NULL DEFAULT FALSE,
      sponsor_tier TEXT,
      time_label TEXT,
      location_labels TEXT[] NOT NULL DEFAULT '{}',
      audience TEXT[] NOT NULL DEFAULT '{}',
      topic TEXT[] NOT NULL DEFAULT '{}',
      format TEXT,
      intent TEXT[] NOT NULL DEFAULT '{}',
      keywords TEXT[] NOT NULL DEFAULT '{}',
      summary TEXT,
      raw JSONB NOT NULL,
      search_text TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE tech_week_events ADD COLUMN IF NOT EXISTS rsvp_url TEXT;
    ALTER TABLE tech_week_events ADD COLUMN IF NOT EXISTS audience TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE tech_week_events ADD COLUMN IF NOT EXISTS topic TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE tech_week_events ADD COLUMN IF NOT EXISTS format TEXT;
    ALTER TABLE tech_week_events ADD COLUMN IF NOT EXISTS intent TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE tech_week_events ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE tech_week_events ADD COLUMN IF NOT EXISTS summary TEXT;

    CREATE TABLE IF NOT EXISTS tracks (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      source_url TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS event_tracks (
      event_id BIGINT NOT NULL REFERENCES tech_week_events(id) ON DELETE CASCADE,
      track_slug TEXT NOT NULL REFERENCES tracks(slug) ON DELETE CASCADE,
      PRIMARY KEY (event_id, track_slug)
    );

    CREATE TABLE IF NOT EXISTS hosts (
      host_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS event_hosts (
      event_id BIGINT NOT NULL REFERENCES tech_week_events(id) ON DELETE CASCADE,
      host_key TEXT NOT NULL REFERENCES hosts(host_key) ON DELETE CASCADE,
      role TEXT NOT NULL,
      PRIMARY KEY (event_id, host_key, role)
    );

    CREATE TABLE IF NOT EXISTS rsvp_checks (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES tech_week_events(id) ON DELETE CASCADE,
      rsvp_url TEXT,
      status TEXT NOT NULL,
      detail TEXT,
      raw JSONB,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_tech_week_events_date_time
      ON tech_week_events(event_date, start_time);

    CREATE INDEX IF NOT EXISTS idx_tech_week_events_search_text
      ON tech_week_events USING gin(to_tsvector('english', search_text));

    CREATE INDEX IF NOT EXISTS idx_tech_week_events_audience
      ON tech_week_events USING gin(audience);

    CREATE INDEX IF NOT EXISTS idx_tech_week_events_topic
      ON tech_week_events USING gin(topic);

    CREATE INDEX IF NOT EXISTS idx_tech_week_events_intent
      ON tech_week_events USING gin(intent);

    CREATE INDEX IF NOT EXISTS idx_event_tracks_track
      ON event_tracks(track_slug);
  `);
}

export async function upsertTracks(client, tracks) {
  for (const track of tracks) {
    await client.query(
      `
      INSERT INTO tracks (slug, label, source_url, synced_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (slug) DO UPDATE SET
        label = excluded.label,
        source_url = excluded.source_url,
        synced_at = now()
      `,
      [track.slug, track.label, track.sourceUrl]
    );
  }
}

export async function upsertEvent(client, event) {
  await client.query(
    `
    INSERT INTO tech_week_events (
      id, city, event_date, start_time, location, name, company, rsvp_url,
      is_invite_only, sponsor_tier, time_label, location_labels, audience, topic,
      format, intent, keywords, summary, raw, search_text,
      synced_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      city = excluded.city,
      event_date = excluded.event_date,
      start_time = excluded.start_time,
      location = excluded.location,
      name = excluded.name,
      company = excluded.company,
      rsvp_url = excluded.rsvp_url,
      is_invite_only = excluded.is_invite_only,
      sponsor_tier = excluded.sponsor_tier,
      time_label = excluded.time_label,
      location_labels = excluded.location_labels,
      audience = excluded.audience,
      topic = excluded.topic,
      format = excluded.format,
      intent = excluded.intent,
      keywords = excluded.keywords,
      summary = excluded.summary,
      raw = excluded.raw,
      search_text = excluded.search_text,
      synced_at = now()
    `,
    [
      event.id,
      event.city,
      event.date,
      event.time,
      event.location,
      event.name,
      event.company,
      event.rsvpUrl,
      event.isInviteOnly,
      event.sponsorTier,
      event.timeLabel,
      event.locationLabels,
      event.audience,
      event.topic,
      event.format,
      event.intent,
      event.keywords,
      event.summary,
      event.raw,
      event.searchText,
    ]
  );

  await client.query("DELETE FROM event_hosts WHERE event_id = $1", [event.id]);
  for (const host of event.hosts) {
    await client.query(
      `
      INSERT INTO hosts (host_key, label, synced_at)
      VALUES ($1, $2, now())
      ON CONFLICT (host_key) DO UPDATE SET
        label = excluded.label,
        synced_at = now()
      `,
      [host.key, host.label]
    );
    await client.query(
      `
      INSERT INTO event_hosts (event_id, host_key, role)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
      `,
      [event.id, host.key, host.role]
    );
  }
}

export async function addEventTrack(client, eventId, trackSlug) {
  await client.query(
    `
    INSERT INTO event_tracks (event_id, track_slug)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
    `,
    [eventId, trackSlug]
  );
}

export async function listTracks() {
  const result = await getPool().query(
    "SELECT slug, label FROM tracks ORDER BY label"
  );
  return result.rows;
}

export async function listEvents({ limit = 25, date = null } = {}) {
  const result = await getPool().query(
    `
    SELECT
      e.id,
      e.city,
      e.event_date,
      e.start_time,
      e.location,
      e.name,
      e.company,
      e.rsvp_url,
      e.is_invite_only,
      e.sponsor_tier,
      e.time_label,
      e.location_labels,
      e.audience,
      e.topic,
      e.format,
      e.intent,
      e.keywords,
      e.summary,
      e.synced_at,
      COALESCE(array_agg(DISTINCT et.track_slug) FILTER (WHERE et.track_slug IS NOT NULL), '{}') AS tracks,
      COALESCE(array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL), '{}') AS hosts
    FROM tech_week_events e
    LEFT JOIN event_tracks et ON et.event_id = e.id
    LEFT JOIN event_hosts eh ON eh.event_id = e.id
    LEFT JOIN hosts h ON h.host_key = eh.host_key
    WHERE ($2::date IS NULL OR e.event_date = $2::date)
    GROUP BY e.id
    ORDER BY e.event_date, e.start_time, e.name
    LIMIT $1
    `,
    [limit, date]
  );
  return result.rows;
}

export async function searchEvents({ query, limit = 10 }) {
  const result = await getPool().query(
    `
    SELECT
      e.id,
      e.city,
      e.event_date,
      e.start_time,
      e.location,
      e.name,
      e.company,
      e.rsvp_url,
      e.is_invite_only,
      e.sponsor_tier,
      e.time_label,
      e.location_labels,
      e.audience,
      e.topic,
      e.format,
      e.intent,
      e.keywords,
      e.summary,
      COALESCE(array_agg(DISTINCT et.track_slug) FILTER (WHERE et.track_slug IS NOT NULL), '{}') AS tracks,
      COALESCE(array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL), '{}') AS hosts,
      ts_rank(to_tsvector('english', e.search_text), plainto_tsquery('english', $1)) AS rank
    FROM tech_week_events e
    LEFT JOIN event_tracks et ON et.event_id = e.id
    LEFT JOIN event_hosts eh ON eh.event_id = e.id
    LEFT JOIN hosts h ON h.host_key = eh.host_key
    WHERE
      $1 = ''
      OR to_tsvector('english', e.search_text) @@ plainto_tsquery('english', $1)
      OR e.search_text ILIKE '%' || $1 || '%'
    GROUP BY e.id
    ORDER BY rank DESC NULLS LAST, e.event_date, e.start_time
    LIMIT $2
    `,
    [query, limit]
  );
  return result.rows;
}

export async function listEventsForMatch({ date, startTime, endTime, limit = 500 }) {
  const result = await getPool().query(
    `
    SELECT
      e.id,
      e.city,
      e.event_date,
      e.start_time,
      e.location,
      e.name,
      e.company,
      e.rsvp_url,
      e.is_invite_only,
      e.sponsor_tier,
      e.time_label,
      e.location_labels,
      e.audience,
      e.topic,
      e.format,
      e.intent,
      e.keywords,
      e.summary,
      COALESCE(array_agg(DISTINCT et.track_slug) FILTER (WHERE et.track_slug IS NOT NULL), '{}') AS tracks,
      COALESCE(array_agg(DISTINCT h.label) FILTER (WHERE h.label IS NOT NULL), '{}') AS hosts
    FROM tech_week_events e
    LEFT JOIN event_tracks et ON et.event_id = e.id
    LEFT JOIN event_hosts eh ON eh.event_id = e.id
    LEFT JOIN hosts h ON h.host_key = eh.host_key
    WHERE
      e.event_date = $1::date
      AND e.start_time >= $2::time
      AND e.start_time < $3::time
    GROUP BY e.id
    ORDER BY e.start_time, e.name
    LIMIT $4
    `,
    [date, startTime, endTime, limit]
  );
  return result.rows;
}
