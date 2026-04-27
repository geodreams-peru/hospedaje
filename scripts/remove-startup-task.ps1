$ErrorActionPreference = 'Stop'

$taskName = 'BeluHospedajeNode'

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Tarea eliminada: $taskName"
