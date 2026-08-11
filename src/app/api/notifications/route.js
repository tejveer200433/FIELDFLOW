import { ApiError, apiFailure, requireSession } from "@/backend/supabase/supabaseServer";

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
const mapWebAccessAlert = row => ({
  id: row.id,
  type: row.alert_type,
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
    const [{ data, error }, { count: unreadCount, error: countError }, { data: webAlerts, error: webAlertError }, { count: webUnreadCount, error: webCountError }] = await Promise.all([
      query,
      session.client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      session.client.from("web_access_alerts").select("*").order("created_at", { ascending: false }).limit(limit),
      session.client.from("web_access_alerts").select("id", { count: "exact", head: true }).is("read_at", null)
    ]);
    if (error) throw error;
    if (countError) throw countError;
    if (webAlertError && !["42P01", "PGRST205"].includes(webAlertError.code)) throw webAlertError;
    if (webCountError && !["42P01", "PGRST205"].includes(webCountError.code)) throw webCountError;
    const merged = [...(data || []).map(map), ...(webAlerts || []).map(mapWebAccessAlert)]
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, limit);
    return Response.json({ data: merged, unreadCount: (unreadCount || 0) + (webUnreadCount || 0) }, { headers: { "Cache-Control": "no-store" } });
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
    let webQuery = session.client.from("web_access_alerts").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (!body.all) webQuery = webQuery.in("id", body.ids.slice(0, 50));
    const [{ error }, { error: webError }] = await Promise.all([query, webQuery]);
    if (error) throw error;
    if (webError && !["42P01", "PGRST205"].includes(webError.code)) throw webError;
    return Response.json({ data: { success: true } });
  } catch (error) {
    return apiFailure(error);
  }
}
