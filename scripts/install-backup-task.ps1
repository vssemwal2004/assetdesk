[CmdletBinding()]
param(
  [string]$TaskName = 'AssetDesk MongoDB Backup',
  [datetime]$DailyAt = [datetime]::Today.AddHours(2)
)

$ErrorActionPreference = 'Stop'
$backupScript = Join-Path $PSScriptRoot 'backup-mongodb.ps1'
if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
  throw "Backup script not found: $backupScript"
}

$powershell = (Get-Command powershell.exe).Source
$arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$backupScript`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory (Split-Path -Parent $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Daily AssetDesk MongoDB backup; backup script retains the last 14 days.' -Force | Out-Null
Write-Output "Scheduled task '$TaskName' installed. It runs daily at $($DailyAt.ToString('HH:mm')) when this user is logged on, or as soon as possible afterward."
