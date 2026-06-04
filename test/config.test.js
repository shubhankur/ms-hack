import assert from "node:assert/strict";
import test from "node:test";
import { todayDateInTimezone } from "../src/config.js";

test("todayDateInTimezone returns an ISO date string", () => {
  assert.match(todayDateInTimezone("America/New_York"), /^\d{4}-\d{2}-\d{2}$/);
});
