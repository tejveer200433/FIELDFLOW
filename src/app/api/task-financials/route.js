import { ApiError, apiFailure, assertUserInScope, requireAnyPermission, resolveUserScope } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function scopedTask(session, taskId) {
  if (!uuidPattern.test(taskId || "")) throw new ApiError("A valid task is required.");
  const { data: task, error } = await session.client.from("tasks").select("id,employee_id").eq("id", taskId).single();
  if (error || !task) throw new ApiError("Task not found in your permitted scope.", 404);
  const scope = await resolveUserScope(session, { team: "tasks.assign", all: "tasks.manage_all" });
  assertUserInScope(scope, task.employee_id);
}

function map(row, trackedSeconds = 0) {
  const trackedHours = trackedSeconds / 3600;
  const actualCost = trackedHours * Number(row?.hourly_cost || 0);
  return { taskId: row?.task_id, currency: row?.currency || "INR", budgetAmount: row?.budget_amount == null ? null : Number(row.budget_amount), hourlyCost: row?.hourly_cost == null ? null : Number(row.hourly_cost), trackedHours, actualCost, remainingBudget: row?.budget_amount == null ? null : Number(row.budget_amount) - actualCost };
}

async function trackedSeconds(client, taskId) {
  const { data } = await client.rpc("task_tracked_seconds", { p_task_ids: [taskId] });
  return Number(data?.[0]?.tracked_seconds) || 0;
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.assign", "tasks.manage_all"]);
    const taskId = new URL(request.url).searchParams.get("taskId");
    await scopedTask(session, taskId);
    const { data, error } = await session.client.from("task_financials").select("*").eq("task_id", taskId).maybeSingle();
    if (error) throw error;
    return Response.json({ data: map(data || { task_id: taskId }, await trackedSeconds(session.client, taskId)) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PUT(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.assign", "tasks.manage_all"]);
    const body = await request.json();
    await scopedTask(session, body.taskId);
    const budget = body.budgetAmount === "" || body.budgetAmount == null ? null : Number(body.budgetAmount);
    const rate = body.hourlyCost === "" || body.hourlyCost == null ? null : Number(body.hourlyCost);
    if ((budget != null && (!Number.isFinite(budget) || budget < 0)) || (rate != null && (!Number.isFinite(rate) || rate < 0))) throw new ApiError("Budget and hourly cost must be positive numbers.");
    const currency = String(body.currency || "INR").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError("Currency must be a three-letter code.");
    const { data, error } = await session.client.from("task_financials").upsert({ task_id: body.taskId, currency, budget_amount: budget, hourly_cost: rate, updated_by: session.profile.id, updated_at: new Date().toISOString() }).select("*").single();
    if (error) throw error;
    return Response.json({ data: map(data, await trackedSeconds(session.client, body.taskId)) });
  } catch (error) {
    return apiFailure(error);
  }
}
