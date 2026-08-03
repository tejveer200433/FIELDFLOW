import test from "node:test";
import assert from "node:assert/strict";
import {
  groupSamplesBySession,
  reconcileBatch,
  syncPendingSamples,
  syncPendingWebsiteSamples
} from "../src/lib/sync.js";

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
    capturedAt: "2026-08-03T12:00:00Z",
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
    capturedAt: "2026-08-03T12:00:00Z",
    domain: "example.com",
    browserName: "chrome",
    durationSeconds: 60
  }]);
});
