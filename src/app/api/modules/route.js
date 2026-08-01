import { ApiError, apiFailure, requirePermission } from "@/lib/supabaseServer";
import { mapModule } from "@/lib/projectData";

const moduleSelect = "*,work_assignments(*,employee:profiles!work_assignments_employee_id_fkey(full_name,email),reviewer:profiles!work_assignments_reviewer_id_fkey(full_name,email),work_submissions(*,submission_files(*)))";

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "projects.manage");
    const body = await request.json();
    if (!body.projectId || !body.title?.trim()) throw new ApiError("Project and module title are required.");
    const checklist = Array.isArray(body.checklist)
      ? body.checklist.map(item => String(item).trim()).filter(Boolean).slice(0, 50)
      : String(body.checklist || "").split("\n").map(item => item.trim()).filter(Boolean).slice(0, 50);
    const { data, error } = await client.from("project_modules").insert({
      project_id: body.projectId,
      title: String(body.title).trim().slice(0, 180),
      description: String(body.description || "").slice(0, 5000) || null,
      checklist,
      sort_order: Number(body.sortOrder) || 0,
      created_by: profile.id
    }).select(moduleSelect).single();
    if (error) throw error;
    return Response.json({ data: mapModule(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request) {
  try {
    const { client } = await requirePermission(request, "projects.manage");
    const body = await request.json();
    if (!body.id) throw new ApiError("Module id is required.");

    const { data: module, error: moduleError } = await client
      .from("project_modules")
      .select("id,title,work_assignments(work_submissions(submission_files(object_path)))")
      .eq("id", body.id)
      .maybeSingle();
    if (moduleError) throw moduleError;
    if (!module) throw new ApiError("Module not found.", 404);

    const paths = (module.work_assignments || [])
      .flatMap(assignment => assignment.work_submissions || [])
      .flatMap(submission => submission.submission_files || [])
      .map(file => file.object_path)
      .filter(Boolean);
    for (let index = 0; index < paths.length; index += 100) {
      const { error: storageError } = await client.storage
        .from("work-submissions")
        .remove(paths.slice(index, index + 100));
      if (storageError) throw storageError;
    }

    const { error } = await client.from("project_modules").delete().eq("id", body.id);
    if (error) throw error;
    return Response.json({ message: `Module "${module.title}" was permanently deleted.` });
  } catch (error) {
    return apiFailure(error);
  }
}
