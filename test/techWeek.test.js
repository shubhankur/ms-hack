import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvent, parseTracksFromHtml } from "../src/techWeek.js";

test("parseTracksFromHtml extracts track slug and label", () => {
  const html = `
    <a href="/calendar/nyc/tracks/ai-infra"><h3>AI + Infra</h3></a>
    <a href="/calendar/nyc/tracks/investors"><div><h3>Investors</h3></div></a>
  `;

  assert.deepEqual(parseTracksFromHtml(html), [
    { slug: "ai-infra", label: "AI + Infra", sourceUrl: null },
    { slug: "investors", label: "Investors", sourceUrl: null },
  ]);
});

test("normalizeEvent keeps direct fields and host facets", () => {
  const event = normalizeEvent({
    id: 5363,
    city: "New York City",
    date: "2026-06-01",
    time: "04:00:00",
    location: "Virtual (NYC)",
    name: "4am IRR",
    company: "VCAR",
    externalHref: "https://partiful.com/e/example",
    isInviteOnly: false,
    facets: {
      time: { label: "Morning" },
      locations: [{ label: "Virtual (NYC)" }],
      hosts: [{ key: "vcar", label: "VCAR", role: "primary" }],
    },
  });

  assert.equal(event.id, 5363);
  assert.equal(event.timeLabel, "Morning");
  assert.equal(event.rsvpUrl, "https://partiful.com/e/example");
  assert.deepEqual(event.locationLabels, ["Virtual (NYC)"]);
  assert.deepEqual(event.hosts, [{ key: "vcar", label: "VCAR", role: "primary" }]);
  assert.equal(event.format, "meetup");
  assert.deepEqual(event.intent, ["networking"]);
});

test("normalizeEvent infers simple demo fields from tracks and title", () => {
  const event = normalizeEvent(
    {
      id: 6001,
      city: "New York City",
      name: "AI Founder Investor Mixer",
      company: "Example VC",
      externalHref: "https://partiful.com/e/example",
      facets: {
        hosts: [{ key: "example-vc", label: "Example VC", role: "primary" }],
      },
    },
    {
      tracks: [
        { slug: "founders", label: "Founders" },
        { slug: "investors", label: "Investors" },
      ],
    }
  );

  assert.deepEqual(event.audience, ["founders", "investors"]);
  assert.deepEqual(event.topic, ["venture", "ai"]);
  assert.equal(event.format, "mixer");
  assert.ok(event.keywords.includes("founders"));
  assert.match(event.summary, /AI Founder Investor Mixer/);
});
