import assert from "node:assert/strict";
import test from "node:test";
import { activeBlockedDomains, isDomainBlocked, normalizeDomain } from "../../browser-extension/blocklist.mjs";

test("approved domain overrides remove normalized browser restrictions", () => {
  const blocklist = {
    blockedDomains: ["www.YouTube.com", "instagram.com"],
    overrides: [{ domain: "https://youtube.com/watch", overrideEndsAt: "2099-01-01T00:00:00Z" }]
  };
  assert.deepEqual(activeBlockedDomains(blocklist, Date.parse("2026-08-10T00:00:00Z")), ["instagram.com"]);
  assert.equal(isDomainBlocked("music.youtube.com", blocklist, Date.parse("2026-08-10T00:00:00Z")), false);
});

test("always approvals without an expiry remain active", () => {
  const blocklist = { blockedDomains: ["youtube.com"], overrides: [{ domain: "youtube.com", overrideEndsAt: null }] };
  assert.deepEqual(activeBlockedDomains(blocklist), []);
});

test("expired approvals do not remove restrictions", () => {
  const blocklist = { blockedDomains: ["youtube.com"], overrides: [{ domain: "youtube.com", overrideEndsAt: "2020-01-01T00:00:00Z" }] };
  assert.equal(isDomainBlocked("www.youtube.com", blocklist), true);
  assert.equal(normalizeDomain("https://www.YouTube.com/watch"), "youtube.com");
});
