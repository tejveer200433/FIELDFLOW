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
