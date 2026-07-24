export const PERMISSIONS = {
  dashboardView: "dashboard.view",
  employeesViewAll: "employees.view_all",
  employeesManage: "employees.manage",
  teamsManage: "teams.manage",
  rolesManage: "roles.manage",
  settingsManage: "settings.manage",
  attendanceViewSelf: "attendance.view_self",
  attendanceViewTeam: "attendance.view_team",
  attendanceViewAll: "attendance.view_all",
  attendanceApprove: "attendance.approve",
  locationsShareSelf: "locations.share_self",
  locationsViewTeam: "locations.view_team",
  locationsViewAll: "locations.view_all",
  tasksViewSelf: "tasks.view_self",
  tasksAssign: "tasks.assign",
  tasksManageAll: "tasks.manage_all",
  projectsViewSelf: "projects.view_self",
  projectsReview: "projects.review",
  projectsManage: "projects.manage",
  reportsSubmit: "reports.submit",
  reportsReview: "reports.review",
  expensesSubmit: "expenses.submit",
  expensesApprove: "expenses.approve",
  sosCreate: "sos.create",
  sosViewTeam: "sos.view_team",
  sosResolve: "sos.resolve",
  salesViewSelf: "sales.view_self",
  salesManage: "sales.manage"
};

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);

const legacyTemplates = {
  admin: ALL_PERMISSION_KEYS,
  manager: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.employeesViewAll,
    PERMISSIONS.attendanceViewAll,
    PERMISSIONS.attendanceApprove,
    PERMISSIONS.locationsViewAll,
    PERMISSIONS.tasksAssign,
    PERMISSIONS.tasksManageAll,
    PERMISSIONS.projectsManage,
    PERMISSIONS.projectsReview,
    PERMISSIONS.reportsReview,
    PERMISSIONS.expensesApprove,
    PERMISSIONS.sosViewTeam,
    PERMISSIONS.sosResolve
  ],
  employee: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.attendanceViewSelf,
    PERMISSIONS.locationsShareSelf,
    PERMISSIONS.tasksViewSelf,
    PERMISSIONS.projectsViewSelf,
    PERMISSIONS.reportsSubmit,
    PERMISSIONS.expensesSubmit,
    PERMISSIONS.sosCreate,
    PERMISSIONS.salesViewSelf
  ]
};

export function legacyAccess(role) {
  const permissions = legacyTemplates[role] || legacyTemplates.employee;
  return {
    isOwner: role === "admin",
    legacyRole: role || "employee",
    role: {
      id: null,
      name: role === "admin" ? "Owner" : role === "manager" ? "Management" : "Standard Employee",
      description: "Legacy compatibility access",
      isSystem: true,
      isActive: true
    },
    permissions
  };
}

export function hasPermission(access, permission) {
  return Boolean(access?.isOwner || access?.permissions?.includes(permission));
}

export function hasAnyPermission(access, permissions) {
  return permissions.some(permission => hasPermission(access, permission));
}

export function workspaceForAccess(access) {
  if (hasAnyPermission(access, [
    PERMISSIONS.rolesManage,
    PERMISSIONS.settingsManage,
    PERMISSIONS.employeesManage,
    PERMISSIONS.teamsManage
  ])) return "admin";

  if (hasAnyPermission(access, [
    PERMISSIONS.employeesViewAll,
    PERMISSIONS.tasksAssign,
    PERMISSIONS.tasksManageAll,
    PERMISSIONS.projectsManage,
    PERMISSIONS.projectsReview,
    PERMISSIONS.reportsReview,
    PERMISSIONS.expensesApprove,
    PERMISSIONS.attendanceViewTeam,
    PERMISSIONS.attendanceViewAll,
    PERMISSIONS.locationsViewTeam,
    PERMISSIONS.locationsViewAll,
    PERMISSIONS.sosViewTeam,
    PERMISSIONS.sosResolve
  ])) return "manager";

  return "employee";
}
