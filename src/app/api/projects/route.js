import { ApiError, apiFailure, requireAnyPermission, requirePermission } from "@/lib/supabaseServer";
import { mapProject, projectSelect } from "@/lib/projectData";

export const dynamic = "force-dynamic";
const allowedCategory = ["Visit", "Installation", "Service", "Sales", "Collection", "Software", "Other"];
const allowedPriority = ["Low", "Medium", "High", "Urgent"];
const allowedStatus = ["Planning", "Active", "On Hold", "Completed", "Cancelled"];

export async function GET(request) {
  try {
    const { client } = await requireAnyPermission(request, ["projects.view_self", "projects.review", "projects.manage"]);
    let query = client.from("projects").select(projectSelect).order("created_at", { ascending: false });
    const id = new URL(request.url).searchParams.get("id");
    if (id) query = query.eq("id", id);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ data: data.map(mapProject) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "projects.manage");
    const body = await request.json();
    if (!body.title?.trim()) throw new ApiError("Project title is required.");
    if (body.category && !allowedCategory.includes(body.category)) throw new ApiError("Invalid project category.");
    if (body.priority && !allowedPriority.includes(body.priority)) throw new ApiError("Invalid priority.");
    const record = {
      title: String(body.title).trim().slice(0, 180),
      client_company: String(body.clientCompany || "").slice(0, 180) || null,
      contact_person: String(body.contactPerson || "").slice(0, 120) || null,
      contact_phone: String(body.contactPhone || "").slice(0, 40) || null,
      site_address: String(body.siteAddress || "").slice(0, 500) || null,
      site_lat: Number.isFinite(Number(body.siteLat)) ? Number(body.siteLat) : null,
      site_lng: Number.isFinite(Number(body.siteLng)) ? Number(body.siteLng) : null,
      category: body.category || "Other",
      description: String(body.description || "").slice(0, 5000) || null,
      expected_outcome: String(body.expectedOutcome || "").slice(0, 3000) || null,
      start_date: body.startDate || null,
      deadline: body.deadline || null,
      priority: body.priority || "Medium",
      status: "Planning",
      owner_id: body.ownerId || profile.id,
      created_by: profile.id
    };
    const { data, error } = await client.from("projects").insert(record).select(projectSelect).single();
    if (error) throw error;
    return Response.json({ data: mapProject(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const { client } = await requirePermission(request, "projects.manage");
    const body = await request.json();
    if (!body.id) throw new ApiError("Project id is required.");
    const update = { updated_at: new Date().toISOString() };
    if (body.status) {
      if (!allowedStatus.includes(body.status)) throw new ApiError("Invalid project status.");
      update.status = body.status;
    }
    if (body.title) update.title = String(body.title).slice(0, 180);
    if (body.deadline !== undefined) update.deadline = body.deadline || null;
    const { data, error } = await client.from("projects").update(update).eq("id", body.id).select(projectSelect).single();
    if (error) throw error;
    return Response.json({ data: mapProject(data) });
  } catch (error) {
    return apiFailure(error);
  }
}
