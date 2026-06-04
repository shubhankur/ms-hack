// Azure Functions timer trigger [component #1 cron].
// Fires every 12h and pings the Next app's /api/ingest, which refreshes the
// Tech Week catalog in Cosmos. Keeping the heavy logic in the web app means one
// implementation of the ingestion pipeline.

import { app, type InvocationContext, type Timer } from "@azure/functions";

export async function ingestTimer(_timer: Timer, context: InvocationContext): Promise<void> {
  const base = process.env.INGEST_TARGET_URL;
  if (!base) {
    context.error("INGEST_TARGET_URL not set");
    return;
  }
  const url = `${base.replace(/\/$/, "")}/api/ingest`;
  context.log(`Triggering ingest at ${url}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    context.log(`Ingest responded ${res.status}: ${text.slice(0, 300)}`);
  } catch (err) {
    context.error(`Ingest failed: ${(err as Error).message}`);
  }
}

app.timer("ingestTimer", {
  // sec min hour day month day-of-week  -> every 12 hours, on the hour.
  schedule: "0 0 */12 * * *",
  runOnStartup: false,
  handler: ingestTimer,
});
