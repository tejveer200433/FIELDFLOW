import { ApiError, apiFailure, requireAnyPermission } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const { taskId } = await params;
    const { data: allowed, error: accessError } = await session.client.rpc("can_access_task", { p_task_id: taskId });
    if (accessError || !allowed) throw new ApiError("Task not found in your permitted scope.", 404);
    const { data, error } = await session.client
      .from("task_history")
      .select("id,action,changes,created_at,actor:profiles!task_history_actor_id_fkey(full_name)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json({ data: (data || []).map(item => ({
      id: item.id,
      action: item.action,
      changes: item.changes,
      createdAt: item.created_at,
      actor: Array.isArray(item.actor) ? item.actor[0]?.full_name : item.actor?.full_name
    })) });
  } catch (error) {
    return apiFailure(error);
  }
}
