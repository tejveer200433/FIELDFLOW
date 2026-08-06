# Employee activity privacy model

## Collected

The activity subsystem can store:

- Tracking-session start and stop times
- Keyboard activity event counts
- Mouse activity event counts
- Idle duration
- Active application executable name when enabled by policy
- Screen-lock state
- Device online or offline state
- Agent version
- Device registration status
- Heartbeat timestamps
- Calculated daily activity summaries
- Periodic screenshots of the employee's screen, only when explicitly enabled by policy (default off) and never while an administrator-configured excluded application is in the foreground

The current Windows agent deliberately reports keyboard and mouse counts as zero because it does not install input hooks.

## Not collected

The system has no approved field or collection path for:

- Actual typed characters
- Passwords
- Key names
- Key codes or scan codes
- Clipboard contents
- Mouse coordinates or clicked elements
- Message or form contents
- Screen video, webcam, or microphone
- Screenshots, while collection is disabled (the default) or of an excluded application
- Browser history or URLs
- Window titles
- Document names
- Full executable or file paths
- Command-line arguments
- Windows usernames
- Raw device identifiers
- Authentication tokens in activity tables, SQLite, or logs

Validation rejects forbidden request fields. Database tables do not contain columns for these values. Audit metadata rejects sensitive key names, including nested objects.

## Collection boundaries

- Collection occurs only while the agent has a valid active tracking session.
- Tracking is visibly indicated in the desktop window and tray.
- Employees can stop tracking.
- Tracking never starts automatically on first installation.
- Required policy acknowledgement must be explicit and is never preselected.
- Application names are collected only when the active policy enables them.
- Screenshots are collected only when the active policy enables them, on a policy-configured interval (3-5 minutes), and are never captured while the foreground application matches a policy-configured exclude list -- the exclude check runs on-device before any capture is attempted, and is independently re-checked server-side before an upload is accepted.
- Locked samples skip application lookup and use zero input counts.
- Attendance and location sharing are separate systems and are not converted into activity monitoring.

## Interpretation

Activity percentage and input/idle signals are incomplete operational indicators. They do not measure work quality, outcomes, collaboration, thought, customer service, accessibility needs, or all legitimate work performed away from the monitored device. They must not be treated as a complete productivity score.

## Deployment governance

This technical design does not claim automatic legal, labor, privacy, accessibility, works-council, union, or regulatory compliance. Company legal, HR, information-security, and employee-relations review is required before deployment. Organisations must define lawful purpose, notice, consent or other legal basis, access controls, retention, dispute handling, and employee support for their jurisdiction.
