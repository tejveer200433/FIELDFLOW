; FieldFlow Activity Agent - NSIS installer hooks.
;
; On uninstall, best-effort notify the server that this managed agent is being
; removed, so monitoring administrators get an immediate, specific alert rather
; than only the generic "agent offline" signal a couple of minutes later.
;
; This is a NOTIFICATION only. It never blocks, prevents, or delays the
; uninstall in any meaningful way, and the uninstall proceeds regardless of
; whether the report succeeds (for example, if the machine is offline). It does
; not hide the agent or resist removal.

!macro NSIS_HOOK_PREUNINSTALL
  ; Launch the still-installed agent with --report-uninstall. If an agent is
  ; already running (the normal case for a managed device), this signals that
  ; instance to POST an "uninstall" event using its existing authenticated
  ; session, then exits. If no agent is running, the launched process exits
  ; immediately without starting the app. The short sleep gives the running
  ; instance a moment to send the report before its files are removed.
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --report-uninstall'
  Sleep 2500
!macroend
