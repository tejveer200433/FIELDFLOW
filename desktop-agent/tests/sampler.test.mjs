import test from "node:test";
import assert from "node:assert/strict";
import { buildCodingSample, buildSample } from "../src/lib/sampler.js";

test("sample contains only the approved aggregate fields", () => {
  const sample = buildSample({
    localSampleId: "sample-1",
    sessionId: "session-1",
    capturedAt: "2026-07-28T12:00:00.000Z",
    counts: { keyboardEventCount: 0, mouseEventCount: 0 },
    idleSeconds: 22.8,
    activeApplication: "Code",
    screenLocked: false,
    collectApplicationNames: true
  });
  assert.deepEqual(Object.keys(sample), [
    "localSampleId", "trackingSessionId", "capturedAt", "keyboardEventCount",
    "mouseEventCount", "idleSeconds", "activeApplication", "screenLocked"
  ]);
  for (const forbidden of ["employeeId", "deviceIdentifier", "typedText", "keyCodes", "clipboard", "screenshot", "mouseCoordinates", "windowTitle", "url"]) {
    assert.equal(forbidden in sample, false);
  }
});

test("application name is omitted when policy disables collection", () => {
  const sample = buildSample({
    localSampleId: "sample-1",
    sessionId: "session-1",
    capturedAt: "2026-07-28T12:00:00.000Z",
    counts: { keyboardEventCount: 0, mouseEventCount: 0 },
    idleSeconds: 0,
    activeApplication: "Code",
    screenLocked: true,
    collectApplicationNames: false
  });
  assert.equal(sample.activeApplication, null);
  assert.equal(sample.screenLocked, true);
});

test("locked sampling does not query input counters or the active application", async () => {
  const calls = [];
  const invoke = async (command, payload) => {
    calls.push(command);
    if (command === "get_screen_locked") return true;
    if (command === "get_idle_seconds") return 30;
    if (command === "enqueue_sample") return payload;
    throw new Error(`Unexpected locked-state command: ${command}`);
  };
  const { captureSample } = await import("../src/lib/sampler.js");
  const sample = await captureSample(
    { sessionId: "session-1", collectApplicationNames: true },
    invoke
  );
  assert.equal(sample.screenLocked, true);
  assert.equal(sample.keyboardEventCount, 0);
  assert.equal(sample.mouseEventCount, 0);
  assert.equal(sample.activeApplication, null);
  assert.equal(calls.includes("take_input_activity_counts"), false);
  assert.equal(calls.includes("get_active_application"), false);
});

test("an in-flight sample is discarded when the active session stops", async () => {
  const calls = [];
  let active = true;
  const invoke = async command => {
    calls.push(command);
    if (command === "get_screen_locked") return false;
    if (command === "get_idle_seconds") return 0;
    if (command === "take_input_activity_counts") {
      active = false;
      return { keyboardEventCount: 0, mouseEventCount: 0 };
    }
    if (command === "get_active_application") return "Code";
    if (command === "enqueue_sample") throw new Error("Stopped sample must not be queued.");
    return null;
  };
  const { captureSample } = await import("../src/lib/sampler.js");
  const result = await captureSample(
    { sessionId: "session-1", collectApplicationNames: true },
    invoke,
    () => active
  );
  assert.equal(result, null);
  assert.equal(calls.includes("enqueue_sample"), false);
});

test("coding sample contains only ide name and a parsed project label", () => {
  const sample = buildCodingSample({
    localSampleId: "coding-1",
    sessionId: "session-1",
    capturedAt: "2026-08-04T12:00:00.000Z",
    context: { ideName: "vscode", projectName: "fieldflow-nextjs" }
  });
  assert.deepEqual(Object.keys(sample), [
    "localSampleId", "trackingSessionId", "capturedAt", "ideName", "projectName", "durationSeconds"
  ]);
  for (const forbidden of ["windowTitle", "filePath", "fileName", "url"]) {
    assert.equal(forbidden in sample, false);
  }
});

test("no coding sample is captured when the policy has not opted in", async () => {
  const calls = [];
  const invoke = async command => {
    calls.push(command);
    throw new Error(`Unexpected command while disabled: ${command}`);
  };
  const { captureCodingSample } = await import("../src/lib/sampler.js");
  const result = await captureCodingSample(
    { sessionId: "session-1", collectCodingProjectNames: false },
    invoke
  );
  assert.equal(result, null);
  assert.equal(calls.length, 0);
});

test("no coding sample is captured outside a recognized IDE", async () => {
  const invoke = async command => {
    if (command === "get_coding_context") return null;
    throw new Error(`Unexpected command: ${command}`);
  };
  const { captureCodingSample } = await import("../src/lib/sampler.js");
  const result = await captureCodingSample(
    { sessionId: "session-1", collectCodingProjectNames: true },
    invoke
  );
  assert.equal(result, null);
});

test("an in-flight coding sample is discarded when the active session stops", async () => {
  let active = true;
  const invoke = async command => {
    if (command === "get_coding_context") {
      active = false;
      return { ideName: "vscode", projectName: "fieldflow-nextjs" };
    }
    if (command === "enqueue_coding_sample") throw new Error("Stopped sample must not be queued.");
    return null;
  };
  const { captureCodingSample } = await import("../src/lib/sampler.js");
  const result = await captureCodingSample(
    { sessionId: "session-1", collectCodingProjectNames: true },
    invoke,
    () => active
  );
  assert.equal(result, null);
});
