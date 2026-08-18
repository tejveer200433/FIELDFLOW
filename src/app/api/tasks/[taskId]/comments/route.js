import { ApiError, apiFailure, requireAnyPermission } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";
const select = "id,body,created_at,author:profiles!task_comments_author_id_fkey(id,full_name)";

async function scopedTask(session, taskId) {
  const { data: allowed, error } = await session.client.rpc("can_access_task", { p_task_id: taskId });
  if (error || !allowed) throw new ApiError("Task not found in your permitted scope.", 404);
}

const map = item => ({ id: item.id, body: item.body, createdAt: item.created_at, authorId: Array.isArray(item.author) ? item.author[0]?.id : item.author?.id, author: (Array.isArray(item.author) ? item.author[0]?.full_name : item.author?.full_name) || "FieldFlow user" });

export async function GET(request, { params }) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const { taskId } = await params;
    await scopedTask(session, taskId);
    const { data, error } = await session.client.from("task_comments").select(select).eq("task_id", taskId).order("created_at").limit(200);
    if (error) throw error;
    return Response.json({ data: (data || []).map(map) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request, { params }) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const { taskId } = await params;
    await scopedTask(session, taskId);
    const body = await request.json();
    if (!String(body.body || "").trim()) throw new ApiError("Comment is required.");
    const { data, error } = await session.client.from("task_comments").insert({ task_id: taskId, author_id: session.profile.id, body: String(body.body).trim().slice(0, 3000) }).select(select).single();
    if (error) throw error;
    return Response.json({ data: map(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}
