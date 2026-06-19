$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobileWebPort = 8091

Write-Host "Stopping old dev servers on ports 5000, $mobileWebPort, 19021 and 8081..."
foreach ($port in @(5000, $mobileWebPort, 19021, 8081)) {
  $lines = netstat -ano | findstr LISTENING | findstr ":$port "
  foreach ($line in $lines) {
    $procId = ($line -split "\s+")[-1]
    if ($procId -match "^\d+$") {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "Starting backend (http://127.0.0.1:5000)..."
Start-Process -FilePath powershell -ArgumentList @(
  "-NoProfile",
  "-NoExit",
  "-Command",
  "cd `"$($root)\backend`"; npm run start"
) -WorkingDirectory (Join-Path $root "backend") -WindowStyle Hidden

Write-Host "Waiting for backend health..."
$backendReady = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/health" -Method Get -TimeoutSec 2
    if ($health.ok -eq $true) {
      $backendReady = $true
      break
    }
  } catch {
    # keep waiting
  }
}
if (-not $backendReady) {
  Write-Warning "Backend health check did not pass in time. Mobile web will still start."
}

Write-Host "Starting mobile web (http://localhost:$mobileWebPort)..."
$env:EXPO_PUBLIC_USE_LOCAL_API = "true"
$env:EXPO_PUBLIC_LOCAL_API_PORT = "5000"
Start-Process -FilePath "npm.cmd" -ArgumentList @(
  "run",
  "web",
  "--",
  "--port",
  "$mobileWebPort"
) -WorkingDirectory (Join-Path $root "mobile") -WindowStyle Hidden

Write-Host ""
Write-Host "Mobile web booting. Open: http://localhost:$mobileWebPort"
