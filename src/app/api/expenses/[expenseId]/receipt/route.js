import { ApiError, apiFailure, requireAnyPermission, getTeamMemberIds } from "@/backend/supabase/supabaseServer";
import { RECEIPT_BUCKET, isPrivateReceiptPath } from "@/shared/expenseReceipts.mjs";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const session = await requireAnyPermission(request, ["expenses.submit", "expenses.approve"]);
    const { expenseId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(expenseId)) throw new ApiError("A valid expense is required.");
    const { data: expense, error } = await session.client.from("expenses")
      .select("employee_id,receipt_url").eq("id", expenseId).maybeSingle();
    if (error) throw error;
    if (!expense) throw new ApiError("Expense not found in your permitted scope.", 404);
    const own = expense.employee_id === session.profile.id && session.access.permissions.includes("expenses.submit");
    const canApprove = session.access.permissions.includes("expenses.approve");
    const global = session.access.isOwner || (canApprove && session.access.permissions.includes("employees.view_all"));
    if (!own && !global) {
      if (!canApprove || !(await getTeamMemberIds(session)).includes(expense.employee_id)) throw new ApiError("You cannot view this expense receipt.", 403);
    }
    if (!isPrivateReceiptPath(expense.receipt_url) || !expense.receipt_url.startsWith(`${expense.employee_id}/`)) throw new ApiError("No uploaded receipt is available for this expense.", 404);
    const { data, error: signedError } = await session.client.storage.from(RECEIPT_BUCKET).createSignedUrl(expense.receipt_url, 300);
    if (signedError) throw signedError;
    return Response.json({ data: { url: data.signedUrl, type: expense.receipt_url.endsWith(".pdf") ? "pdf" : "image" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}
