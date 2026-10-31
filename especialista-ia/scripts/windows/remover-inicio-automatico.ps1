# Remove o início automático do worker.
Unregister-ScheduledTask -TaskName "EspecialistaIA-Worker" -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Início automático removido."
