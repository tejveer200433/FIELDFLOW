import { ApiError, apiFailure, requireAnyPermission, requirePermission } from "@/lib/supabaseServer";
import { mapAssignment } from "@/lib/projectData";

const assignmentSelect = "*,employee:profiles!work_assignments_employee_id_fkey(full_name,email),reviewer:profiles!work_assignments_reviewer_id_fkey(full_name,email),work_submissions(*,submission_files(*))";
const employeeStatuses = ["Not Started", "In Progress", "Submitted for Review"];
const managementStatuses = [...employeeStatuses, "Needs Changes", "Completed"];

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "projects.manage");
    const body = await request.json();
    if (!body.moduleId || !body.employeeId || !body.reviewerId || !body.startDate || !body.deadline) {
      throw new ApiError("Module, employee, reviewer, start date and deadline are required.");
    }
    const { data: people, error: peopleError } = await client.from("profiles").select("id,active,approval_status").in("id", [body.employeeId, body.reviewerId]);
    if (peopleError) throw peopleError;
    const employee = people.find(item => item.id === body.employeeId);
    const reviewer = people.find(item => item.id === body.reviewerId);
    if (!employee?.active || employee.approval_status !== "approved") throw new ApiError("Choose an approved active assignee.");
    if (!reviewer?.active || reviewer.approval_status !== "approved") throw new ApiError("Choose an approved active reviewer.");
    const { data, error } = await client.from("work_assignments").insert({
      module_id: body.moduleId,
      employee_id: body.employeeId,
      reviewer_id: body.reviewerId,
      start_date: body.startDate,
      deadline: body.deadline,
      priority: body.priority || "Medium",
      employee_notes: String(body.notes || "").slice(0, 3000) || null,
      created_by: profile.id
    }).select(assignmentSelect).single();
    if (error?.code === "23505") throw new ApiError("This user is already assigned to this module.", 409);
    if (error) throw error;
    return Response.json({ data: mapAssignment(data) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireAnyPermission(request, ["projects.view_self", "projects.review", "projects.manage"]);
    const body = await request.json();
    if (!body.id || !managementStatuses.includes(body.status)) throw new ApiError("Assignment and valid status are required.");
    const { data: assignment, error: findError } = await session.client.from("work_assignments").select("id,employee_id,reviewer_id").eq("id", body.id).single();
    if (findError || !assignment) throw new ApiError("Assignment not found in your permitted scope.", 404);

    let error;
    if (assignment.employee_id === session.profile.id) {
      if (!session.access.isOwner && !session.access.permissions.includes("projects.view_self")) throw new ApiError("You cannot update this assignment.", 403);
      if (!employeeStatuses.includes(body.status)) throw new ApiError("Assigned users cannot set this status.", 403);
      ({ error } = await session.client.rpc("update_my_assignment", {
        p_assignment_id: body.id,
        p_status: body.status,
        p_checklist_progress: Array.isArray(body.checklistProgress) ? body.checklistProgress : null
      }));
    } else {
      const canManage = session.access.isOwner || session.access.permissions.includes("projects.manage");
      const canReview = assignment.reviewer_id === session.profile.id && session.access.permissions.includes("projects.review");
      if (!canManage && !canReview) throw new ApiError("You cannot update this assignment.", 403);
      const update = { status: body.status, updated_at: new Date().toISOString() };
      if (Array.isArray(body.checklistProgress)) update.checklist_progress = body.checklistProgress;
      if (body.status === "Completed") update.completed_at = new Date().toISOString();
      if (body.status === "In Progress") update.started_at = new Date().toISOString();
      ({ error } = await session.client.from("work_assignments").update(update).eq("id", body.id));
    }
    if (error) throw error;
    const { data, error: readError } = await session.client.from("work_assignments").select(assignmentSelect).eq("id", body.id).single();
    if (readError) throw readError;
    return Response.json({ data: mapAssignment(data) });
  } catch (error) {
    return apiFailure(error);
  }
}
