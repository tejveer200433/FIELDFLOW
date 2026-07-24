import { ApiError, apiFailure, requireAnyPermission, requirePermission, resolveUserScope } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
const locationSelect = "*,profiles!employee_locations_employee_id_fkey(full_name)";
const map = row => ({ employeeId: row.employee_id, name: row.profiles?.full_name || "Employee", latitude: row.latitude, longitude: row.longitude, accuracy: row.accuracy, updatedAt: row.updated_at, sharing: row.sharing });

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["locations.view_team", "locations.view_all"]);
    const scope = await resolveUserScope(session, { team: "locations.view_team", all: "locations.view_all" });
    let query = session.client.from("employee_locations").select(locationSelect).eq("sharing", true).order("updated_at", { ascending: false });
    if (scope.type !== "all") query = query.in("employee_id", scope.userIds);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ data: data.map(map) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "locations.share_self");
    const body = await request.json();
    if (body.sharing === false) {
      const { data, error } = await client.from("employee_locations").upsert({ employee_id: profile.id, sharing: false, updated_at: new Date().toISOString() }).select(locationSelect).single();
      if (error) throw error;
      return Response.json({ data: map(data) });
    }
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracy);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ApiError("Valid latitude and longitude are required.");
    }
    const now = new Date().toISOString();
    const record = { employee_id: profile.id, latitude, longitude, accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null, sharing: true, recorded_at: now, updated_at: now };
    const [{ data, error }, { error: historyError }] = await Promise.all([
      client.from("employee_locations").upsert(record).select(locationSelect).single(),
      client.from("location_history").insert({ employee_id: profile.id, latitude, longitude, accuracy: record.accuracy, recorded_at: now })
    ]);
    if (error) throw error;
    if (historyError) throw historyError;
    return Response.json({ data: map(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}
