import test from "node:test";
import assert from "node:assert/strict";

import { compareAgentVersions, resolveAgentRelease } from "../../src/lib/activity/agentRelease.mjs";

const configured = {
  ACTIVITY_AGENT_RELEASE_VERSION: "0.4.0",
  ACTIVITY_AGENT_RELEASE_URL: "https://github.com/example/releases/download/v0.4.0/agent.exe",
  ACTIVITY_AGENT_RELEASE_SIGNATURE: "trusted-minisign-signature-value",
  ACTIVITY_AGENT_RELEASE_NOTES: "Safe update"
};

test("agent release comparison follows semantic versions", () => {
  assert.equal(compareAgentVersions("0.4.0", "0.3.1"), 1);
  assert.equal(compareAgentVersions("0.3.1", "0.3.1"), 0);
  assert.equal(compareAgentVersions("0.3.0", "0.3.1"), -1);
  assert.equal(compareAgentVersions("not-a-version", "0.3.1"), null);
});

test("the updater endpoint returns only a newer configured signed release", () => {
  const available = resolveAgentRelease({
    target: "windows",
    arch: "x86_64",
    currentVersion: "0.3.1",
    environment: configured
  });
  assert.equal(available.status, 200);
  assert.equal(available.release.version, "0.4.0");
  assert.equal(available.release.signature, configured.ACTIVITY_AGENT_RELEASE_SIGNATURE);

  assert.equal(resolveAgentRelease({
    target: "windows", arch: "x86_64", currentVersion: "0.4.0", environment: configured
  }).status, 204);
  assert.equal(resolveAgentRelease({
    target: "linux", arch: "x86_64", currentVersion: "0.3.1", environment: configured
  }).status, 204);
});

test("missing, insecure, or incomplete release settings never offer an update", () => {
  assert.equal(resolveAgentRelease({
    target: "windows", arch: "x86_64", currentVersion: "0.3.1", environment: {}
  }).status, 204);
  assert.equal(resolveAgentRelease({
    target: "windows",
    arch: "x86_64",
    currentVersion: "0.3.1",
    environment: { ...configured, ACTIVITY_AGENT_RELEASE_URL: "http://example.com/agent.exe" }
  }).status, 503);
});
