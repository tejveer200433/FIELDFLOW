# FieldFlow Corporate Agent deployment

Corporate Agent mode is for organisation-owned or formally managed Windows devices. The installation stays visible in Windows Installed Apps and the employee dashboard identifies it as a Corporate Agent.

## Build

1. Configure the production API and Supabase public values in `.env.production`.
2. Build the managed installer from an administrator terminal:

   `npm run tauri:build:corporate`

3. Code-sign the generated NSIS installer before distribution.

## Administrator installation

Run PowerShell as administrator:

`powershell.exe -ExecutionPolicy Bypass -File .\deployment\Install-FieldFlowCorporateAgent.ps1 -InstallerPath .\src-tauri\target\release\bundle\nsis\FieldFlow-Activity-Agent-Setup.exe`

After the employee signs in once, open **Admin > Monitoring > Devices**, approve the device, and choose **Manage device**. The next heartbeat disables local sign-out, quit, and manual tracking controls and enables tracking recovery.

## MDM installation

Package the signed NSIS installer and the deployment script as a Win32 application. Run the script in system or administrator context. Use this detection rule:

- Registry key: `HKEY_LOCAL_MACHINE\SOFTWARE\FieldFlow\ActivityAgent`
- Value: `InstalledByManagement`
- Expected integer: `1`

Use the standard installer package to return a device to employee-controlled mode, then select **Use Standard** in FieldFlow Admin.

## Administrative removal

First select **Use Standard** or revoke the device in FieldFlow Admin. Then uninstall FieldFlow through the MDM or Windows Installed Apps. This preserves an auditable server-side management history while allowing authorised IT removal.
