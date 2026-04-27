$ErrorActionPreference = 'Stop'

$taskName = 'BeluHospedajeNode'
$projectRoot = Split-Path -Parent $PSScriptRoot
$command = "cmd.exe /c cd /d `"$projectRoot`" ; npm.cmd start"

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c cd /d `"$projectRoot`" && npm.cmd start"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

try {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Write-Host "Tarea instalada: $taskName"
Write-Host "Para iniciarla ahora: Start-ScheduledTask -TaskName '$taskName'"
