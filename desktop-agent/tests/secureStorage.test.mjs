import test from "node:test";
import assert from "node:assert/strict";
import {
  SECURE_CHUNK_CODE_UNITS,
  createSecureSessionStorage,
  splitSecureValue
} from "../src/lib/secureStorage.js";

test("secure values are split below the Windows Credential Manager blob limit", () => {
  const value = "a".repeat(SECURE_CHUNK_CODE_UNITS * 2 + 17);
  const chunks = splitSecureValue(value);

  assert.deepEqual(chunks.map(chunk => chunk.length), [1000, 1000, 17]);
  assert.equal(chunks.join(""), value);
});

test("secure value splitting does not divide a UTF-16 surrogate pair", () => {
  const value = `${"a".repeat(SECURE_CHUNK_CODE_UNITS - 1)}😀tail`;
  const chunks = splitSecureValue(value);

  assert.equal(chunks.join(""), value);
  assert.equal(chunks[0].endsWith("\uD83D"), false);
  assert.ok(chunks.every(chunk => chunk.length <= SECURE_CHUNK_CODE_UNITS));
});

test("secure session storage round-trips a multi-chunk Supabase session", async () => {
  const credentials = new Map();
  const calls = [];
  const invoke = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "secure_read") return credentials.get(payload.key) ?? null;
    if (command === "secure_write") {
      credentials.set(payload.key, payload.value);
      return;
    }
    if (command === "secure_delete") {
      credentials.delete(payload.key);
      return;
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  const storage = createSecureSessionStorage(invoke);
  const session = JSON.stringify({
    access_token: "a".repeat(1800),
    refresh_token: "r".repeat(500)
  });

  await storage.setItem("supabase-auth-token", session);

  assert.equal(await storage.getItem("supabase-auth-token"), session);
  const writes = calls.filter(call => call.command === "secure_write" && /:\d+$/.test(call.payload.key));
  assert.ok(writes.length > 1);
  assert.ok(writes.every(call => call.payload.value.length <= SECURE_CHUNK_CODE_UNITS));
});

test("native string rejections become useful Error objects", async () => {
  const storage = createSecureSessionStorage(async () => {
    throw "credential write rejected";
  });

  await assert.rejects(
    storage.setItem("supabase-auth-token", "session"),
    /Windows Credential Manager could not save the secure session: credential write rejected/
  );
});

test("overlapping session saves are serialized and the newest session wins", async () => {
  const credentials = new Map();
  const invoke = async (command, payload) => {
    if (command === "secure_read") return credentials.get(payload.key) ?? null;
    if (command === "secure_delete") { credentials.delete(payload.key); return; }
    if (command === "secure_write") {
      if (payload.value.startsWith("A") && payload.key.endsWith(":0")) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      credentials.set(payload.key, payload.value);
      return;
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  const storage = createSecureSessionStorage(invoke);
  const first = JSON.stringify({ access_token: "A".repeat(2200), refresh_token: "first" });
  const second = JSON.stringify({ access_token: "B".repeat(1200), refresh_token: "second" });

  await Promise.all([
    storage.setItem("supabase-auth-token", first),
    storage.setItem("supabase-auth-token", second)
  ]);

  assert.equal(await storage.getItem("supabase-auth-token"), second);
});

test("secure storage never invokes concurrent native credential operations", async () => {
  const credentials = new Map();
  let activeCalls = 0;
  let maximumCalls = 0;
  const invoke = async (command, payload) => {
    activeCalls += 1;
    maximumCalls = Math.max(maximumCalls, activeCalls);
    await new Promise(resolve => setTimeout(resolve, 1));
    try {
      if (command === "secure_read") return credentials.get(payload.key) ?? null;
      if (command === "secure_write") { credentials.set(payload.key, payload.value); return; }
      if (command === "secure_delete") { credentials.delete(payload.key); return; }
      throw new Error(`Unexpected command: ${command}`);
    } finally {
      activeCalls -= 1;
    }
  };
  const storage = createSecureSessionStorage(invoke);

  await Promise.all([
    storage.setItem("supabase-auth-token", "A".repeat(2200)),
    storage.setItem("supabase-auth-token", "B".repeat(2200))
  ]);

  assert.equal(maximumCalls, 1);
});

test("an interrupted session save preserves the last readable session", async () => {
  const credentials = new Map();
  let rejectNewWrite = false;
  const invoke = async (command, payload) => {
    if (command === "secure_read") return credentials.get(payload.key) ?? null;
    if (command === "secure_delete") { credentials.delete(payload.key); return; }
    if (command === "secure_write") {
      if (rejectNewWrite && payload.value.startsWith("N") && payload.key.endsWith(":1")) {
        throw new Error("simulated interrupted credential write");
      }
      credentials.set(payload.key, payload.value);
      return;
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  const storage = createSecureSessionStorage(invoke);
  const stable = JSON.stringify({ access_token: "S".repeat(1800), refresh_token: "stable" });
  const replacement = JSON.stringify({ access_token: "N".repeat(1800), refresh_token: "replacement" });
  await storage.setItem("supabase-auth-token", stable);
  rejectNewWrite = true;

  await assert.rejects(storage.setItem("supabase-auth-token", replacement));
  assert.equal(await storage.getItem("supabase-auth-token"), stable);
});

test("failure to clean an obsolete credential never invalidates the committed session", async () => {
  const credentials = new Map();
  let rejectCleanup = false;
  const invoke = async (command, payload) => {
    if (command === "secure_read") return credentials.get(payload.key) ?? null;
    if (command === "secure_write") { credentials.set(payload.key, payload.value); return; }
    if (command === "secure_delete") {
      if (rejectCleanup && payload.key.includes(":g:")) {
        rejectCleanup = false;
        throw new Error("simulated obsolete credential cleanup failure");
      }
      credentials.delete(payload.key);
      return;
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  const storage = createSecureSessionStorage(invoke);
  await storage.setItem("supabase-auth-token", "first");
  await storage.setItem("supabase-auth-token", "second");
  rejectCleanup = true;

  await storage.setItem("supabase-auth-token", "third");

  assert.equal(await storage.getItem("supabase-auth-token"), "third");
});
