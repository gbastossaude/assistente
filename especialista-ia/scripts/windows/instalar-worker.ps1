# Instala o worker local do Especialista IA no Windows (PowerShell 5+).
# Uso: clique com o botão direito → "Executar com o PowerShell", ou:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-worker.ps1
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
Write-Host "== Especialista IA — instalação do worker local ==" -ForegroundColor Cyan

# 1. Node.js 20+
try { $nodeVersion = (node -v) } catch { $nodeVersion = $null }
if (-not $nodeVersion -or [int]($nodeVersion.TrimStart("v").Split(".")[0]) -lt 20) {
  Write-Host "Node.js 20+ não encontrado. Instale com:  winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
  exit 1
}
Write-Host "Node.js $nodeVersion OK"

# 2. Ollama
try { $ollamaVersion = (ollama --version) } catch { $ollamaVersion = $null }
if (-not $ollamaVersion) {
  Write-Host "Ollama não encontrado. Instale com:  winget install Ollama.Ollama   (ou https://ollama.com/download)" -ForegroundColor Yellow
  exit 1
}
Write-Host "$ollamaVersion OK"
if ($env:OLLAMA_HOST -and $env:OLLAMA_HOST -notmatch "^(127\.0\.0\.1|localhost)") {
  Write-Host "ATENÇÃO: OLLAMA_HOST=$($env:OLLAMA_HOST) expõe o Ollama na rede. Remova essa variável — o worker só usa 127.0.0.1." -ForegroundColor Red
  exit 1
}

# 3. Dependências
Write-Host "Instalando dependências (npm ci)..."
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci falhou" }

# 4. Configuração
$envFile = Join-Path $Root "apps\local-worker\.env"
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $Root "apps\local-worker\.env.example") $envFile
  Write-Host "Criado apps\local-worker\.env — preencha SUPABASE_URL, SUPABASE_ANON_KEY, WORKER_EMAIL e WORKER_PASSWORD." -ForegroundColor Yellow
  notepad $envFile
}

# 5. Diagnóstico e modelos recomendados
npm run worker:doctor
$answer = Read-Host "Baixar agora os modelos recomendados (qwen3:4b e bge-m3, ~4 GB)? [S/n]"
if ($answer -eq "" -or $answer -match "^[sS]") {
  ollama pull qwen3:4b
  ollama pull bge-m3
}
Write-Host "Pronto. Inicie com scripts\windows\iniciar-worker.cmd ou registre o início automático com scripts\windows\registrar-inicio-automatico.ps1" -ForegroundColor Green
