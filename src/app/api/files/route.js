import { ApiError, apiFailure, requireAnyPermission } from "@/lib/supabaseServer";

export async function GET(request) {
  try {
    const { client } = await requireAnyPermission(request, ["projects.view_self", "projects.review", "projects.manage"]);
    const path = new URL(request.url).searchParams.get("path");
    if (!path) throw new ApiError("File path is required.");
    const { data: file, error: fileError } = await client.from("submission_files").select("id").eq("object_path", path).maybeSingle();
    if (fileError) throw fileError;
    if (!file) throw new ApiError("File not found in your permitted project scope.", 404);
    const { data, error } = await client.storage.from("work-submissions").createSignedUrl(path, 300);
    if (error) throw error;
    return Response.json({ data: { url: data.signedUrl } });
  } catch (error) {
    return apiFailure(error);
  }
}
