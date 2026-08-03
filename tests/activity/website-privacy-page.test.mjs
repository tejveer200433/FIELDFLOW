import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../src/app/privacy/website-activity/page.js", import.meta.url);

test("website activity privacy page is public-facing and accurately domain-only", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /Website Activity Privacy Notice/);
  assert.match(source, /hostname \(domain\)/);
  assert.match(source, /Full URLs, URL paths/);
  assert.match(source, /passwords/);
  assert.match(source, /Private or incognito browsing/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /not sold/);
  assert.match(source, /FieldFlow administrator/);
});

test("home page links to the public website activity privacy notice", async () => {
  const source = await readFile(new URL("../../src/app/page.js", import.meta.url), "utf8");
  assert.match(source, /href="\/privacy\/website-activity"/);
});
