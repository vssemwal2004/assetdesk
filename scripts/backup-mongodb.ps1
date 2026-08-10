[CmdletBinding()]
param(
  [string]$BackupRoot,
  [ValidateRange(1, 3650)]
  [int]$RetentionDays = 2
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $BackupRoot) { $BackupRoot = Join-Path $projectRoot 'backups' }
$envFile = Join-Path $projectRoot '.env'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Environment file not found: $envFile"
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }

  $separator = $trimmed.IndexOf('=')
  if ($separator -lt 1) { continue }

  $key = $trimmed.Substring(0, $separator).Trim()
  $value = $trimmed.Substring($separator + 1).Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $settings[$key] = $value
}

$mongoUri = $settings['MONGODB_URI']
if (-not $mongoUri) { throw 'MONGODB_URI is missing from .env.' }

$databaseName = $settings['MONGODB_DB_NAME']
if (-not $databaseName) { $databaseName = 'assetdesk' }
if ($databaseName -notmatch '^[A-Za-z0-9_-]+$') { throw 'MONGODB_DB_NAME contains unsupported characters.' }

$mongoDump = Get-Command mongodump -ErrorAction SilentlyContinue
if (-not $mongoDump) {
  throw 'mongodump was not found. Install MongoDB Database Tools and add them to PATH.'
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$finalPath = Join-Path $BackupRoot "${databaseName}_${timestamp}.archive.gz"
$temporaryPath = "$finalPath.partial"

try {
  & $mongoDump.Source --uri=$mongoUri --db=$databaseName --archive=$temporaryPath --gzip
  if ($LASTEXITCODE -ne 0) { throw "mongodump exited with code $LASTEXITCODE." }
  Move-Item -LiteralPath $temporaryPath -Destination $finalPath
} catch {
  Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
  throw
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
$deletedCount = 0
Get-ChildItem -LiteralPath $BackupRoot -File -Filter '*.archive.gz' |
  Where-Object { $_.LastWriteTime -lt $cutoff -and $_.FullName -ne $finalPath } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $deletedCount++
  }

$backup = Get-Item -LiteralPath $finalPath
Write-Output ("Backup completed: {0} ({1:N0} bytes). Deleted {2} backup(s) older than {3} day(s)." -f $backup.FullName, $backup.Length, $deletedCount, $RetentionDays)
