param([switch]$Test)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$taskTools = Join-Path $env:LOCALAPPDATA 'FieldFlowAndroidTools'
if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $taskTools 'jdk'))) {
    $env:JAVA_HOME = (Get-ChildItem -LiteralPath (Join-Path $taskTools 'jdk') -Directory | Select-Object -First 1).FullName
}
if (-not $env:ANDROID_HOME -and (Test-Path -LiteralPath (Join-Path $taskTools 'sdk'))) {
    $env:ANDROID_HOME = Join-Path $taskTools 'sdk'
}
& node (Join-Path $repoRoot 'scripts\prepare-android-config.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Android public configuration failed.' }
Push-Location $PSScriptRoot
try {
    $tasks = @('assembleDebug')
    if ($Test) { $tasks += @('testDebugUnitTest', 'lintDebug', 'assembleDebugAndroidTest') }
    & .\gradlew.bat @tasks --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    $artifacts = Join-Path $PSScriptRoot 'dist'
    New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
    $metadata = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\output-metadata.json') | ConvertFrom-Json
    $version = $metadata.elements[0].versionName
    $apk = Join-Path $artifacts ('FieldFlow-Android-' + $version + '-test.apk')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk') -Destination $apk -Force
    $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath ($apk + '.sha256') -Value ($hash + '  ' + (Split-Path -Leaf $apk)) -Encoding ascii
    Write-Output "Test APK: $apk"
} finally { Pop-Location }
