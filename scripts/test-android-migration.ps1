$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$container = 'fieldflow-android-sql-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
try {
    & docker run --detach --rm --name $container --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable PostgreSQL test container.' }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        & docker exec $container pg_isready -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Milliseconds 500
    }
    foreach ($entry in @(
        @('tests/activity/android-screenshot-requests-fixture.sql', '/tmp/fixture.sql'),
        @('supabase/migrations/202609130001_android_screenshot_requests.sql', '/tmp/migration.sql'),
        @('tests/activity/android-screenshot-requests-security.sql', '/tmp/security.sql')
    )) {
        & docker cp (Join-Path $repoRoot $entry[0]) ($container + ':' + $entry[1])
        if ($LASTEXITCODE -ne 0) { throw 'Could not copy SQL test files.' }
    }
    $output = & docker exec $container psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/fixture.sql -f /tmp/migration.sql -f /tmp/security.sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($output | Out-String) }
    $output | Select-String 'PASS:' | ForEach-Object { $_.Line.Trim() }
} finally {
    & docker stop $container 2>$null | Out-Null
}
