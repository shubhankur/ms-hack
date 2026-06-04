import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackParseScrapeQuery,
  fallbackParseUserEventQuery,
  normalizeParsedQuery,
  normalizeScrapePlan,
} from "../src/llm.js";
import { normalizeUserQuery, scoreEvent } from "../src/matcher.js";

test("normalizeUserQuery keeps useful matching tokens", () => {
  assert.equal(
    normalizeUserQuery("AI infra + founder events near Flatiron!"),
    "ai infra + founder events near flatiron"
  );
});

test("normalizeParsedQuery keeps only supported filter values", () => {
  const parsed = normalizeParsedQuery({
    date: "2026-06-04",
    timeWindow: { start: "14:00:00", end: "16:00:00" },
    audience: ["founders", "tourists"],
    topic: ["ai", "unknown"],
    format: ["pitch"],
    intent: ["fundraising"],
    keywords: ["seed", "vc"],
  });

  assert.deepEqual(parsed, {
    date: "2026-06-04",
    timeWindow: { start: "14:00:00", end: "16:00:00" },
    audience: ["founders"],
    topic: ["ai"],
    format: ["pitch"],
    intent: ["fundraising"],
    keywords: ["seed", "vc"],
  });
});

test("scoreEvent rewards matching audience intent and RSVP", () => {
  const scored = scoreEvent(
    {
      id: 1,
      name: "Founder Pitch Day",
      start_time: "14:00:00",
      rsvp_url: "https://example.com",
      audience: ["founders"],
      intent: ["fundraising"],
      topic: [],
      keywords: ["pitch"],
      tracks: [],
      hosts: [],
    },
    {
      audience: ["founders"],
      intent: ["fundraising"],
      topic: [],
      format: [],
      keywords: [],
    }
  );

  assert.equal(scored.score, 28);
  assert.deepEqual(scored.reasons, [
    "audience: founders",
    "intent: fundraising",
    "has RSVP link",
  ]);
});

test("fallback parser reads follow-up messages with prior context", () => {
  const parsed = fallbackParseUserEventQuery("make it 2-4 pm", {
    messages: ["I am a founder raising funds", "make it 2-4 pm"],
  });

  assert.deepEqual(parsed.audience, ["founders"]);
  assert.deepEqual(parsed.intent, ["fundraising"]);
  assert.deepEqual(parsed.timeWindow, { start: "14:00:00", end: "16:00:00" });
});

test("normalizeScrapePlan keeps only Tech Week scraper filters", () => {
  const plan = normalizeScrapePlan(
    {
      day: "2026-06-04",
      track: ["founders", "tourists"],
      q: " Example VC ",
      limit: 99,
    },
    {
      tracks: [{ slug: "founders" }, { slug: "investors" }],
      limitFallback: 10,
    }
  );

  assert.deepEqual(plan, {
    day: "2026-06-04",
    track: ["founders"],
    q: "Example VC",
    limit: 50,
  });
});

test("fallback scrape parser maps fundraising text to track filters", () => {
  const plan = fallbackParseScrapeQuery("first 7 founder events for raising capital today", {
    tracks: [{ slug: "founders" }, { slug: "investors" }, { slug: "engineers" }],
  });

  assert.deepEqual(plan.track, ["founders", "investors"]);
  assert.equal(plan.limit, 7);
});
