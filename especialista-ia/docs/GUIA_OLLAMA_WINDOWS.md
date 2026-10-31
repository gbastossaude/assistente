# Guia: Ollama e worker local no Windows

O worker é o "cérebro" do sistema: roda no computador do escritório, executa o modelo de IA localmente e busca as
perguntas no Supabase. **Nenhuma porta precisa ser aberta** e o Ollama fica acessível apenas na própria máquina.

## 1. Requisitos e escolha do modelo

| Computador | Modelo de respostas | Embeddings | Tempo típico por resposta |
|---|---|---|---|
| 8–16 GB RAM, sem GPU | `qwen3:4b` (recomendado) | `bge-m3` (1024 dim.) | 15–45 s |
| GPU NVIDIA ≥ 6 GB | `qwen3:4b` (ou `qwen3:8b`) | `bge-m3` | 2–8 s |
| Menos de 8 GB RAM | `llama3.2:3b` | `nomic-embed-text` (768 dim.)* | 20–60 s |

\* Trocar para 768 dimensões exige `scripts/sql/alterar-dimensao-embeddings.sql` e reindexação. O `bge-m3` é
multilíngue e funciona melhor em português; prefira-o sempre que a máquina permitir.

O comando `npm run worker:doctor` detecta CPU, RAM e GPU e recomenda o modelo — rode antes de escolher.

Espaço em disco: ~3 GB (qwen3:4b) + ~1,2 GB (bge-m3) + ~0,5 GB (projeto).

## 2. Instalar o Ollama

1. Baixe em <https://ollama.com/download> ou execute `winget install Ollama.Ollama`.
2. **Não** defina a variável `OLLAMA_HOST` para `0.0.0.0` — o padrão (`127.0.0.1:11434`) é o correto. O worker
   recusa endereços que não sejam locais.
3. Baixe os modelos:
   ```powershell
   ollama pull qwen3:4b
   ollama pull bge-m3
   ```
4. Teste: `ollama run qwen3:4b "Olá"` (Ctrl+D para sair).

## 3. Instalar o worker

1. Instale o Node.js 20+ (`winget install OpenJS.NodeJS.LTS`) e o Git.
2. Clone o repositório e, na pasta `especialista-ia`, execute:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-worker.ps1
   ```
   O script confere Node e Ollama, instala as dependências, cria `apps\local-worker\.env`, roda o diagnóstico e
   oferece baixar os modelos.
3. No painel (*Colaboradores → Novo acesso*), crie a conta com papel **Worker (máquina)** e copie a senha temporária.
4. Preencha `apps\local-worker\.env`:
   - `SUPABASE_URL` e `SUPABASE_ANON_KEY` (chave **pública**; o worker recusa a service role);
   - `WORKER_EMAIL` e `WORKER_PASSWORD` (conta de máquina);
   - `WORKER_ID` (nome desta máquina, ex.: `worker-recepcao`).
5. Teste: `scripts\windows\iniciar-worker.cmd`. No painel, *Dashboard → Worker local* deve mostrar **online** e **Ollama OK**.

## 4. Início automático

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\registrar-inicio-automatico.ps1
```
Cria a tarefa "EspecialistaIA-Worker" no Agendador de Tarefas (ao entrar no Windows, com reinício em caso de
falha). Para remover: `remover-inicio-automatico.ps1`. Recomendações:
- Desative a suspensão automática do computador no horário comercial (*Configurações → Sistema → Energia*).
- O Ollama também inicia sozinho com o Windows (ícone na bandeja).

## 5. OCR opcional (PDFs digitalizados)

Instale Tesseract (com idioma português) e Poppler e adicione ambos ao PATH:
```powershell
winget install UB-Mannheim.TesseractOCR
winget install oschwartz10612.Poppler
```
Defina `OCR_ENABLED=true` no `.env` (ou peça OCR por documento no painel). Todo texto obtido por OCR vai para
**revisão humana** antes de ser usado.

## 6. Operação e problemas comuns

| Sintoma | Causa provável | Ação |
|---|---|---|
| Dashboard: worker offline | Computador desligado/suspenso, sem internet ou worker parado | Ligue/reinicie; perguntas ficam na fila |
| "Ollama indisponível" | Ollama não está rodando | Abra o Ollama; `ollama list` |
| "Modelos ausentes" | Modelo configurado no painel não foi baixado | `ollama pull <modelo>` |
| Respostas lentas | CPU sem GPU / outros programas pesados | Use `llama3.2:3b`, mantenha `WORKER_CONCURRENCY=1` |
| Dimensão incompatível | Trocou o modelo de embeddings | Rode o script SQL de dimensão e reindexe |

Logs ficam em `apps\local-worker\logs\` (somente identificadores, tempos e resultados — **nunca** o texto das perguntas).
Ao fechar o worker com Ctrl+C, as tarefas em andamento voltam para a fila sem perder tentativas.
