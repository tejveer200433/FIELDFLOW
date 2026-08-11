import assert from "node:assert/strict";
import test from "node:test";
import { isApplicationApproved, normalizeApplicationKey } from "../src/lib/applicationAccess.js";

test("application approval normalizes executable names", () => {
  assert.equal(normalizeApplicationKey(" WhatsApp.EXE "), "whatsapp");
});

test("base application approval includes Microsoft Store process variants", () => {
  assert.equal(isApplicationApproved("whatsapp.root", ["whatsapp"]), true);
  assert.equal(isApplicationApproved("WhatsApp.Root.exe", ["whatsapp.exe"]), true);
  assert.equal(isApplicationApproved("instagram", ["instagram"]), true);
});

test("an approval never permits an unrelated application", () => {
  assert.equal(isApplicationApproved("telegram", ["whatsapp"]), false);
  assert.equal(isApplicationApproved("whatsapp-helper", ["whatsapp"]), false);
});
