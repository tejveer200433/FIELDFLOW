export function mapSubmission(row) {
  return { id:row.id,assignmentId:row.assignment_id,employeeId:row.employee_id,version:row.version,summary:row.summary,workStatus:row.work_status,externalLink:row.external_link||"",employeeComment:row.employee_comment||"",reviewerComment:row.reviewer_comment||"",reviewedBy:row.reviewed_by,reviewedAt:row.reviewed_at,createdAt:row.created_at,files:(row.submission_files||[]).map(file=>({id:file.id,path:file.object_path,name:file.file_name,contentType:file.content_type,size:file.size_bytes})) };
}
export function mapAssignment(row) {
  return { id:row.id,moduleId:row.module_id,employeeId:row.employee_id,employee:row.employee?.full_name||"Employee",employeeEmail:row.employee?.email||"",reviewerId:row.reviewer_id,reviewer:row.reviewer?.full_name||"Reviewer",startDate:row.start_date,deadline:row.deadline,priority:row.priority,notes:row.employee_notes||"",status:row.status,checklistProgress:row.checklist_progress||[],startedAt:row.started_at,completedAt:row.completed_at,createdAt:row.created_at,updatedAt:row.updated_at,submissions:(row.work_submissions||[]).map(mapSubmission).sort((a,b)=>b.version-a.version) };
}
export function mapModule(row) {
  return { id:row.id,projectId:row.project_id,title:row.title,description:row.description||"",checklist:row.checklist||[],sortOrder:row.sort_order,assignments:(row.work_assignments||[]).map(mapAssignment) };
}
export function mapProject(row) {
  const modules=(row.project_modules||[]).map(mapModule).sort((a,b)=>a.sortOrder-b.sortOrder);
  const assignments=modules.flatMap(module=>module.assignments);
  const completed=assignments.filter(item=>item.status==="Completed").length;
  return { id:row.id,title:row.title,clientCompany:row.client_company||"",contactPerson:row.contact_person||"",contactPhone:row.contact_phone||"",siteAddress:row.site_address||"",siteLat:row.site_lat,siteLng:row.site_lng,category:row.category,description:row.description||"",expectedOutcome:row.expected_outcome||"",startDate:row.start_date,deadline:row.deadline,priority:row.priority,status:row.status,ownerId:row.owner_id,owner:row.owner?.full_name||"",createdAt:row.created_at,updatedAt:row.updated_at,modules,progress:assignments.length?Math.round(completed/assignments.length*100):0 };
}
export const projectSelect = `*,owner:profiles!projects_owner_id_fkey(full_name,email),project_modules(*,work_assignments(*,employee:profiles!work_assignments_employee_id_fkey(full_name,email),reviewer:profiles!work_assignments_reviewer_id_fkey(full_name,email),work_submissions(*,submission_files(*))))`;
