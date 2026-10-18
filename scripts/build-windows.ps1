$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$build = Join-Path $root '.build'
$stage = Join-Path $build 'windows'
$cache = Join-Path $build 'downloads'
New-Item -ItemType Directory -Force $cache | Out-Null
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force "$stage/app", "$stage/runtime", "$stage/app/bin", "$stage/app/desktop", "$stage/licenses" | Out-Null

function Get-VerifiedArchive($Url, $Path, $Expected) {
  if (!(Test-Path $Path)) { Invoke-WebRequest -Uri $Url -OutFile $Path }
  $actual = (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Expected) { throw "SHA-256 mismatch: $Path. Delete the cached archive and investigate the upstream source." }
}

$nodeVersion = '24.22.0'
$nodeName = "node-v$nodeVersion-win-x64"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeName.zip"
$nodeSha = 'f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3'
$nodeZip = Join-Path $cache "$nodeName.zip"
Get-VerifiedArchive $nodeUrl $nodeZip $nodeSha
Expand-Archive $nodeZip -DestinationPath "$build/node" -Force
Copy-Item "$build/node/$nodeName/node.exe" "$stage/runtime/"
Copy-Item "$build/node/$nodeName/LICENSE" "$stage/runtime/"

$ffmpegRelease = 'autobuild-2026-10-16-13-04'
$ffmpegName = 'ffmpeg-n8.1.3-18-g46d899d7a0-win64-gpl-8.1'
$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/$ffmpegRelease/$ffmpegName.zip"
$ffmpegSha = 'fedb8b9219cbab9dd46035067f8a85645520e7be7d919389856206e7d0c28f4a'
$ffmpegZip = Join-Path $cache "$ffmpegName.zip"
Get-VerifiedArchive $ffmpegUrl $ffmpegZip $ffmpegSha
Expand-Archive $ffmpegZip -DestinationPath "$build/ffmpeg" -Force
$ffmpegRoot = "$build/ffmpeg/$ffmpegName"
Copy-Item "$ffmpegRoot/bin/ffmpeg.exe", "$ffmpegRoot/bin/ffprobe.exe" "$stage/app/bin/"
New-Item -ItemType Directory -Force "$stage/licenses/ffmpeg" | Out-Null
Get-ChildItem $ffmpegRoot | Where-Object { $_.Name -ne 'bin' } | Copy-Item -Destination "$stage/licenses/ffmpeg/" -Recurse

Copy-Item 'server.js', 'package.json', 'package-lock.json' "$stage/app/"
Copy-Item 'public', 'lib' "$stage/app/" -Recurse
Copy-Item 'desktop/server.mjs' "$stage/app/desktop/"
Copy-Item 'desktop/THIRD_PARTY_NOTICES.md' "$stage/"
Push-Location "$stage/app"
try {
  npm ci --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
} finally { Pop-Location }

$electronVersion = '44.9.0'
$electronUrl = "https://github.com/electron/electron/releases/download/v$electronVersion/electron-v$electronVersion-win32-x64.zip"
$electronSha = '88e08039d0ef359bab9f674e8051fa103bd8628ea7c5a5e1daaa610a8a0c6931'
$electronZip = Join-Path $cache "electron-v$electronVersion-win32-x64.zip"
Get-VerifiedArchive $electronUrl $electronZip $electronSha
Expand-Archive $electronZip -DestinationPath $stage -Force
Rename-Item "$stage/electron.exe" 'Loop Studio.exe'
Remove-Item "$stage/resources/default_app.asar" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$stage/resources/app" | Out-Null
Copy-Item 'desktop/main.cjs', 'desktop/loading.html' "$stage/resources/app/"
@{ name = 'loop-studio-desktop'; version = '2.1.0'; main = 'main.cjs' } | ConvertTo-Json | Set-Content "$stage/resources/app/package.json" -Encoding utf8
@{ node = @{ url = $nodeUrl; sha256 = $nodeSha }; ffmpeg = @{ url = $ffmpegUrl; sha256 = $ffmpegSha }; electron = @{ url = $electronUrl; sha256 = $electronSha } } | ConvertTo-Json -Depth 3 | Set-Content "$stage/provenance.json"
$version = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
if (!(Test-Path $iscc)) { throw 'Inno Setup 6 is required to build the installer.' }
$installerScript = (Resolve-Path 'desktop/installer.iss').Path
& $iscc "/DAppVersion=$version" $installerScript
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
$installer = Get-Item "dist/Loop-Studio-Setup-$version-win-x64.exe"
$checksum = (Get-FileHash $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
"$checksum  $($installer.Name)" | Set-Content 'dist/SHA256SUMS.txt' -Encoding ascii
Write-Host "Installer ready: $($installer.FullName)"
