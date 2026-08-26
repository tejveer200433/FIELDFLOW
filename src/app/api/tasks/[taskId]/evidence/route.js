import { ApiError, apiFailure, requireAnyPermission } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";

async function taskAccess(client, taskId) {
  const { data, error } = await client.rpc("can_access_task", { p_task_id: taskId });
  if (error || !data) throw new ApiError("Task not found in your permitted scope.", 404);
}

export async function GET(request, { params }) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const { taskId } = await params;
    await taskAccess(session.client, taskId);
    const [{ data: summary, error: summaryError }, { data: contexts, error: contextError }, { data: canAddContext, error: assigneeError }] = await Promise.all([
      session.client.rpc("task_work_evidence_summary", { p_task_id: taskId }),
      session.client.from("task_work_evidence_contexts").select("id,note,created_at,author:profiles!task_work_evidence_contexts_created_by_fkey(full_name)").eq("task_id", taskId).order("created_at", { ascending: false }).limit(30),
      session.client.rpc("is_task_assignee", { p_task_id: taskId, p_employee_id: session.profile.id })
    ]);
    if (summaryError) throw summaryError;
    if (contextError) throw contextError;
    if (assigneeError) throw assigneeError;
    const row = Array.isArray(summary) ? summary[0] : summary;
    return Response.json({ data: {
      summary: {
        trackedSeconds: Number(row?.tracked_seconds) || 0,
        sessionCount: Number(row?.session_count) || 0,
        heartbeatCount: Number(row?.heartbeat_count) || 0,
        integrityAlertCount: Number(row?.integrity_alert_count) || 0,
        contextCount: Number(row?.context_count) || 0,
        latestEvidenceAt: row?.latest_evidence_at || null,
        confidenceScore: Number(row?.confidence_score) || 0,
        confidenceBand: row?.confidence_band || "insufficient"
      },
      canAddContext: Boolean(canAddContext),
      contexts: (contexts || []).map(item => ({
        id: item.id,
        note: item.note,
        createdAt: item.created_at,
        author: Array.isArray(item.author) ? item.author[0]?.full_name : item.author?.full_name || "Employee"
      }))
    } });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request, { params }) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self"]);
    const { taskId } = await params;
    await taskAccess(session.client, taskId);
    const { data: assignee, error: assigneeError } = await session.client.rpc("is_task_assignee", { p_task_id: taskId, p_employee_id: session.profile.id });
    if (assigneeError || !assignee) throw new ApiError("Only an assigned employee can add task evidence context.", 403);
    const body = await request.json();
    const note = String(body?.note || "").trim();
    if (!note || note.length > 1000) throw new ApiError("Context must be between 1 and 1000 characters.");
    const { data, error } = await session.client
      .from("task_work_evidence_contexts")
      .insert({ task_id: taskId, employee_id: session.profile.id, created_by: session.profile.id, note })
      .select("id,note,created_at,author:profiles!task_work_evidence_contexts_created_by_fkey(full_name)")
      .single();
    if (error) throw error;
    return Response.json({ data: {
      id: data.id, note: data.note, createdAt: data.created_at,
      author: Array.isArray(data.author) ? data.author[0]?.full_name : data.author?.full_name || "Employee"
    } }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}
