# FieldFlow Activity Agent privacy boundary

## Collected during an explicit tracking session

- UTC sample timestamp
- Aggregate keyboard key-down count
- Aggregate mouse activity-event count
- Seconds since the last Windows input event
- Screen locked state
- Foreground executable filename stem only, and only when enabled by the active monitoring policy
- Device agent heartbeat and online/idle state

## Never collected

- Typed text, keystroke content, key names, scan codes, virtual key codes, or shortcuts
- Keyboard and mouse event details or mouse-button identities
- Mouse position, coordinates, paths, or click targets
- Screenshots, screen video, webcam, or microphone
- Clipboard content
- Window titles, browser URLs, document names, email subjects, or message content
- Full executable paths, command lines, environment variables, or Windows usernames
- Files or directory listings
- Supabase service-role keys

## Storage and transmission

- Supabase access and refresh tokens are stored in Windows Credential Manager through the native keyring backend.
- Tokens are not written to SQLite, browser local storage, logs, or activity payloads.
- The local SQLite queue contains only pending activity samples, the server-issued device UUID, and retry metadata.
- The raw Windows MachineGuid is read only long enough to derive an application-specific SHA-256 identifier. The raw value is neither persisted nor transmitted.
- Activity uploads use the existing FIELD-FLOW `/api/activity` routes with the signed-in employee bearer token.

## User control

- Tracking starts only after the employee explicitly presses Start or chooses Start from the tray.
- Tracking stops when the employee presses Stop or chooses Stop from the tray.
- Aggregate input counters are enabled only for the duration of that explicit tracking session and reset when tracking starts or stops.
- Required policy acknowledgement is shown before tracking can start.
- Quitting while tracking requires confirmation and attempts a final sync followed by an explicit session stop.
