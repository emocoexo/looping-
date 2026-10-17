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
$installPath = Join-Path $root '.build/installed'
$installer = Join-Path $root "dist/Loop-Studio-Setup-$version-win-x64.exe"
$setup = Start-Process $installer -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$installPath`"" -PassThru -Wait
if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
$launcher = Start-Process "$installPath/Loop Studio.exe" -ArgumentList '--smoke-test' -PassThru
if (!$launcher.WaitForExit(30000)) { $launcher.Kill(); throw 'Installed launcher timed out.' }
if ($launcher.ExitCode -ne 0) { throw "Installed launcher failed: $($launcher.ExitCode)" }
if (!(Test-Path "$installPath/app/bin/ffmpeg.exe")) { throw 'Installed FFmpeg is missing.' }
$uninstall = Start-Process "$installPath/unins000.exe" -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { throw 'Uninstaller failed.' }
Write-Host 'PASS: Windows API/export, installer, native launcher readiness, and uninstaller.'
