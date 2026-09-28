import { ApiError, apiFailure, assertUserInScope, notifyEvent, requireAnyPermission, requirePermission, resolveUserScope } from "@/backend/supabase/supabaseServer";
import { RECEIPT_BUCKET, RECEIPT_TYPES, isPrivateReceiptPath, receiptFileError, receiptSignatureMatches } from "@/shared/expenseReceipts.mjs";

export const dynamic = "force-dynamic";
const expenseSelect = "*,profiles!expenses_employee_id_fkey(full_name)";
const map = row => ({ id: row.id, employeeId: row.employee_id, employee: row.profiles?.full_name || "Employee", type: row.type, amount: Number(row.amount), date: row.expense_date, note: row.note, receiptUrl: row.receipt_url, hasReceipt: isPrivateReceiptPath(row.receipt_url), status: row.status, managerComment: row.manager_comment || "" });

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["expenses.submit", "expenses.approve"]);
    const scope = await resolveUserScope(session, {
      self: "expenses.submit",
      team: "expenses.approve",
      all: session.access.isOwner || session.access.permissions.includes("employees.view_all") ? "expenses.approve" : null
    });
    let query = session.client.from("expenses").select(expenseSelect).order("created_at", { ascending: false });
    if (scope.type !== "all") query = query.in("employee_id", scope.userIds);
    const requested = new URL(request.url).searchParams.get("employeeId");
    if (requested) {
      assertUserInScope(scope, requested);
      query = query.eq("employee_id", requested);
    }
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ data: data.map(map) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  let uploadedPath = null;
  let storage = null;
  let saved = false;
  try {
    const { client, profile } = await requirePermission(request, "expenses.submit");
    const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
    const form = multipart ? await request.formData() : null;
    const body = form ? Object.fromEntries(form) : await request.json();
    const amount = Number(body.amount);
    if (!String(body.type || "").trim() || !Number.isFinite(amount) || amount <= 0 || amount >= 10000000000 || !String(body.note || "").trim()) throw new ApiError("Type, a valid positive amount and description are required.");
    if (body.receiptUrl) throw new ApiError("Attach a receipt photo or PDF instead of a receipt URL.");
    const file = form?.get("receipt");
    if (file instanceof File && (file.name || file.size)) {
      const validationError = receiptFileError(file);
      if (validationError) throw new ApiError(validationError);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!receiptSignatureMatches(bytes, file.type)) throw new ApiError("The receipt contents do not match its file type.");
      const path = `${profile.id}/${crypto.randomUUID()}.${RECEIPT_TYPES[file.type]}`;
      storage = client.storage.from(RECEIPT_BUCKET);
      const { error: uploadError } = await storage.upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploadError) throw new ApiError("Receipt upload failed. Please try again or contact your administrator if receipt storage is not available.", 503);
      uploadedPath = path;
    } else if (file && !(file instanceof File)) {
      throw new ApiError("Attach a receipt photo or PDF.");
    }
    const { data, error } = await client.from("expenses").insert({
      employee_id: profile.id,
      task_id: body.taskId || null,
      type: String(body.type).slice(0, 80),
      amount,
      note: String(body.note).slice(0, 2000),
      receipt_url: uploadedPath
    }).select(expenseSelect).single();
    if (error) throw error;
    saved = true;
    const mapped = map(data);
    await notifyEvent(client, {
      employeeId: profile.id,
      permissionKey: "expenses.approve",
      type: "expense_submitted",
      title: "Expense submitted for approval",
      body: `${mapped.employee} submitted a ${mapped.type} expense of ₹${mapped.amount.toFixed(2)}.`,
      entityType: "expense",
      entityId: mapped.id
    });
    return Response.json({ data: mapped }, { status: 201 });
  } catch (error) {
    if (storage && uploadedPath && !saved) {
      try {
        const { error: cleanupError } = await storage.remove([uploadedPath]);
        if (cleanupError) console.error("Expense receipt cleanup failed.", cleanupError);
      } catch { console.error("Expense receipt cleanup could not complete."); }
    }
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requirePermission(request, "expenses.approve");
    const body = await request.json();
    if (!body.id || !["Approved", "Rejected"].includes(body.status)) throw new ApiError("An expense and valid decision are required.");
    const { data: expense, error: findError } = await session.client.from("expenses").select("id,employee_id").eq("id", body.id).single();
    if (findError || !expense) throw new ApiError("Expense not found in your permitted scope.", 404);
    const scope = session.access.isOwner || session.access.permissions.includes("employees.view_all")
      ? { type: "all", userIds: null }
      : await resolveUserScope(session, { team: "expenses.approve" });
    assertUserInScope(scope, expense.employee_id);
    const { data, error } = await session.client.from("expenses").update({
      status: body.status,
      manager_comment: String(body.managerComment || "").slice(0, 500),
      reviewed_by: session.profile.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", body.id).select(expenseSelect).single();
    if (error) throw error;
    return Response.json({ data: map(data) });
  } catch (error) {
    return apiFailure(error);
  }
}
