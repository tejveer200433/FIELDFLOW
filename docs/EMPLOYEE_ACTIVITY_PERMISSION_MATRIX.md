# Employee activity permission matrix

Permissions are additive dynamic-RBAC capabilities. Possessing one activity permission does not imply another, except that protected Owner semantics are recognized by the existing access layer.

| Capability | `activity.view_self` | `activity.view_team` | `activity.view_all` | `activity.policies.manage` | Owner |
|---|---:|---:|---:|---:|---:|
| Read active policy | Yes | Yes | Yes | Yes | Yes |
| Acknowledge policy as self | Yes | No | No | No | Yes |
| Read own devices/sessions/activity | Yes | Only if also self | Yes | Devices only | Yes |
| Start/stop own session | Yes | No | No | No | Yes |
| Upload own samples/heartbeat | Yes | No | No | No | Yes |
| Read supervised employees | No | Yes | Yes | No | Yes |
| Read unrelated workforce activity | No | No | Yes | No | Yes |
| Create policy versions | No | No | No | Yes | Yes |
| Revoke/reactivate devices | Own revoke only | No | No | Yes | Yes |
| Read monitoring audit logs | No | No | RLS permits | Yes | Yes |

## Employee with `activity.view_self`

Can:

- View own active policy and acknowledgement state
- Acknowledge the active policy
- View own devices, sessions, summaries, status, and activity
- Start and stop an own tracking session
- Upload own samples through the authorised API
- Send an own-device heartbeat

Cannot:

- View another employee
- View team or workforce activity
- Change monitoring policy
- Administer another device
- Select employee identity in a write body

## Manager with `activity.view_team`

Can:

- View supervised employees
- View their sessions, summaries, activity timeline, and device status

Cannot:

- View unrelated employees
- View the full workforce unless separately granted `activity.view_all`
- Change monitoring policy
- Read raw device hashes, tokens, or secrets
- Start, stop, ingest, or heartbeat on an employee's behalf

## User with `activity.view_all`

Can view workforce monitoring data. It cannot change policy unless separately granted `activity.policies.manage`.

## User with `activity.policies.manage`

Can:

- Create new active policy versions
- View acknowledgements under RLS
- Revoke and reactivate registered devices
- Read monitoring audit logs

Current API limitation: acknowledgement-summary, policy-history, and audit-log read endpoints are not implemented, so the web UI cannot retrieve those collections even though database RLS permits authorised reads.

## Owner

The protected Owner can access all activity administration through existing Owner semantics. The feature does not replace or weaken Owner protection.
