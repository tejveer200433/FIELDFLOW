import { ApiError, apiFailure, requireAnyPermission, requirePermission } from "@/lib/supabaseServer";
import { mapSubmission } from "@/lib/projectData";

const submissionSelect = "*,submission_files(*)";

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "projects.view_self");
    const body = await request.json();
    if (!body.assignmentId || !body.summary?.trim()) throw new ApiError("Assignment and completed-work summary are required.");
    const { data: assignment, error: assignmentError } = await client.from("work_assignments").select("id,employee_id").eq("id", body.assignmentId).single();
    if (assignmentError || assignment?.employee_id !== profile.id) throw new ApiError("This work is not assigned to you.", 403);
    const { data: latest, error: latestError } = await client.from("work_submissions").select("version").eq("assignment_id", body.assignmentId).order("version", { ascending: false }).limit(1);
    if (latestError) throw latestError;
    const version = (latest?.[0]?.version || 0) + 1;
    const { data, error } = await client.from("work_submissions").insert({
      assignment_id: body.assignmentId,
      employee_id: profile.id,
      version,
      summary: String(body.summary).trim().slice(0, 10000),
      external_link: String(body.externalLink || "").slice(0, 1000) || null,
      employee_comment: String(body.comment || "").slice(0, 3000) || null
    }).select(submissionSelect).single();
    if (error) throw error;
    if (Array.isArray(body.files) && body.files.length) {
      const rows = body.files.slice(0, 10).map(file => ({
        submission_id: data.id,
        uploaded_by: profile.id,
        object_path: String(file.path),
        file_name: String(file.name).slice(0, 255),
        content_type: String(file.type || "").slice(0, 120) || null,
        size_bytes: Number(file.size) || null
      }));
      const { error: fileError } = await client.from("submission_files").insert(rows);
      if (fileError) throw fileError;
    }
    const { error: updateError } = await client.rpc("update_my_assignment", {
      p_assignment_id: body.assignmentId,
      p_status: "Submitted for Review",
      p_checklist_progress: Array.isArray(body.checklistProgress) ? body.checklistProgress : null
    });
    if (updateError) throw updateError;
    const { data: complete, error: readError } = await client.from("work_submissions").select(submissionSelect).eq("id", data.id).single();
    if (readError) throw readError;
    return Response.json({ data: mapSubmission(complete), message: "Work submitted to the reviewer." }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireAnyPermission(request, ["projects.review", "projects.manage"]);
    const body = await request.json();
    if (!body.id || !["Approved", "Needs Changes"].includes(body.decision)) throw new ApiError("Submission and review decision are required.");
    const { data: submission, error: findError } = await session.client.from("work_submissions").select("id,assignment_id").eq("id", body.id).single();
    if (findError || !submission) throw new ApiError("Submission not found in your review scope.", 404);
    const { data: assignment, error: assignmentFindError } = await session.client.from("work_assignments").select("id,reviewer_id").eq("id", submission.assignment_id).single();
    if (assignmentFindError || !assignment) throw new ApiError("Assignment not found in your review scope.", 404);
    const canManage = session.access.isOwner || session.access.permissions.includes("projects.manage");
    const canReview = session.access.permissions.includes("projects.review") && assignment.reviewer_id === session.profile.id;
    if (!canManage && !canReview) throw new ApiError("This submission is assigned to another reviewer.", 403);

    const { data, error } = await session.client.from("work_submissions").update({
      work_status: body.decision,
      reviewer_comment: String(body.comment || "").slice(0, 3000) || null,
      reviewed_by: session.profile.id,
      reviewed_at: new Date().toISOString()
    }).eq("id", body.id).select(submissionSelect).single();
    if (error) throw error;
    const assignmentStatus = body.decision === "Approved" ? "Completed" : "Needs Changes";
    const { error: assignmentError } = await session.client.from("work_assignments").update({
      status: assignmentStatus,
      updated_at: new Date().toISOString(),
      completed_at: body.decision === "Approved" ? new Date().toISOString() : null
    }).eq("id", submission.assignment_id);
    if (assignmentError) throw assignmentError;
    return Response.json({
      data: mapSubmission(data),
      assignmentStatus,
      message: body.decision === "Approved" ? "Submission approved and work completed." : "Changes requested from the assigned user."
    });
  } catch (error) {
    return apiFailure(error);
  }
}
