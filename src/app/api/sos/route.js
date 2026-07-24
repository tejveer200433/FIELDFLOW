import { ApiError, apiFailure, assertUserInScope, requireAnyPermission, requirePermission, resolveUserScope } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
const sosSelect = "*,profiles!sos_alerts_employee_id_fkey(full_name)";
const map = row => ({ id: row.id, employeeId: row.employee_id, employee: row.profiles?.full_name || "Employee", latitude: row.latitude, longitude: row.longitude, message: row.message, resolvedAt: row.resolved_at, createdAt: row.created_at });

export async function GET(request) {
  try {
    const session = await requirePermission(request, "sos.view_team");
    const scope = session.access.isOwner || session.access.permissions.includes("employees.view_all")
      ? { type: "all", userIds: null }
      : await resolveUserScope(session, { team: "sos.view_team" });
    let query = session.client.from("sos_alerts").select(sosSelect).is("resolved_at", null).order("created_at", { ascending: false });
    if (scope.type !== "all") query = query.in("employee_id", scope.userIds);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ data: data.map(map) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "sos.create");
    const body = await request.json();
    const latitude = Number(body.location?.latitude);
    const longitude = Number(body.location?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new ApiError("A current GPS location is required for SOS.");
    const { data, error } = await client.from("sos_alerts").insert({
      employee_id: profile.id,
      latitude,
      longitude,
      message: String(body.message || "Emergency assistance requested").slice(0, 500)
    }).select(sosSelect).single();
    if (error) throw error;
    return Response.json({ data: map(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireAnyPermission(request, ["sos.resolve", "sos.view_team"]);
    if (!session.access.isOwner && !session.access.permissions.includes("sos.resolve")) throw new ApiError("You do not have permission to resolve SOS alerts.", 403);
    const body = await request.json();
    if (!body.id) throw new ApiError("An SOS alert is required.");
    const { data: alert, error: findError } = await session.client.from("sos_alerts").select("id,employee_id").eq("id", body.id).single();
    if (findError || !alert) throw new ApiError("SOS alert not found in your permitted scope.", 404);
    const scope = session.access.isOwner || session.access.permissions.includes("employees.view_all")
      ? { type: "all", userIds: null }
      : await resolveUserScope(session, { team: "sos.view_team" });
    assertUserInScope(scope, alert.employee_id);
    const { data, error } = await session.client.from("sos_alerts").update({ resolved_at: new Date().toISOString(), resolved_by: session.profile.id }).eq("id", body.id).select(sosSelect).single();
    if (error) throw error;
    return Response.json({ data: map(data) });
  } catch (error) {
    return apiFailure(error);
  }
}
