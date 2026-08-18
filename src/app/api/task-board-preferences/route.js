import { ApiError, apiFailure, requireAnyPermission } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";

const statusIds = ["Assigned", "On The Way", "In Progress", "Completed", "Blocked"];
const defaults = [
  { id: "Assigned", label: "Assigned", color: "#64748b", order: 0 },
  { id: "On The Way", label: "On The Way", color: "#8b5cf6", order: 1 },
  { id: "In Progress", label: "In Progress", color: "#3b82f6", order: 2 },
  { id: "Completed", label: "Completed", color: "#10b981", order: 3 },
  { id: "Blocked", label: "Blocked", color: "#f43f5e", order: 4 }
];

function validateColumns(value) {
  if (!Array.isArray(value) || value.length !== statusIds.length) throw new ApiError("All five workflow columns are required.");
  const ids = value.map(item => item?.id);
  if (new Set(ids).size !== statusIds.length || statusIds.some(id => !ids.includes(id))) throw new ApiError("Workflow columns cannot add or remove task states.");
  const normalized = value.map((item, index) => {
    const label = String(item.label || "").trim();
    const color = String(item.color || "");
    if (!label || label.length > 40) throw new ApiError("Workflow labels must contain 1 to 40 characters.");
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new ApiError("Workflow colors must use six-digit hex values.");
    const order = Number(item.order);
    if (!Number.isInteger(order) || order < 0 || order > 4) throw new ApiError("Workflow order must be between 0 and 4.");
    return { id: item.id, label, color: color.toLowerCase(), order: Number.isInteger(order) ? order : index };
  }).sort((a, b) => a.order - b.order);
  if (new Set(normalized.map(item => item.order)).size !== statusIds.length) throw new ApiError("Each workflow column requires a unique order.");
  return normalized;
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.assign", "tasks.manage_all"]);
    const { data, error } = await session.client.from("task_board_preferences").select("columns").eq("user_id", session.profile.id).maybeSingle();
    if (error) throw error;
    return Response.json({ data: data?.columns || defaults });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PUT(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.assign", "tasks.manage_all"]);
    const body = await request.json();
    const columns = validateColumns(body.columns);
    const { data, error } = await session.client.from("task_board_preferences").upsert({
      user_id: session.profile.id,
      columns,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" }).select("columns").single();
    if (error) throw error;
    return Response.json({ data: data.columns });
  } catch (error) {
    return apiFailure(error);
  }
}
