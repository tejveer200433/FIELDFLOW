import { ACTIVITY_PERMISSIONS, requireActivitySession } from "@/backend/activity/auth";
import { decodeCursor, pageResult } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/backend/activity/responses";
import { parseAuditFilters } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.managePolicies,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    await enforceActivityRateLimit(session.client, "audit-read", { limit: 60, windowMs: 60 * 1000 });
    const filters = parseAuditFilters(new URL(request.url).searchParams);
    const offset = decodeCursor(filters.cursor);
    const { data, error } = await session.client.from("activity_audit_logs")
      .select("id,actor_user_id,employee_id,action,entity_type,created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + filters.limit);
    if (error) throw error;

    const page = pageResult(data || [], offset, filters.limit);
    const profileIds = [...new Set(page.data.flatMap(row => [row.actor_user_id, row.employee_id]).filter(Boolean))];
    const profilesResult = profileIds.length
      ? await session.client.from("profiles").select("id,full_name").in("id", profileIds)
      : { data: [], error: null };
    if (profilesResult.error) throw profilesResult.error;
    const names = new Map((profilesResult.data || []).map(profile => [profile.id, profile.full_name]));

    return activitySuccess({
      events: page.data.map(row => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        actorName: row.actor_user_id ? names.get(row.actor_user_id) || "Administrator" : "System",
        employeeName: row.employee_id ? names.get(row.employee_id) || "Employee" : null,
        createdAt: row.created_at
      })),
      pagination: page.pagination
    });
  } catch (error) {
    return activityFailure(error);
  }
}
