$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$stage = Join-Path $root '.build/windows'
$env:FFMPEG_PATH = "$stage/app/bin/ffmpeg.exe"
$env:FFPROBE_PATH = "$stage/app/bin/ffprobe.exe"
$testFiles = @(Get-ChildItem 'test' -Filter '*.test.js' | ForEach-Object { $_.FullName })
$testOutput = & "$stage/runtime/node.exe" --test @testFiles 2>&1
$testOutput | Write-Host
if ($LASTEXITCODE -ne 0) { throw ('Windows FFmpeg/API integration tests failed: ' + (($testOutput | Select-Object -Last 35) -join ' | ')) }

$version = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
$installPath = Join-Path $root '.build/Installed Loop Studio'
$installer = Join-Path $root "dist/Loop-Studio-Setup-$version-win-x64.exe"
$setup = Start-Process $installer -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$installPath`"" -PassThru -Wait
if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
# Exercise the installed runtime without CI's FFmpeg overrides or development PATH.
Remove-Item Env:FFMPEG_PATH, Env:FFPROBE_PATH -ErrorAction SilentlyContinue
$originalPath = $env:PATH
$env:PATH = "$env:WINDIR/System32;$env:WINDIR"
$logPath = Join-Path $env:LOCALAPPDATA 'Loop Studio/logs/launcher.log'
function Invoke-LauncherCheck($ExpectedExit, $Label) {
  $launcher = Start-Process "$installPath/Loop Studio.exe" -ArgumentList '--smoke-test' -PassThru
  if (!$launcher.WaitForExit(110000)) { $launcher.Kill(); throw "Launcher timed out: $Label" }
  if ($launcher.ExitCode -ne $ExpectedExit) {
    $detail = if (Test-Path $logPath) { Get-Content $logPath -Raw } else { 'No launcher log created.' }
    throw "Launcher check failed ($Label), exit $($launcher.ExitCode): $detail"
  }
}
$serverPath = Join-Path $installPath 'app/desktop/server.mjs'
$originalServer = [System.IO.File]::ReadAllText($serverPath)
try {
  Invoke-LauncherCheck 0 'real installed application with isolated PATH'
  # Startup exceeding the old 20-second limit, with a status line before the URL.
  $delayedServer = @'
import http from 'node:http';
console.log('Preparing video tools...');
setTimeout(() => {
  const server = http.createServer((req, res) => res.end('{"status":"ok"}'));
  server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}`));
}, 25000);
'@
  [System.IO.File]::WriteAllText($serverPath, $delayedServer)
  Invoke-LauncherCheck 0 'slow startup and extra stdout'
  [System.IO.File]::WriteAllText($serverPath, "console.error('TEST_STARTUP_FAILURE: diagnostic details'); process.exit(7);")
  Invoke-LauncherCheck 1 'failed startup'
  if ((Get-Content $logPath -Raw) -notmatch 'TEST_STARTUP_FAILURE: diagnostic details') {
    throw 'The launcher did not preserve the real startup error.'
  }
} finally {
  [System.IO.File]::WriteAllText($serverPath, $originalServer)
  $env:PATH = $originalPath
}
$env:LOOP_STUDIO_EXE = Join-Path $installPath 'Loop Studio.exe'
$env:FFMPEG_PATH = Join-Path $installPath 'app/bin/ffmpeg.exe'
$env:FFPROBE_PATH = Join-Path $installPath 'app/bin/ffprobe.exe'
$desktopOutput = & "$stage/runtime/node.exe" 'test/desktop.mjs' 2>&1
$desktopOutput | Write-Host
if ($LASTEXITCODE -ne 0) { throw ('Installed desktop UI tests failed: ' + (($desktopOutput | Select-Object -Last 40) -join ' | ')) }
if (!(Test-Path "$installPath/app/bin/ffmpeg.exe")) { throw 'Installed FFmpeg is missing.' }
$uninstall = Start-Process "$installPath/unins000.exe" -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw 'Uninstaller failed.' }
Write-Host 'PASS: Windows API/export, installer, desktop window, slow startup, error diagnostics, video workflow, and uninstaller.'
