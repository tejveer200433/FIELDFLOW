import { ApiError, apiFailure, requireAnyPermission, requirePermission } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const locationSelect = "id,name,latitude,longitude,radius_m,active,created_by,created_at,updated_at";
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function mapLocation(row) {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusM: row.radius_m,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function textName(value) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > 160) {
    throw new ApiError("Location name must be between 2 and 160 characters.");
  }
  return name;
}

function coordinate(value, type) {
  if (value === "" || value === null || value === undefined) {
    throw new ApiError(`Enter a valid ${type}.`);
  }
  const number = Number(value);
  const valid = Number.isFinite(number) && (type === "latitude"
    ? number >= -90 && number <= 90
    : number >= -180 && number <= 180);
  if (!valid) throw new ApiError(`Enter a valid ${type}.`);
  return number;
}

function radius(value) {
  if (value === "" || value === null || value === undefined) {
    throw new ApiError("Allowed radius must be a whole number from 25 to 5000 metres.");
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 25 || number > 5000) {
    throw new ApiError("Allowed radius must be a whole number from 25 to 5000 metres.");
  }
  return number;
}

export async function GET(request) {
  try {
    const { client, access, profile } = await requireAnyPermission(request, ["attendance.view_self", "attendance.view_team", "attendance.view_all", "settings.manage"]);
    let query = client.from("attendance_locations").select(locationSelect).order("name");
    if (!access.permissions.includes("settings.manage") && !access.isOwner) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) throw error;

    let visible = data;
    if (!access.isOwner
      && !access.permissions.includes("settings.manage")
      && access.permissions.includes("attendance.view_self")
      && !access.permissions.includes("attendance.view_team")
      && !access.permissions.includes("attendance.view_all")) {
      const assignmentsResult = await client.from("attendance_geofence_assignments")
        .select("location_id,target_type,team_id,employee_id,project_id,event_type,valid_from,valid_until,active");
      if (!assignmentsResult.error) {
        const [membershipsResult, workResult] = await Promise.all([
          client.from("team_members").select("team_id").eq("user_id", profile.id),
          client.from("work_assignments").select("module_id").eq("employee_id", profile.id)
        ]);
        const moduleIds = (workResult.data || []).map(item => item.module_id);
        const modulesResult = moduleIds.length
          ? await client.from("project_modules").select("id,project_id").in("id", moduleIds)
          : { data: [] };
        const teamIds = new Set((membershipsResult.data || []).map(item => item.team_id));
        const projectIds = new Set((modulesResult.data || []).map(item => item.project_id));
        const today = new Date().toISOString().slice(0, 10);
        const locationIds = new Set((assignmentsResult.data || []).filter(assignment =>
          assignment.active
          && (!assignment.valid_from || assignment.valid_from <= today)
          && (!assignment.valid_until || assignment.valid_until >= today)
          && (
            assignment.target_type === "all"
            || (assignment.target_type === "employee" && assignment.employee_id === profile.id)
            || (assignment.target_type === "team" && teamIds.has(assignment.team_id))
            || (assignment.target_type === "project" && projectIds.has(assignment.project_id))
          )
        ).map(assignment => assignment.location_id));
        visible = data.filter(location => locationIds.has(location.id));
      }
    }

    return Response.json(
      { data: visible.map(mapLocation) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "settings.manage");
    const body = await request.json();
    const values = {
      name: textName(body.name),
      latitude: coordinate(body.latitude, "latitude"),
      longitude: coordinate(body.longitude, "longitude"),
      radius_m: radius(body.radiusM ?? 200),
      active: body.active === undefined ? true : body.active,
      created_by: profile.id
    };
    if (typeof values.active !== "boolean") throw new ApiError("Location status must be enabled or disabled.");

    const { data, error } = await client
      .from("attendance_locations")
      .insert(values)
      .select(locationSelect)
      .single();
    if (error) throw error;
    return Response.json({ data: mapLocation(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const { client } = await requirePermission(request, "settings.manage");
    const body = await request.json();
    if (!body.id) throw new ApiError("Select an attendance location to update.");

    const values = {};
    if (has(body, "name")) values.name = textName(body.name);
    if (has(body, "latitude")) values.latitude = coordinate(body.latitude, "latitude");
    if (has(body, "longitude")) values.longitude = coordinate(body.longitude, "longitude");
    if (has(body, "radiusM")) values.radius_m = radius(body.radiusM);
    if (has(body, "active")) {
      if (typeof body.active !== "boolean") throw new ApiError("Location status must be enabled or disabled.");
      values.active = body.active;
    }
    if (!Object.keys(values).length) throw new ApiError("Provide at least one location change.");

    const { data, error } = await client
      .from("attendance_locations")
      .update(values)
      .eq("id", body.id)
      .select(locationSelect)
      .single();
    if (error?.code === "PGRST116") throw new ApiError("Attendance location not found.", 404);
    if (error) throw error;
    return Response.json({ data: mapLocation(data) });
  } catch (error) {
    return apiFailure(error);
  }
}
