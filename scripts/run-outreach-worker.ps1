$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $env:LOCALAPPDATA "LeadgenOS"
$logPath = Join-Path $logDirectory "outreach-worker.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $projectRoot

function Write-WorkerLog {
  param([string]$Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message"
}

function Test-LeadgenServer {
  try {
    $response = Invoke-WebRequest `
      -Uri "http://localhost:3000/leadgen" `
      -UseBasicParsing `
      -TimeoutSec 5
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

try {
  if (-not (Test-LeadgenServer)) {
    Write-WorkerLog "Application is unavailable; starting Next.js."
    Start-Process `
      -FilePath "npm.cmd" `
      -ArgumentList @("run", "dev") `
      -WorkingDirectory $projectRoot `
      -WindowStyle Hidden

    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Seconds 1
      if (Test-LeadgenServer) {
        $ready = $true
        break
      }
    }
    if (-not $ready) {
      throw "Leadgen OS did not start within 20 seconds."
    }
  }

  $result = & node (Join-Path $PSScriptRoot "process-outreach-once.mjs") 2>&1
  $exitCode = $LASTEXITCODE
  Write-WorkerLog (($result | Out-String).Trim())
  if ($exitCode -ne 0) {
    exit $exitCode
  }
} catch {
  Write-WorkerLog $_.Exception.Message
  exit 1
}
