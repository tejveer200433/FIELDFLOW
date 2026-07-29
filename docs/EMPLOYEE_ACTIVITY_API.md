# Employee activity API

All endpoints are under `/api/activity`, require an approved active FIELD-FLOW profile, use `Cache-Control: no-store`, and return:

```json
{ "success": true, "data": {} }
```

or:

```json
{ "success": false, "error": { "code": "SAFE_CODE", "message": "Safe message" } }
```

Authentication uses `Authorization: Bearer <Supabase access token>`. Tokens shown here are placeholders; never put a real token in documentation or logs.

## Common security behavior

- Employee identity comes from the verified Supabase session.
- Disabled, pending, rejected, or unapproved profiles are rejected.
- Write bodies reject employee, manager, role, permission, organisation, token, keystroke, clipboard, screenshot, and coordinate fields.
- RLS independently scopes reads.
- Device identifier hashes are never selected or mapped into API responses.
- Unknown database errors return `INTERNAL_ERROR`, not raw SQL details.
- A `429` response includes a numeric `Retry-After` header when available.
- Version 1 API rate limits are process-local; production multi-instance deployments need a shared limiter.

## Devices

### List devices

- Method/path: `GET /api/activity/devices`
- Permission: any of `activity.view_self`, `activity.view_team`, `activity.view_all`; Owner allowed
- Query: `employeeId`, `status=pending|active|revoked`, `limit=1..100`, opaque `cursor`
- Purpose: list devices within resolved self/team/workforce scope
- Success data: `{ devices: Device[], pagination }`
- Checks: requested employee must be within scope; RLS repeats scope enforcement
- Rate limit: 120/minute per authenticated profile

`Device` includes device UUID, employee UUID, name, platform, OS version, agent version, status, registration/last-seen/revocation times. It never includes `device_identifier_hash`.

### Register device

- Method/path: `POST /api/activity/devices/register`
- Permission: `activity.view_self`
- Body:

```json
{
  "deviceName": "FIELD-LAPTOP-01",
  "platform": "windows",
  "operatingSystemVersion": "Windows 11",
  "agentVersion": "0.1.0",
  "deviceIdentifier": "opaque-local-derived-value"
}
```

- Purpose: server-hash an opaque identifier and register/reuse the caller's device
- Success: `201`, mapped Device plus active policy and `acknowledgementRequired`
- Checks: strict fields and lengths; server-side hashing; duplicate ownership; revoked device rejection
- Rate limit: 5/hour
- Safe errors: `DEVICE_UNAVAILABLE`, `INVALID_REQUEST`, `ACCESS_DENIED`

### Administer device

- Method/path: `PATCH /api/activity/devices/{deviceId}`
- Permission: `activity.view_self` for own allowed action, or `activity.policies.manage`; Owner allowed
- Body: `{ "action": "revoke" }`, `{ "action": "reactivate" }`, or `{ "action": "update-agent", "agentVersion": "0.1.1" }`
- Success: mapped Device
- Checks: UUID, ownership/admin scope, reactivation limited to monitoring administration
- Rate limit: 20 per 5 minutes
- Safe errors: `INVALID_DEVICE_ID`, `DEVICE_NOT_FOUND`, `DEVICE_OUT_OF_SCOPE`, `DEVICE_REACTIVATION_DENIED`

## Sessions

### Start session

- Method/path: `POST /api/activity/sessions/start`
- Permission: `activity.view_self`
- Body:

```json
{ "deviceId": "uuid", "projectId": null, "taskId": null, "source": "agent" }
```

- Success: `201`, mapped session and active policy
- Checks: owned active device; enabled policy; exact acknowledgement; one active session; optional project/task assignment
- Rate limit: 20 per 5 minutes
- Safe errors: `DEVICE_NOT_ACTIVE`, `TRACKING_DISABLED`, `ACKNOWLEDGEMENT_REQUIRED`, `ACTIVE_SESSION_EXISTS`, `PROJECT_OUT_OF_SCOPE`, `TASK_OUT_OF_SCOPE`

### Stop session

- Method/path: `POST /api/activity/sessions/stop`
- Permission: `activity.view_self`
- Body: `{ "sessionId": "uuid", "source": "agent" }`
- Success: mapped ended session plus `durationSeconds`
- Checks: only caller's active session; database stop time
- Rate limit: 20 per 5 minutes
- Safe errors: `SESSION_NOT_ACTIVE`, `INVALID_REQUEST`

### Current session

- Method/path: `GET /api/activity/sessions/current`
- Permission: `activity.view_self`
- Query/body: none
- Success: `{ active, session, device?, policy, serverTime }`
- Checks: employee filter comes from the session and RLS
- Rate limit: 120/minute

## Activity ingestion

- Method/path: `POST /api/activity/ingest`
- Permission: `activity.view_self`
- Body:

```json
{
  "deviceId": "uuid",
  "trackingSessionId": "uuid",
  "samples": [
    {
      "localSampleId": "uuid-or-local-id",
      "capturedAt": "2026-07-29T10:00:00.000Z",
      "keyboardEventCount": 0,
      "mouseEventCount": 0,
      "idleSeconds": 15,
      "activeApplication": "Code",
      "screenLocked": false
    }
  ]
}
```

- Batch size: 1–100
- Success: `{ acceptedCount, duplicateCount, rejectedCount, rejected, serverTime }`
- Checks: strict aggregate fields; active owned device/session; device-session match; enabled active policy; acknowledgement; session start; future bound; offline-sync limit; application-name policy; counter bounds; idempotent `(device_id, local_sample_id)`
- Storage: API calls `activity_ingest_samples`; direct authenticated table insertion is revoked by the hardening migration
- Rate limit: 120 requests/minute
- Per-sample reasons: `FUTURE_TIMESTAMP`, `BEFORE_SESSION_START`, `OFFLINE_SYNC_EXPIRED`, `APPLICATION_COLLECTION_DISABLED`, `FORBIDDEN_FIELD`, `INVALID_SAMPLE_VALUE`
- Request errors: `INVALID_BATCH_SIZE`, `DEVICE_REVOKED`, `SESSION_NOT_ACTIVE`, `SESSION_DEVICE_MISMATCH`, `TRACKING_DISABLED`, `ACKNOWLEDGEMENT_REQUIRED`

## Heartbeat

- Method/path: `POST /api/activity/heartbeat`
- Permission: `activity.view_self`
- Body:

```json
{
  "deviceId": "uuid",
  "trackingSessionId": null,
  "agentVersion": "0.1.0",
  "onlineStatus": "online",
  "batteryLevel": null
}
```

- Success: `201`, `{ recordedAt, nextHeartbeatSeconds, deviceStatus, trackingEnabled }`
- Checks: device ownership/revocation; optional session-device match; agent/status/battery bounds; database minimum interval
- API rate limit: 12/minute; database also rejects faster than half the policy interval
- Safe errors: `DEVICE_REVOKED`, `SESSION_DEVICE_MISMATCH`, `HEARTBEAT_TOO_FREQUENT`

## Employee activity

### Directory

- Method/path: `GET /api/activity/employees`
- Permission: any of self/team/all; Owner allowed
- Query: `search`, `limit`, `cursor`
- Success: scoped profiles with latest mapped device status
- Rate limit: 120/minute
- Checks: profile RPC and RLS restrict scope

### Employee detail

- Method/path: `GET /api/activity/employees/{employeeId}`
- Permission: self for own UUID, team for supervised UUID, all/Owner for workforce
- Query: `startDate=YYYY-MM-DD`, `endDate=YYYY-MM-DD`, `limit=1..90`, `cursor`
- Success: employee, current status/session, devices, daily summaries, session timeline, optional application usage, recent heartbeat, date range
- Checks: UUID, date bounds, explicit scope assertion, RLS
- Rate limit: 120/minute
- Sensitive fields excluded: raw sample counts, device hashes, audit metadata, tokens

## Team and workforce activity

- Method/path: `GET /api/activity/team`
- Permission: `activity.view_team` or `activity.view_all`; Owner allowed
- Query: `status`, `employeeId`, `date`, `limit`, `cursor`, `sort=name|last_seen|activity`
- Success: scoped employee status rows plus date and pagination
- Checks: self-only permission is insufficient; team UUID list comes from existing supervision; explicit employee must remain in scope
- Rate limit: 120/minute

The manager Team Activity and admin Workforce Activity pages both use this endpoint. `activity.view_all` resolves workforce scope; there is no separate `/workforce` endpoint.

## Policies

### Retrieve active policy

- Method/path: `GET /api/activity/policies`
- Permission: authenticated approved user; RLS exposes the active row only to an activity participant, policy manager, or Owner
- Success: mapped policy plus `{ acknowledgementStatus }`
- Rate limit: 120/minute
- Safe errors: `POLICY_NOT_CONFIGURED`

### Acknowledge policy

- Method/path: `POST /api/activity/policies/acknowledge`
- Permission: `activity.view_self`
- Body:

```json
{ "policyId": "uuid", "policyVersion": 1, "acknowledgementTextHash": "64-to-128-hex-characters" }
```

- Success: `201`, policy ID/version and database acknowledgement time
- Checks: exact active version, self identity, hash shape, append-only uniqueness
- Rate limit: 10/hour
- Safe errors: `POLICY_VERSION_NOT_FOUND`, `ALREADY_ACKNOWLEDGED`

### Administer policy

- Method/path: `POST /api/activity/policies`
- Permission: `activity.policies.manage`; Owner allowed
- Body: tracking flag, idle/sample/upload/offline/heartbeat intervals, application-name flag, acknowledgement flag, retention days
- Success: `201`, newly activated mapped policy version
- Checks: numeric bounds; advisory transaction lock; prior version retained; exactly one active version
- Rate limit: 10/hour
- Safe errors: `ACCESS_DENIED`, `INVALID_REQUEST`

## Not implemented as API endpoints

There are currently no read endpoints for complete policy history, acknowledgement summaries, or activity audit-log collections. The UI returns explicit unavailable states instead of querying Supabase directly or using a service-role key.
