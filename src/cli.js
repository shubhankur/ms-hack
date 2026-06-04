import { todayDateInTimezone } from "./config.js";
import { closePool, listEvents, listTracks, setupDatabase } from "./db.js";
import { parseScrapeQuery } from "./llm.js";
import { recommendEvents } from "./matcher.js";
import {
  fetchTracks,
  syncEventsForDay,
  syncEventsFromScrapePlan,
  syncSampleEvents,
  syncTechWeek,
} from "./techWeek.js";

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "setup") {
    await setupDatabase();
    console.log(JSON.stringify({ ok: true }, null, 2));
  } else if (command === "sync") {
    const result = await syncTechWeek();
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "sample") {
    const limit = readNumberArg(args, "--limit", 10);
    const result = await syncSampleEvents({ limit });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "sync-day") {
    const date = readStringArg(args, "--date", todayDateInTimezone());
    const result = await syncEventsForDay({ date });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "scrape") {
    const limitArg = readNumberArg(args, "--limit", null);
    const message = removeValueArg(args, "--limit").join(" ").trim();
    if (!message) {
      console.log('Usage: npm run scrape -- "founder events today" [--limit 10]');
      process.exitCode = 1;
    } else {
      const tracks = await fetchTracks();
      const plan = await parseScrapeQuery(message, {
        tracks,
        limitFallback: limitArg || 10,
      });
      if (limitArg) {
        plan.limit = limitArg;
      }

      const result = await syncEventsFromScrapePlan({ ...plan, tracks });
      console.log(JSON.stringify({ request: message, ...result }, null, 2));
    }
  } else if (command === "tracks:source") {
    const tracks = await fetchTracks();
    console.log(JSON.stringify(tracks, null, 2));
  } else if (command === "tracks") {
    const tracks = await listTracks();
    console.log(JSON.stringify(tracks, null, 2));
  } else if (command === "events") {
    const limit = readNumberArg(args, "--limit", 25);
    const date = readStringArg(args, "--date", null);
    const events = await listEvents({ limit, date });
    console.log(JSON.stringify(events, null, 2));
  } else if (command === "recommend") {
    const message = args.join(" ");
    const events = await recommendEvents({ message, limit: 10 });
    console.log(JSON.stringify(events, null, 2));
  } else {
    console.log("Usage: node src/cli.js <setup|sync|sync-day|scrape|sample|tracks|tracks:source|events|recommend>");
    process.exitCode = 1;
  }
} finally {
  await closePool();
}

function readNumberArg(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return fallback;
  }
  const value = Number(args[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function readStringArg(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return fallback;
  }
  return args[index + 1];
}

function removeValueArg(args, name) {
  const cleaned = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      index += 1;
      continue;
    }
    cleaned.push(args[index]);
  }
  return cleaned;
}
