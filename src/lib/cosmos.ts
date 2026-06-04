// Cosmos DB persistence layer [component #1 storage].
// Two containers: `events` (Tech Week catalog, refreshed every 12h) and
// `profiles` (user profiles from the chat). Events optionally carry an
// embedding vector for semantic pre-filtering in the curation engine.

import { CosmosClient, type Container, type Database } from "@azure/cosmos";
import type { TechWeekEvent, UserProfile } from "./types";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE ?? "techweek";

let cached: { db: Database; events: Container; profiles: Container } | null = null;

/** Lazily create the client + containers. Throws if env is missing. */
export async function getDb() {
  if (cached) return cached;
  if (!endpoint || !key) {
    throw new Error(
      "COSMOS_ENDPOINT and COSMOS_KEY must be set (see .env.example).",
    );
  }
  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  const { container: events } = await database.containers.createIfNotExists({
    id: "events",
    partitionKey: { paths: ["/date"] },
  });
  const { container: profiles } = await database.containers.createIfNotExists({
    id: "profiles",
    partitionKey: { paths: ["/id"] },
  });
  cached = { db: database, events, profiles };
  return cached;
}

/** Upsert a batch of events. Cosmos id must be a string. */
export async function upsertEvents(events: TechWeekEvent[]): Promise<number> {
  const { events: container } = await getDb();
  let n = 0;
  for (const e of events) {
    await container.items.upsert({ ...e, id: String(e.id) });
    n++;
  }
  return n;
}

/** Read the full event catalog (optionally for a given day). */
export async function getEvents(day?: string): Promise<TechWeekEvent[]> {
  const { events: container } = await getDb();
  const query = day
    ? { query: "SELECT * FROM c WHERE c.date = @day", parameters: [{ name: "@day", value: day }] }
    : "SELECT * FROM c";
  const { resources } = await container.items.query<TechWeekEvent>(query).fetchAll();
  return resources;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const { profiles } = await getDb();
  await profiles.items.upsert({ ...profile, updatedAt: new Date().toISOString() });
}

export async function getProfile(id: string): Promise<UserProfile | null> {
  const { profiles } = await getDb();
  try {
    const { resource } = await profiles.item(id, id).read<UserProfile>();
    return resource ?? null;
  } catch {
    return null;
  }
}
