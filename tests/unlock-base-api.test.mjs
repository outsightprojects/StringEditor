import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../api/unlock-base.mjs";

function restorePassword(value) {
  if (value === undefined) {
    delete process.env.BASE_EDIT_PASSWORD;
    return;
  }

  process.env.BASE_EDIT_PASSWORD = value;
}

function requestFor(password) {
  return new Request("https://example.com/api/unlock-base", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
}

test("unlock-base rejects requests when password env var is missing", async () => {
  const previous = process.env.BASE_EDIT_PASSWORD;
  delete process.env.BASE_EDIT_PASSWORD;

  const response = await POST(requestFor("anything"));
  const body = await response.json();

  restorePassword(previous);

  assert.equal(response.status, 503);
  assert.equal(body.unlocked, false);
});

test("unlock-base accepts only the configured password", async () => {
  const previous = process.env.BASE_EDIT_PASSWORD;
  process.env.BASE_EDIT_PASSWORD = "secret-base";

  const bad = await POST(requestFor("wrong"));
  const good = await POST(requestFor("secret-base"));

  restorePassword(previous);

  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).unlocked, false);
  assert.equal(good.status, 200);
  assert.equal((await good.json()).unlocked, true);
});
