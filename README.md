# MS Hack

Hosted Postgres ingestion and matching service for NYC Tech Week events.

## Current Direction

We are starting from scratch with hosted Postgres, not migrating the local SQLite prototype.

The important product decision: store the raw Tech Week payload, but also normalize the fields we know we will query.

## Tech Week Data We Can Store

From Tech Week's public calendar event endpoint:

```text
https://www.tech-week.com/calendar/api/trpc/calendar.events
```

Each event gives us:

```text
id
city
date
time
location
name
company
externalHref
isInviteOnly
sponsorTier
facets.time.label
facets.locations[].label
facets.hosts[].key
facets.hosts[].label
facets.hosts[].role
```

Tracks are not returned inside the event object. Track membership is inferred by calling the same Tech Week event endpoint with `track: [slug]`.

The track list itself is parsed from:

```text
https://www.tech-week.com/calendar/nyc
```

Current parsed NYC tracks:

```text
ai-infra
hackathons
fintech
students
engineers
founders
gtm
investors
```

## Database Model

```text
tech_week_events
tracks
event_tracks
hosts
event_hosts
rsvp_checks
```

We store direct fields for filtering and raw JSON for safety. We do not pretend Tech Week gives us topics, audience, or intent. Those are derived later from:

```text
event name
host/company
cohosts
track
RSVP page description, when available
```

For the hackathon demo, each stored event also gets simple inferred fields:

```text
audience
topic
format
intent
keywords
summary
```

## Setup

Create `.env`:

```bash
DB_URL=postgresql://...
AZURE_AI_ENDPOINT=https://your-resource.services.ai.azure.com/openai/v1
AZURE_AI_KEY=...
AZURE_AI_MODEL=gpt-5.5
```

If your DB password contains `@`, URL-encode it as `%40`.

Install dependencies:

```bash
npm install
```

Run:

```bash
npm run db:setup
npm run sample -- --limit 10
npm run sync:day -- --date 2026-06-04
npm run scrape -- "scrape 10 founder and investor events today"
npm run sync
npm run serve
```

Open:

```text
http://127.0.0.1:8000
```

The chat endpoint uses Azure to parse natural language into:

```text
date
timeWindow
audience
topic
format
intent
keywords
```

Then Postgres returns deterministic scored matches.

Inspect:

```bash
npm run tracks:source
npm run tracks
npm run events -- --date 2026-06-04 --limit 10
npm run events -- --limit 10
npm test
```

Hackathon scraping demo:

```bash
npm run scrape -- "first 10 founder events today"
npm run scrape -- "AI infra events today" --limit 5
```

The scrape command asks Azure to convert the plain text into Tech Week API filters:

```text
day
track
q
limit
```

Then it fetches matching Tech Week events and stores that slice in Postgres.
