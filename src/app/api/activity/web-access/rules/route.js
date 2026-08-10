import { getActivityProfiles } from "@/lib/activity/data";
import { activityCan, assertActivityEmployee, requireActivitySession, ACTIVITY_PERMISSIONS, resolveActivityScope } from "@/lib/activity/auth";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseWebAccessRule } from "@/lib/activity/webAccess.mjs";

export const dynamic = "force-dynamic";
const select = "id,name,scope_type,scope_id,enforcement_enabled,priority,blocked_categories,blocked_domains,allowed_domains,blocked_applications,schedule_timezone,schedule_days,schedule_start,schedule_end,require_managed_extension,enabled,created_at,updated_at";
const map = row => ({ id: row.id, name: row.name, scopeType: row.scope_type, scopeId: row.scope_id, enforcementEnabled: row.enforcement_enabled, priority: row.priority, blockedCategories: row.blocked_categories || [], blockedDomains: row.blocked_domains || [], allowedDomains: row.allowed_domains || [], blockedApplications: row.blocked_applications || [], scheduleTimezone: row.schedule_timezone, scheduleDays: row.schedule_days || [], scheduleStart: String(row.schedule_start).slice(0,5), scheduleEnd: String(row.schedule_end).slice(0,5), requireManagedExtension: row.require_managed_extension, enabled: row.enabled, createdAt: row.created_at, updatedAt: row.updated_at });

function isGlobalManager(session) {
  return session.access.isOwner
    || activityCan(session.access, ACTIVITY_PERMISSIONS.viewAll)
    || activityCan(session.access, ACTIVITY_PERMISSIONS.managePolicies)
    || activityCan(session.access, ACTIVITY_PERMISSIONS.manageWebAccess);
}

async function assertManageableScope(session, body) {
  if (isGlobalManager(session)) return;
  const scope = await resolveActivityScope(session, { allowSelf: false, allowAll: false });
  if (body.scopeType === "employee") return assertActivityEmployee(scope, body.scopeId);
  if (body.scopeType === "device") {
    const { data, error } = await session.client.from("employee_devices").select("employee_id").eq("id", body.scopeId).single();
    if (error || !data) throw new ActivityError("DEVICE_OUT_OF_SCOPE", "The selected device is outside your team.", 403);
    return assertActivityEmployee(scope, data.employee_id);
  }
  if (body.scopeType === "team") {
    const { data, error } = await session.client.from("teams").select("id").eq("id", body.scopeId).eq("supervisor_id", session.profile.id).maybeSingle();
    if (error || !data) throw new ActivityError("TEAM_OUT_OF_SCOPE", "You can manage restrictions only for a team you supervise.", 403);
    return;
  }
  throw new ActivityError("SCOPE_OUT_OF_SCOPE", "Organisation and role policies require administrator access.", 403);
}

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.viewAll, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.reviewWebAccess, ACTIVITY_PERMISSIONS.manageWebAccess]);
    const scope = await resolveActivityScope(session, { allowSelf: false });
    const globalManager = isGlobalManager(session);
    let teamsQuery = session.client.from("teams").select("id,name,supervisor_id").order("name");
    if (!globalManager) teamsQuery = teamsQuery.eq("supervisor_id", session.profile.id);
    let devicesQuery = session.client.from("employee_devices").select("id,employee_id,device_name,status").neq("status", "revoked").order("device_name");
    if (!globalManager && scope.userIds) devicesQuery = scope.userIds.length ? devicesQuery.in("employee_id", scope.userIds) : devicesQuery.eq("employee_id", session.profile.id);
    const [{ data: rules, error }, profiles, teamsResult, rolesResult, categoriesResult, devicesResult] = await Promise.all([
      session.client.from("web_access_rules").select(select).order("priority", { ascending: false }),
      getActivityProfiles(session.client, scope.userIds),
      teamsQuery,
      globalManager ? session.client.from("roles").select("id,name").eq("is_active", true).order("name") : Promise.resolve({ data: [], error: null }),
      session.client.from("web_access_categories").select("key,name,domains").order("name"),
      devicesQuery
    ]);
    if (error) throw error;
    const failure = [teamsResult, rolesResult, categoriesResult, devicesResult].find(result => result.error);
    if (failure) throw failure.error;
    return activitySuccess({ rules: (rules || []).map(map), canManageGlobally: globalManager, scopes: { employees: profiles, teams: teamsResult.data || [], roles: rolesResult.data || [], devices: devicesResult.data || [] }, categories: categoriesResult.data || [] });
  } catch (error) { return activityFailure(error); }
}

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.manageWebAccess]);
    const body = parseWebAccessRule(await readActivityJson(request));
    const targetIds = body.scopeType === "organisation" ? [null] : body.scopeIds;
    await Promise.all(targetIds.map(scopeId => assertManageableScope(session, { ...body, scopeId })));
    const rows = targetIds.map(scopeId => ({ name: body.name, scope_type: body.scopeType, scope_id: scopeId, enforcement_enabled: body.enforcementEnabled, priority: body.priority, blocked_categories: body.blockedCategories, blocked_domains: body.blockedDomains, allowed_domains: body.allowedDomains, blocked_applications: body.blockedApplications, schedule_timezone: body.scheduleTimezone, schedule_days: body.scheduleDays, schedule_start: body.scheduleStart, schedule_end: body.scheduleEnd, require_managed_extension: body.requireManagedExtension, enabled: body.enabled, created_by: session.profile.id }));
    const { data, error } = await session.client.from("web_access_rules").insert(rows).select(select);
    if (error) throw error;
    return activitySuccess({ rules: (data || []).map(map) }, { status: 201, message: `${rows.length} scoped web access ${rows.length === 1 ? "rule" : "rules"} created.` });
  } catch (error) { return activityFailure(error); }
}

export async function PATCH(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.manageWebAccess]);
    const raw = await readActivityJson(request);
    const body = parseWebAccessRule(raw);
    await assertManageableScope(session, body);
    const { data, error } = await session.client.from("web_access_rules").update({ name: body.name, scope_type: body.scopeType, scope_id: body.scopeId, enforcement_enabled: body.enforcementEnabled, priority: body.priority, blocked_categories: body.blockedCategories, blocked_domains: body.blockedDomains, allowed_domains: body.allowedDomains, blocked_applications: body.blockedApplications, schedule_timezone: body.scheduleTimezone, schedule_days: body.scheduleDays, schedule_start: body.scheduleStart, schedule_end: body.scheduleEnd, require_managed_extension: body.requireManagedExtension, enabled: body.enabled, updated_at: new Date().toISOString() }).eq("id", raw.id).select(select).single();
    if (error) throw error;
    return activitySuccess(map(data), { message: "Scoped web access rule updated." });
  } catch (error) { return activityFailure(error); }
}

export async function DELETE(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.manageWebAccess]);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Rule id is required.");
    const { error } = await session.client.from("web_access_rules").delete().eq("id", id);
    if (error) throw error;
    return activitySuccess({ id }, { message: "Scoped web access rule deleted." });
  } catch (error) { return activityFailure(error); }
}
