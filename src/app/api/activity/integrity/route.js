import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/backend/activity/responses";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    await enforceActivityRateLimit(session.client, "integrity-alerts", { limit: 60, windowMs: 60 * 1000 });
    const rawLimit = Number(new URL(request.url).searchParams.get("limit"));
    const limit = Number.isInteger(rawLimit) ? Math.max(1, Math.min(rawLimit, 100)) : 20;
    const { data, error } = await session.client
      .from("activity_integrity_events")
      .select("id,employee_id,device_id,event_type,severity,risk_score,evidence,detected_at,resolved_at")
      .is("resolved_at", null)
      .order("risk_score", { ascending: false })
      .order("detected_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return activitySuccess({
      alerts: (data || []).map(event => ({
        id: event.id,
        employeeId: event.employee_id,
        deviceId: event.device_id,
        type: event.event_type,
        severity: event.severity,
        riskScore: event.risk_score,
        evidence: event.evidence,
        detectedAt: event.detected_at
      }))
    });
  } catch (error) {
    return activityFailure(error);
  }
}
