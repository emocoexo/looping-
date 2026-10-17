param([Parameter(Mandatory=$true)][ValidateSet('install','build','test')][string]$Step)
$ErrorActionPreference = 'Stop'
try {
  switch ($Step) {
    'install' {
      $output = npm ci 2>&1
      $output | Write-Host
      if ($LASTEXITCODE -ne 0) { throw (($output | Select-Object -Last 15) -join ' | ') }
    }
    'build' { & "$PSScriptRoot/build-windows.ps1" }
    'test' { & "$PSScriptRoot/test-windows.ps1" }
  }
} catch {
  $detail = ($_.Exception.Message + ' | ' + $_.ScriptStackTrace).Replace("`r", '').Replace("`n", ' | ')
  Write-Host "::error title=Windows $Step failed::$detail"
  throw
}
