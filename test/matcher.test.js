import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUserQuery } from "../src/matcher.js";

test("normalizeUserQuery keeps useful matching tokens", () => {
  assert.equal(
    normalizeUserQuery("AI infra + founder events near Flatiron!"),
    "ai infra + founder events near flatiron"
  );
});
