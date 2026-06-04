// Standalone ingest CLI: `npx tsx scripts/ingest.ts [--no-store]`
// Pulls the full catalog. Stores to Cosmos unless --no-store (or Cosmos unset).

import { fetchAll } from "../src/lib/techweek";
import { upsertEvents } from "../src/lib/cosmos";

const noStore = process.argv.includes("--no-store");

const events = await fetchAll();
const byDay: Record<string, number> = {};
for (const e of events) byDay[e.date] = (byDay[e.date] ?? 0) + 1;
console.log(`Fetched ${events.length} events`);
console.table(byDay);

if (noStore) {
  console.log("--no-store: skipping Cosmos write.");
} else {
  try {
    const n = await upsertEvents(events);
    console.log(`Stored ${n} events in Cosmos.`);
  } catch (e) {
    console.error("Cosmos write skipped:", (e as Error).message);
  }
}
