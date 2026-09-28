import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import * as receipts from "../src/shared/expenseReceipts.mjs";

const employeeId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const expenseId = "33333333-3333-4333-8333-333333333333";
const receiptPath = `${employeeId}/${expenseId}.pdf`;
class ApiError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

async function loadRoute(path, session, events, team = []) {
  const source = (await readFile(new URL(path, import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const deps = {
    ...receipts, ApiError, crypto: webcrypto,
    apiFailure: error => Response.json({ error: error.message }, { status: error.status || 500 }),
    requirePermission: async () => session, requireAnyPermission: async () => session,
    getTeamMemberIds: async () => team,
    notifyEvent: async () => { events.push("notify"); }
  };
  return new Function(...Object.keys(deps), `${source}\nreturn {GET, POST: typeof POST === 'function' ? POST : null};`)(...Object.values(deps));
}

function harness({ insertFails = false, uploadFails = false, permissions = ["expenses.submit"], owner = employeeId } = {}) {
  const events = [];
  let inserted;
  const storage = {
    upload: async (path, bytes) => { events.push(["upload", path, bytes.length]); return { error: uploadFails ? new Error("offline") : null }; },
    remove: async paths => { events.push(["cleanup", paths]); return { error: null }; },
    createSignedUrl: async (path, seconds) => { events.push(["sign", path, seconds]); return { data: { signedUrl: "https://example.test/private-receipt" }, error: null }; }
  };
  const client = {
    storage: { from: bucket => { assert.equal(bucket, receipts.RECEIPT_BUCKET); return storage; } },
    from: table => {
      assert.equal(table, "expenses");
      const query = {
        insert: record => { inserted = record; events.push("insert"); return query; },
        select: () => query, eq: () => query,
        single: async () => ({ data: insertFails ? null : { ...inserted, id: expenseId, status: "Pending" }, error: insertFails ? new Error("insert failed") : null }),
        maybeSingle: async () => ({ data: { employee_id: owner, receipt_url: receiptPath }, error: null })
      };
      return query;
    }
  };
  return { events, session: { client, profile: { id: employeeId }, access: { isOwner: false, permissions } } };
}

function submission(file = null, amount = "12.50") {
  const form = new FormData();
  form.set("type", "Travel"); form.set("amount", amount); form.set("note", "Bus fare");
  if (file) form.set("receipt", file);
  return new Request("http://localhost/api/expenses", { method: "POST", body: form });
}
const pdf = () => new File(["%PDF-1.7\nreceipt fixture"], "bill.pdf", { type: "application/pdf" });

test("receipt validation rejects unsupported, empty, oversized and disguised files", () => {
  assert.match(receipts.receiptFileError(new File(["x"], "bill.svg", { type: "image/svg+xml" })), /PDF/);
  assert.match(receipts.receiptFileError(new File([], "bill.pdf", { type: "application/pdf" })), /non-empty/);
  assert.match(receipts.receiptFileError({ size: receipts.MAX_RECEIPT_BYTES + 1, type: "application/pdf" }), /4 MB/);
  assert.equal(receipts.receiptFileError({ size: receipts.MAX_RECEIPT_BYTES, type: "application/pdf" }), null);
  assert.equal(receipts.receiptSignatureMatches(new TextEncoder().encode("<html>"), "application/pdf"), false);
  for (const [type, bytes] of [
    ["application/pdf", [37, 80, 68, 70, 45]], ["image/jpeg", [255, 216, 255]],
    ["image/png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["image/webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]]
  ]) assert.equal(receipts.receiptSignatureMatches(new Uint8Array(bytes), type), true);
  assert.equal(receipts.isPrivateReceiptPath(receiptPath), true);
  assert.equal(receipts.isPrivateReceiptPath("https://evil.test/receipt.pdf"), false);
  assert.equal(receipts.isPrivateReceiptPath(`${employeeId}/../receipt.pdf`), false);
});

test("multipart receipt is uploaded privately and linked to the saved expense", async () => {
  const h = harness(); const route = await loadRoute("../src/app/api/expenses/route.js", h.session, h.events);
  const response = await route.POST(submission(pdf())); const body = await response.json();
  assert.equal(response.status, 201); assert.equal(body.data.hasReceipt, true); assert.equal(body.data.amount, 12.5);
  assert.ok(body.data.receiptUrl.startsWith(`${employeeId}/`));
  assert.equal(h.events[0][0], "upload"); assert.equal(h.events[1], "insert");
  assert.ok(!h.events.some(event => event[0] === "cleanup"));
});

test("expenses without proof still submit through multipart and JSON", async () => {
  for (const request of [submission(), new Request("http://localhost/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "Meals", amount: 20, note: "Lunch" }) })]) {
    const h = harness(); const route = await loadRoute("../src/app/api/expenses/route.js", h.session, h.events);
    const response = await route.POST(request);
    assert.equal(response.status, 201); assert.equal((await response.json()).data.hasReceipt, false);
    assert.equal(h.events[0], "insert");
  }
});

test("failed database insertion cleans up the upload; failed upload never inserts", async () => {
  for (const options of [{ insertFails: true }, { uploadFails: true }]) {
    const h = harness(options); const route = await loadRoute("../src/app/api/expenses/route.js", h.session, h.events);
    const response = await route.POST(submission(pdf()));
    assert.ok(response.status >= 500);
    assert.equal(h.events.some(event => event[0] === "cleanup"), Boolean(options.insertFails));
    assert.equal(h.events.includes("insert"), Boolean(options.insertFails));
  }
});

test("invalid receipt or amount produces no upload or expense", async () => {
  for (const request of [submission(new File(["fake"], "bill.pdf", { type: "application/pdf" })), submission(pdf(), "-1"), submission(pdf(), "Infinity"), submission(new File([new Uint8Array(receipts.MAX_RECEIPT_BYTES + 1)], "bill.pdf", { type: "application/pdf" }))]) {
    const h = harness(); const route = await loadRoute("../src/app/api/expenses/route.js", h.session, h.events);
    assert.equal((await route.POST(request)).status, 400); assert.equal(h.events.length, 0);
  }
});

test("employees can sign their proof but not another employee's proof even if a legacy RLS policy exposes its row", async () => {
  for (const owner of [employeeId, otherId]) {
    const h = harness({ owner }); const route = await loadRoute("../src/app/api/expenses/[expenseId]/receipt/route.js", h.session, h.events);
    const response = await route.GET(new Request("http://localhost/receipt"), { params: Promise.resolve({ expenseId }) });
    assert.equal(response.status, owner === employeeId ? 200 : 403);
    assert.equal(h.events.filter(event => event[0] === "sign").length, owner === employeeId ? 1 : 0);
    if (owner === employeeId) { assert.equal(response.headers.get("Cache-Control"), "no-store"); assert.equal(h.events[0][2], 300); }
  }
});

test("a reviewer must have this employee in their team or global expense access", async () => {
  for (const [permissions, team, expected] of [[['expenses.approve'], [], 403], [['expenses.approve'], [employeeId], 200], [['expenses.approve', 'employees.view_all'], [], 200]]) {
    const h = harness({ permissions }); h.session.profile.id = otherId;
    const route = await loadRoute("../src/app/api/expenses/[expenseId]/receipt/route.js", h.session, h.events, team);
    assert.equal((await route.GET(new Request("http://localhost/receipt"), { params: Promise.resolve({ expenseId }) })).status, expected);
  }
});
