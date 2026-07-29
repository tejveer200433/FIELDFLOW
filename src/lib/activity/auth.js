import { getTeamMemberIds, requireSession } from "@/lib/supabaseServer";
import { ActivityError } from "@/lib/activity/responses";

export const ACTIVITY_PERMISSIONS = Object.freeze({
  viewSelf: "activity.view_self",
  viewTeam: "activity.view_team",
  viewAll: "activity.view_all",
  managePolicies: "activity.policies.manage"
});

export function activityCan(access, permission) {
  return Boolean(access?.isOwner || access?.permissions?.includes(permission));
}

export async function requireActivitySession(request, permissions = []) {
  const session = await requireSession(request);
  if (permissions.length && !permissions.some(permission => activityCan(session.access, permission))) {
    throw new ActivityError("ACCESS_DENIED", "You do not have permission for this activity resource.", 403);
  }
  return session;
}

export async function resolveActivityScope(session, { allowSelf = true, allowTeam = true, allowAll = true } = {}) {
  if (session.access.isOwner || (allowAll && activityCan(session.access, ACTIVITY_PERMISSIONS.viewAll))) {
    return { type: "all", userIds: null };
  }
  if (allowTeam && activityCan(session.access, ACTIVITY_PERMISSIONS.viewTeam)) {
    return { type: "team", userIds: await getTeamMemberIds(session) };
  }
  if (allowSelf && activityCan(session.access, ACTIVITY_PERMISSIONS.viewSelf)) {
    return { type: "self", userIds: [session.profile.id] };
  }
  throw new ActivityError("ACCESS_DENIED", "You do not have permission for this activity resource.", 403);
}

export function assertActivityEmployee(scope, employeeId) {
  if (scope.type !== "all" && !scope.userIds.includes(employeeId)) {
    throw new ActivityError("EMPLOYEE_OUT_OF_SCOPE", "The selected employee is outside your activity scope.", 403);
  }
}
