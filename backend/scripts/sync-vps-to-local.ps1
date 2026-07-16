$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFilePath = Join-Path $backendRoot ".env"

function Get-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return $line.Substring($line.IndexOf("=") + 1).Trim()
}

function Test-LocalPort {
  param(
    [Parameter(Mandatory = $true)][string]$HostName,
    [Parameter(Mandatory = $true)][int]$Port
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
    $connected = $asyncResult.AsyncWaitHandle.WaitOne(1200, $false)
    if (-not $connected) {
      return $false
    }
    $client.EndConnect($asyncResult) | Out-Null
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Parse-MongoHostPort {
  param(
    [Parameter(Mandatory = $true)][string]$MongoUri
  )

  $withoutProtocol = $MongoUri -replace '^mongodb(\+srv)?:\/\/', ''
  $afterAuth = $withoutProtocol
  if ($withoutProtocol.Contains("@")) {
    $afterAuth = $withoutProtocol.Split("@", 2)[1]
  }

  $hostPort = $afterAuth.Split("/", 2)[0]
  $firstHostPort = $hostPort.Split(",")[0]

  if ($firstHostPort.Contains(":")) {
    $parts = $firstHostPort.Split(":")
    return @{
      Host = $parts[0]
      Port = [int]$parts[1]
    }
  }

  return @{
    Host = $firstHostPort
    Port = 27017
  }
}

$vpsUri = Get-EnvValue -Path $envFilePath -Key "MONGO_VPS_URI"
if ([string]::IsNullOrWhiteSpace($vpsUri)) {
  Write-Error "MONGO_VPS_URI is missing in backend/.env."
  exit 1
}

$sourceEndpoint = Parse-MongoHostPort -MongoUri $vpsUri
$localMongoHost = $sourceEndpoint.Host
$localMongoPort = $sourceEndpoint.Port

$sshUser = if ($env:MONGO_VPS_SSH_USER) { $env:MONGO_VPS_SSH_USER } else { "crm" }
$sshHost = if ($env:MONGO_VPS_SSH_HOST) { $env:MONGO_VPS_SSH_HOST } else { "72.60.97.58" }
$sshPort = if ($env:MONGO_VPS_SSH_PORT) { [int]$env:MONGO_VPS_SSH_PORT } else { 2424 }
$startedTunnelProcess = $null

if (-not (Test-LocalPort -HostName $localMongoHost -Port $localMongoPort)) {
  Write-Host "VPS Mongo tunnel not detected on $localMongoHost`:$localMongoPort."
  Write-Host "Opening SSH tunnel window. Enter VPS password there."

  $sshCommand = "ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -N -L $localMongoPort`:127.0.0.1`:$localMongoPort -p $sshPort $sshUser@$sshHost"

  $startedTunnelProcess = Start-Process -FilePath powershell -ArgumentList @(
    "-NoProfile",
    "-NoExit",
    "-Command",
    $sshCommand
  ) -PassThru

  $maxAttempts = 120
  for ($i = 0; $i -lt $maxAttempts; $i++) {
    Start-Sleep -Seconds 1
    if (Test-LocalPort -HostName $localMongoHost -Port $localMongoPort) {
      break
    }
  }
}

if (-not (Test-LocalPort -HostName $localMongoHost -Port $localMongoPort)) {
  Write-Error "Tunnel did not become ready on $localMongoHost`:$localMongoPort."
  exit 1
}

Write-Host "Tunnel is ready on $localMongoHost`:$localMongoPort"
Set-Location $backendRoot
try {
  node scripts/sync-vps-to-local.cjs
} finally {
  if ($startedTunnelProcess -and -not $startedTunnelProcess.HasExited) {
    Stop-Process -Id $startedTunnelProcess.Id -ErrorAction SilentlyContinue
  }
}
