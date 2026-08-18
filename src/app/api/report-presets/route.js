import { ApiError, apiFailure, requirePermission } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";
const allowedFilterKeys = new Set(["status", "employeeId", "teamId", "taskId", "from", "to"]);
const frequencies = ["daily", "weekly", "monthly"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const select = "id,name,kind,filters,recipient_email,frequency,active,last_sent_at,next_send_at,created_at";
const map = row => ({ id: row.id, name: row.name, kind: row.kind, filters: row.filters || {}, recipientEmail: row.recipient_email, frequency: row.frequency, active: row.active, lastSentAt: row.last_sent_at, nextSendAt: row.next_send_at, createdAt: row.created_at });

function safeFilters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("Report filters are required.");
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => allowedFilterKeys.has(key) && typeof item === "string" && item.length <= 160));
}

export async function GET(request) {
  try {
    const { client } = await requirePermission(request, "reports.review");
    const { data, error } = await client.from("report_presets").select(select).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json({ data: (data || []).map(map) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "reports.review");
    const body = await request.json();
    if (!String(body.name || "").trim()) throw new ApiError("Preset name is required.");
    if (!["view", "schedule"].includes(body.kind)) throw new ApiError("Invalid preset type.");
    if (body.kind === "schedule" && (!emailPattern.test(body.recipientEmail || "") || !frequencies.includes(body.frequency))) throw new ApiError("A valid recipient and frequency are required.");
    const { data, error } = await client.from("report_presets").insert({ owner_id: profile.id, name: String(body.name).trim().slice(0, 120), kind: body.kind, filters: safeFilters(body.filters), recipient_email: body.kind === "schedule" ? body.recipientEmail.toLowerCase() : null, frequency: body.kind === "schedule" ? body.frequency : null }).select(select).single();
    if (error) throw error;
    return Response.json({ data: map(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request) {
  try {
    const { client } = await requirePermission(request, "reports.review");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ApiError("Preset id is required.");
    const { error } = await client.from("report_presets").delete().eq("id", id);
    if (error) throw error;
    return Response.json({ message: "Report preset removed." });
  } catch (error) {
    return apiFailure(error);
  }
}
