import { ApiError, apiFailure, mapProfile, requireSession } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { client } = await requireSession(request, ["manager", "admin"]);
    const { data, error } = await client.from("profiles").select("id,full_name,email,role,requested_role,approval_status,department,active,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ data: data.map(mapProfile) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}

export async function PATCH(request) {
  try {
    const { client, profile: administrator } = await requireSession(request, ["admin"]);
    const body = await request.json();
    if (!body.id || !["approved", "rejected"].includes(body.approvalStatus)) throw new ApiError("A valid account and approval decision are required.");
    if (body.id === administrator.id && body.approvalStatus === "rejected") throw new ApiError("You cannot reject your own administrator account.", 409);

    const { data: target, error: targetError } = await client.from("profiles").select("id,requested_role").eq("id", body.id).single();
    if (targetError || !target) throw new ApiError("The requested account was not found.", 404);

    const update = {
      approval_status: body.approvalStatus,
      active: body.approvalStatus === "approved",
      updated_at: new Date().toISOString()
    };
    if (body.approvalStatus === "approved") update.role = target.requested_role;

    const { data, error } = await client.from("profiles").update(update).eq("id", body.id).select("id,full_name,email,role,requested_role,approval_status,department,active").single();
    if (error) throw error;
    return Response.json({ data: mapProfile(data), message: body.approvalStatus === "approved" ? `${data.full_name} can now sign in as ${data.role}.` : `${data.full_name}'s account request was rejected.` });
  } catch (error) { return apiFailure(error); }
}
