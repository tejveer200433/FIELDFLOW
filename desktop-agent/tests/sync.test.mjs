import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSamplesBySession,
  hexToBytes,
  normalizeUtcTimestamp,
  reconcileBatch,
  syncPendingCodingSamples,
  syncPendingSamples,
  syncPendingScreenshotSamples,
  syncPendingWebsiteSamples
} from "../src/lib/sync.js";

test("hexToBytes decodes a hex-encoded file back into its exact original bytes", () => {
  assert.deepEqual(hexToBytes("010203ff00"), new Uint8Array([1, 2, 3, 255, 0]));
  assert.deepEqual(hexToBytes(""), new Uint8Array([]));
});

test("UTC timestamps with an explicit zero offset are normalized for the API", () => {
  assert.equal(
    normalizeUtcTimestamp("2026-08-03T14:43:00+00:00"),
    "2026-08-03T14:43:00.000Z"
  );
  assert.equal(normalizeUtcTimestamp("not-a-timestamp"), "not-a-timestamp");
});

test("accepted and duplicate samples are confirmed while rejected samples remain queued", () => {
  const samples = [
    { localSampleId: "one" },
    { localSampleId: "two" },
    { localSampleId: "three" }
  ];
  const result = reconcileBatch(samples, {
    acceptedCount: 1,
    duplicateCount: 1,
    rejected: [{ localSampleId: "two", reason: "OFFLINE_SYNC_EXPIRED" }]
  });
  assert.deepEqual(result.confirmedIds, ["one", "three"]);
  assert.deepEqual(result.failed, [{ id: "two", error: "OFFLINE_SYNC_EXPIRED" }]);
});

test("queued samples remain associated with their original tracking sessions", () => {
  const groups = groupSamplesBySession([
    { localSampleId: "one", trackingSessionId: "session-a" },
    { localSampleId: "two", trackingSessionId: "session-b" },
    { localSampleId: "three", trackingSessionId: "session-a" }
  ]);
  assert.deepEqual(groups, [
    {
      sessionId: "session-a",
      samples: [
        { localSampleId: "one", trackingSessionId: "session-a" },
        { localSampleId: "three", trackingSessionId: "session-a" }
      ]
    },
    {
      sessionId: "session-b",
      samples: [{ localSampleId: "two", trackingSessionId: "session-b" }]
    }
  ]);
});

test("sync uploads each queued session separately without requiring an active session", async () => {
  const calls = [];
  const queued = [
    { localSampleId: "one", trackingSessionId: "session-a" },
    { localSampleId: "two", trackingSessionId: "session-b" }
  ];
  const invokeCommand = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "pending_samples") return queued;
    return null;
  };
  const api = {
    ingest: async body => {
      calls.push({ command: "ingest", payload: body });
      return { rejected: [] };
    }
  };

  const result = await syncPendingSamples(api, "device-1", invokeCommand);

  assert.deepEqual(result, { uploaded: 2, rejected: 0 });
  const ingests = calls.filter(call => call.command === "ingest").map(call => call.payload);
  assert.equal(ingests.length, 2);
  assert.equal(ingests[0].trackingSessionId, "session-a");
  assert.equal(ingests[1].trackingSessionId, "session-b");
  assert.deepEqual(ingests[0].samples, [{ localSampleId: "one" }]);
  assert.deepEqual(ingests[1].samples, [{ localSampleId: "two" }]);
});

test("a closed old session does not block a newer session from uploading", async () => {
  const ingestedSessions = [];
  const released = [];
  const queued = [
    { localSampleId: "old", trackingSessionId: "closed-session" },
    { localSampleId: "new", trackingSessionId: "active-session" }
  ];
  const invokeCommand = async (command, payload) => {
    if (command === "pending_samples") return queued;
    if (command === "release_samples") released.push(...payload.ids);
    return null;
  };
  const api = {
    ingest: async body => {
      ingestedSessions.push(body.trackingSessionId);
      if (body.trackingSessionId === "closed-session") {
        const error = new Error("Session is no longer active.");
        error.code = "SESSION_NOT_ACTIVE";
        throw error;
      }
      return { rejected: [] };
    }
  };

  await assert.rejects(
    syncPendingSamples(api, "device-1", invokeCommand),
    error => error.code === "SESSION_NOT_ACTIVE"
  );

  assert.deepEqual(ingestedSessions, ["closed-session", "active-session"]);
  assert.deepEqual(released, ["old"]);
});

test("website samples upload through the authenticated agent using their original session", async () => {
  const calls = [];
  const queued = [{
    localSampleId: "website-one",
    trackingSessionId: "session-a",
    capturedAt: "2026-08-03T12:00:00+00:00",
    domain: "example.com",
    browserName: "chrome",
    durationSeconds: 60
  }];
  const invokeCommand = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "pending_website_samples") return queued;
    return null;
  };
  const api = {
    ingestWebsites: async body => {
      calls.push({ command: "ingestWebsites", payload: body });
      return { acceptedCount: 1, rejected: [] };
    }
  };

  const result = await syncPendingWebsiteSamples(api, invokeCommand);

  assert.deepEqual(result, { uploaded: 1, rejected: 0 });
  const upload = calls.find(call => call.command === "ingestWebsites").payload;
  assert.equal(upload.trackingSessionId, "session-a");
  assert.deepEqual(upload.samples, [{
    localSampleId: "website-one",
    capturedAt: "2026-08-03T12:00:00.000Z",
    domain: "example.com",
    browserName: "chrome",
    durationSeconds: 60
  }]);
});

test("coding samples upload through the authenticated agent using their original session", async () => {
  const calls = [];
  const queued = [{
    localSampleId: "coding-one",
    trackingSessionId: "session-a",
    capturedAt: "2026-08-04T12:00:00+00:00",
    ideName: "vscode",
    projectName: "fieldflow-nextjs",
    durationSeconds: 60
  }];
  const invokeCommand = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "pending_coding_samples") return queued;
    return null;
  };
  const api = {
    ingestCoding: async body => {
      calls.push({ command: "ingestCoding", payload: body });
      return { acceptedCount: 1, rejected: [] };
    }
  };

  const result = await syncPendingCodingSamples(api, invokeCommand);

  assert.deepEqual(result, { uploaded: 1, rejected: 0 });
  const upload = calls.find(call => call.command === "ingestCoding").payload;
  assert.equal(upload.trackingSessionId, "session-a");
  assert.deepEqual(upload.samples, [{
    localSampleId: "coding-one",
    capturedAt: "2026-08-04T12:00:00.000Z",
    ideName: "vscode",
    projectName: "fieldflow-nextjs",
    durationSeconds: 60
  }]);
});

test("a registered screenshot uploads directly to storage and is confirmed", async () => {
  const calls = [];
  const queued = [{
    localSampleId: "shot-one",
    trackingSessionId: "session-a",
    capturedAt: "2026-08-06T12:00:00Z",
    filePath: "C:/tmp/shot-one.jpg",
    activeApplication: "Code",
    byteSize: 128000
  }];
  const invokeCommand = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "pending_screenshot_samples") return queued;
    if (command === "read_screenshot_file") return "010203";
    return null;
  };
  const api = {
    registerScreenshot: async body => {
      calls.push({ command: "registerScreenshot", payload: body });
      return { storagePath: "employee/session-a/20260806120000-abc.jpg" };
    },
    uploadScreenshot: async body => {
      calls.push({ command: "uploadScreenshot", payload: body });
    }
  };

  const result = await syncPendingScreenshotSamples(api, invokeCommand);

  assert.deepEqual(result, { uploaded: 1, rejected: 0 });
  assert.deepEqual(calls.find(call => call.command === "mark_screenshot_samples_uploading").payload, {
    ids: ["shot-one"]
  });
  const upload = calls.find(call => call.command === "uploadScreenshot").payload;
  assert.equal(upload.storagePath, "employee/session-a/20260806120000-abc.jpg");
  assert.deepEqual(upload.bytes, new Uint8Array([1, 2, 3]));
  const confirm = calls.find(call => call.command === "apply_screenshot_sync_result").payload;
  assert.deepEqual(confirm.result, { confirmedIds: ["shot-one"], failed: [] });
});

test("a network failure during screenshot upload releases the sample for retry without deleting its file", async () => {
  const calls = [];
  const queued = [{
    localSampleId: "shot-two",
    trackingSessionId: "session-a",
    capturedAt: "2026-08-06T12:00:00Z",
    filePath: "C:/tmp/shot-two.jpg",
    activeApplication: null,
    byteSize: 50000
  }];
  const invokeCommand = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "pending_screenshot_samples") return queued;
    return null;
  };
  const networkError = Object.assign(new Error("offline"), { code: "NETWORK_ERROR" });
  const api = {
    registerScreenshot: async () => { throw networkError; },
    uploadScreenshot: async () => {}
  };

  await assert.rejects(syncPendingScreenshotSamples(api, invokeCommand), networkError);

  const release = calls.find(call => call.command === "release_screenshot_samples");
  assert.ok(release, "expected a release_screenshot_samples call");
  assert.deepEqual(release.payload.ids, ["shot-two"]);
  assert.ok(!calls.some(call => call.command === "apply_screenshot_sync_result"));
});

test("a policy rejection (excluded application or disabled collection) is a permanent failure, not a retry", async () => {
  const calls = [];
  const queued = [{
    localSampleId: "shot-three",
    trackingSessionId: "session-a",
    capturedAt: "2026-08-06T12:00:00Z",
    filePath: "C:/tmp/shot-three.jpg",
    activeApplication: "banking-app",
    byteSize: 90000
  }];
  const invokeCommand = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "pending_screenshot_samples") return queued;
    return null;
  };
  const excludedError = Object.assign(new Error("excluded"), { code: "EXCLUDED_APPLICATION" });
  const api = {
    registerScreenshot: async () => { throw excludedError; },
    uploadScreenshot: async () => {}
  };

  const result = await syncPendingScreenshotSamples(api, invokeCommand);

  assert.deepEqual(result, { uploaded: 0, rejected: 1 });
  const confirm = calls.find(call => call.command === "apply_screenshot_sync_result").payload;
  assert.deepEqual(confirm.result, { confirmedIds: [], failed: [{ id: "shot-three", error: "EXCLUDED_APPLICATION" }] });
  assert.ok(!calls.some(call => call.command === "release_screenshot_samples"));
});
