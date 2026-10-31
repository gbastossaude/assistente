# Registra o worker para iniciar automaticamente ao entrar no Windows (Agendador de Tarefas),
# reiniciando em caso de falha. Não exige privilégios de administrador (tarefa do próprio usuário).
$ErrorActionPreference = "Stop"
$Cmd = Resolve-Path (Join-Path $PSScriptRoot "iniciar-worker.cmd")
$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$Cmd`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "EspecialistaIA-Worker" -Action $Action -Trigger $Trigger -Settings $Settings `
  -Description "Worker local do Especialista IA (fila do Supabase + Ollama em 127.0.0.1)" -Force | Out-Null
Write-Host "Início automático registrado (tarefa 'EspecialistaIA-Worker'). Para iniciar agora: Start-ScheduledTask EspecialistaIA-Worker" -ForegroundColor Green
