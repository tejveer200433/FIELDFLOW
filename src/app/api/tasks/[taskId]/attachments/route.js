import { ApiError, apiFailure, requireAnyPermission } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";
const bucket = "task-attachments";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "application/zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);

async function scopedTask(session, taskId) {
  const { data: allowed, error } = await session.client.rpc("can_access_task", { p_task_id: taskId });
  if (error || !allowed) throw new ApiError("Task not found in your permitted scope.", 404);
}

const map = item => ({ id: item.id, name: item.file_name, contentType: item.content_type, size: item.size_bytes, createdAt: item.created_at, uploadedBy: item.uploaded_by });

export async function GET(request, { params }) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const { taskId } = await params;
    await scopedTask(session, taskId);
    const id = new URL(request.url).searchParams.get("id");
    let query = session.client.from("task_attachments").select("*").eq("task_id", taskId);
    if (id) query = query.eq("id", id);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    if (id) {
      const attachment = data?.[0];
      if (!attachment) throw new ApiError("Attachment not found in your permitted scope.", 404);
      const { data: signed, error: signedError } = await session.client.storage.from(bucket).createSignedUrl(attachment.object_path, 300);
      if (signedError) throw signedError;
      return Response.json({ data: { ...map(attachment), url: signed.signedUrl } });
    }
    return Response.json({ data: (data || []).map(map) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request, { params }) {
  let uploadedPath = "";
  let client;
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    client = session.client;
    const { taskId } = await params;
    await scopedTask(session, taskId);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new ApiError("Choose a file to upload.");
    if (file.size > 20 * 1024 * 1024) throw new ApiError("Files must be 20 MB or smaller.");
    if (!allowedTypes.has(file.type)) throw new ApiError("This file type is not allowed.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "attachment";
    uploadedPath = `${session.profile.id}/${taskId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from(bucket).upload(uploadedPath, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await client.from("task_attachments").insert({ task_id: taskId, uploaded_by: session.profile.id, object_path: uploadedPath, file_name: file.name.slice(0, 255), content_type: file.type, size_bytes: file.size }).select("*").single();
    if (error) throw error;
    return Response.json({ data: map(data) }, { status: 201 });
  } catch (error) {
    if (client && uploadedPath) await client.storage.from(bucket).remove([uploadedPath]).catch(() => {});
    return apiFailure(error);
  }
}
