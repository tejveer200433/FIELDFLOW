param(
  [string]$IconSource = "C:\Users\HP\Downloads\desktop-agent\src-tauri\icons\icon.png"
)

$ErrorActionPreference = "Stop"
$extensionRoot = $PSScriptRoot
$repoRoot = Split-Path $extensionRoot -Parent
$outputRoot = Join-Path $repoRoot "browser-extension-dist"
$version = "0.3.0"
$commonFiles = @(
  "background.js",
  "browser-detection.mjs",
  "config.js",
  "popup.html",
  "popup.js",
  "PRIVACY.md"
)

if (-not (Test-Path -LiteralPath $IconSource -PathType Leaf)) {
  throw "Extension icon source was not found: $IconSource"
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Add-Type -AssemblyName System.Drawing

function Write-Icon {
  param(
    [string]$Source,
    [string]$Destination,
    [int]$Size
  )

  $sourceImage = [System.Drawing.Image]::FromFile($Source)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, $Size, $Size)
      } finally {
        $graphics.Dispose()
      }
      $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $sourceImage.Dispose()
  }
}

function New-StorePackage {
  param(
    [string]$Platform,
    [string]$ManifestName
  )

  $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("fieldflow-extension-" + $Platform + "-" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $outputRoot ("fieldflow-website-activity-" + $Platform + "-" + $version + ".zip")

  try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $stage "icons") -Force | Out-Null

    foreach ($file in $commonFiles) {
      Copy-Item -LiteralPath (Join-Path $extensionRoot $file) -Destination (Join-Path $stage $file)
    }

    Copy-Item -LiteralPath (Join-Path $extensionRoot ("store\" + $ManifestName)) -Destination (Join-Path $stage "manifest.json")

    foreach ($size in @(16, 32, 48, 128)) {
      Write-Icon -Source $IconSource -Destination (Join-Path $stage ("icons\icon-" + $size + ".png")) -Size $size
    }

    if (Test-Path -LiteralPath $zipPath) {
      Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -CompressionLevel Optimal
    Write-Host "Created $zipPath"
  } finally {
    if (Test-Path -LiteralPath $stage) {
      Remove-Item -LiteralPath $stage -Recurse -Force
    }
  }
}

New-StorePackage -Platform "chromium" -ManifestName "manifest.chromium.json"
New-StorePackage -Platform "firefox" -ManifestName "manifest.firefox.json"
