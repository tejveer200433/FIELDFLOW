[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$InstallerPath
)

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "FieldFlow Corporate Agent must be installed by an administrator or an MDM running in system context."
}

$resolvedInstaller = (Resolve-Path -LiteralPath $InstallerPath).Path
$process = Start-Process -FilePath $resolvedInstaller -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) {
  throw "FieldFlow installer failed with exit code $($process.ExitCode)."
}

$registryPath = "HKLM:\SOFTWARE\FieldFlow\ActivityAgent"
New-Item -Path $registryPath -Force | Out-Null
New-ItemProperty -Path $registryPath -Name "DeploymentMode" -Value "corporate" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $registryPath -Name "InstalledByManagement" -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $registryPath -Name "InstalledAtUtc" -Value ([DateTime]::UtcNow.ToString("o")) -PropertyType String -Force | Out-Null

Write-Output "FieldFlow Corporate Agent installed. Approve the device and enable Corporate Agent mode in Admin > Monitoring > Devices."
