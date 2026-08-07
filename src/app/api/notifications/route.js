import { ApiError, apiFailure, requireSession } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
const map = row => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  entityType: row.entity_type,
  entityId: row.entity_id,
  read: Boolean(row.read_at),
  createdAt: row.created_at
});

export async function GET(request) {
  try {
    const session = await requireSession(request);
    const params = new URL(request.url).searchParams;
    const unreadOnly = params.get("unreadOnly") === "true";
    const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
    let query = session.client.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
    if (unreadOnly) query = query.is("read_at", null);
    const [{ data, error }, { count: unreadCount, error: countError }] = await Promise.all([
      query,
      session.client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
    ]);
    if (error) throw error;
    if (countError) throw countError;
    return Response.json({ data: (data || []).map(map), unreadCount: unreadCount || 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireSession(request);
    const body = await request.json();
    let query = session.client.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (body.all) {
      // no additional filter -- RLS already restricts this to the caller's own rows
    } else if (Array.isArray(body.ids) && body.ids.length) {
      query = query.in("id", body.ids.slice(0, 50));
    } else {
      throw new ApiError("Provide either { all: true } or a non-empty ids array.");
    }
    const { error } = await query;
    if (error) throw error;
    return Response.json({ data: { success: true } });
  } catch (error) {
    return apiFailure(error);
  }
}
