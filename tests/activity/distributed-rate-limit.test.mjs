import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const read = relativePath => readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(path) : entry.name === "route.js" ? [path] : [];
  }));
  return nested.flat();
}

test("activity rate limits are stored atomically in Supabase", async () => {
  const migration = await read("supabase/migrations/202608140001_activity_distributed_rate_limits.sql");
  assert.match(migration, /create table if not exists public\.activity_rate_limits/);
  assert.match(migration, /primary key \(user_id, bucket\)/);
  assert.match(migration, /caller_id uuid := auth\.uid\(\)/);
  assert.match(migration, /on conflict \(user_id, bucket\) do update/);
  assert.match(migration, /public\.activity_rate_limits\.request_count \+ 1/);
  assert.match(migration, /revoke all on public\.activity_rate_limits from anon, authenticated/);
  assert.match(migration, /grant execute on function public\.activity_consume_rate_limit[\s\S]*to authenticated, service_role/);
});

test("activity rate-limit timestamps cannot resolve to PostgreSQL current_time", async () => {
  const migration = await read("supabase/migrations/202608150001_fix_activity_rate_limit_timestamp.sql");
  assert.match(migration, /v_now timestamptz := clock_timestamp\(\)/);
  assert.match(migration, /v_now \+ make_interval\(secs => p_window_seconds\)/);
  assert.match(migration, /reset_at <= v_now/);
  assert.match(migration, /v_reset_at - v_now/);
  assert.doesNotMatch(migration, /\bcurrent_time\s*\+/i);
});

test("activity limiter uses the authenticated Supabase client without process-local fallback", async () => {
  const limiter = await read("src/backend/activity/rateLimit.js");
  assert.match(limiter, /client\.rpc\("activity_consume_rate_limit"/);
  assert.match(limiter, /p_window_seconds: Math\.ceil\(windowMs \/ 1000\)/);
  assert.doesNotMatch(limiter, /globalThis|new Map|x-forwarded-for|x-real-ip/);
});

test("every activity route awaits distributed rate-limit consumption", async () => {
  const root = fileURLToPath(new URL("../../src/app/api/activity", import.meta.url));
  const files = await routeFiles(root);
  const limited = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (!source.includes("enforceActivityRateLimit(")) continue;
    limited.push(file);
    const calls = source.match(/[^\n]*enforceActivityRateLimit\([^\n]+/g) || [];
    assert.ok(calls.length > 0, file);
    for (const call of calls) {
      assert.match(call, /await enforceActivityRateLimit\(session\.client,/);
      assert.doesNotMatch(call, /\(request|session\.profile\.id/);
    }
  }
  assert.ok(limited.length >= 20);
});
