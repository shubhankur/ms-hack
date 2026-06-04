import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

export const dbUrl = process.env.DB_URL || process.env.DATABASE_URL;
export const techWeekCity = process.env.TECH_WEEK_CITY || "nyc";
export const techWeekBaseUrl =
  process.env.TECH_WEEK_BASE_URL || "https://www.tech-week.com/calendar";
export const appTimezone = process.env.APP_TIMEZONE || "America/New_York";
export const azureAiEndpoint = process.env.AZURE_AI_ENDPOINT || "";
export const azureAiKey = process.env.AZURE_AI_KEY || "";
export const azureAiModel = process.env.AZURE_AI_MODEL || "";
export const userAgent =
  process.env.MS_HACK_USER_AGENT ||
  "ms-hack-tech-week-ingestor/0.1";

export function requireDbUrl() {
  if (!dbUrl) {
    throw new Error("Missing DB_URL. Add it to .env before running database commands.");
  }
  return dbUrl;
}

export function hasAzureAiConfig() {
  return Boolean(azureAiEndpoint && azureAiKey && azureAiModel);
}

export function todayDateInTimezone(timeZone = appTimezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}
