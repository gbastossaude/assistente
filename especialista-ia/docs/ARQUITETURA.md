# Arquitetura

## Decisões principais

| Decisão | Motivo |
|---|---|
| IA local com **Ollama** + worker que **busca** tarefas | Custo zero por uso, dados não saem para provedores de IA, e nenhuma porta precisa ser aberta no escritório (o worker só faz HTTPS de saída). |
| **Supabase** como intermediário (Postgres, Auth, Storage, Edge Functions, Realtime) | Plano gratuito cobre o volume interno; RLS no banco protege todos os canais de uma vez. |
| Um único motor `answerQuestion()` (`packages/ai-core`) | Extensão, painel e WhatsApp recebem exatamente as mesmas regras de resposta. |
| Fila em tabela (`processing_jobs`) com `FOR UPDATE SKIP LOCKED` | Sem serviço extra; bloqueio por tarefa, tentativas, recuperação após queda e expiração pela janela do WhatsApp. |
| Regras do WhatsApp em TypeScript puro + operações atômicas em SQL | Mesmo código roda no Deno (Supabase) e no Node (testes); o banco garante idempotência e o teto de envios. |
| Busca **híbrida** (pgvector HNSW + texto em português sem acentos, combinadas por RRF) | Termos exatos ("CPT", "MEI", "131047") e sinônimos/paráfrases são encontrados. |
| Painel estático na Netlify | Sem servidor próprio; segredos nunca vão ao navegador. |

## Fluxo de uma pergunta

1. **Entrada** — extensão/painel chamam `submit_question` (RPC): valida papel, tamanho e limite por minuto/dia, remove dados pessoais (2ª camada; a 1ª é no navegador), grava a pergunta e um gatilho cria a tarefa. No WhatsApp, a Edge Function `especialista-whatsapp-webhook` valida a assinatura, registra o `wamid` (idempotência), confere se o número está aprovado, trata comandos e cria a pergunta com `expires_at` = fim da janela de 24 h.
2. **Worker** — acordado pelo Realtime (ou pela consulta periódica), chama `claim_jobs` e executa `answerQuestion()`:
   1. Minimização de dados (CPF, CNPJ, telefone, e-mail, CNS, RG, nascimento, nomes após "cliente").
   2. Bloqueio de prompt injection explícito; recusa de diagnóstico médico; aviso em temas jurídicos.
   3. Extração de operadora, produto, UF, cidade, vidas, modalidade, tempo de CNPJ e tema.
   4. **Informações obrigatórias** (regras configuráveis): se faltar algo indispensável, pede complemento.
   5. Embedding da pergunta (`bge-m3`) e busca híbrida em trechos de documentos ativos **da versão vigente** + FAQs publicadas, filtrando pela operadora.
   6. **Priorização de fontes**: vigência é eliminatória (vencidos/futuros separados); outra UF é excluída; bônus por operadora, produto, região, modalidade, faixa de vidas, atualização, prioridade manual e FAQ oficial; penalidade para condição negociada.
   7. Sem fonte relevante → **mensagem padrão** (sem chamar o modelo). Somente documentos vencidos → mensagem padrão + aviso do vencimento.
   8. FAQ oficial muito semelhante → resposta direta (instantânea).
   9. Geração com saída **JSON estruturada** (`status`, `resposta`, `fontes`, `informacoes_faltantes`, `conflito`). Trechos entram como dados delimitados; pares de documentos da mesma operadora/categoria são sinalizados para comparação.
   10. **Validação**: JSON válido, citações existentes, e **todo número da resposta precisa aparecer nas fontes citadas ou na pergunta**. Falhou → uma nova tentativa com correção; falhou de novo → mensagem padrão + documentos relacionados para conferência manual.
   11. Conflito → resposta mostra as duas regras sem escolher e registra em `knowledge_conflicts`.
   12. Avisos: regra regional, condição negociada, procedimento interno, vencimento próximo, LGPD.
3. **Saída** — `save_answer` grava resposta + fontes numa transação. A extensão recebe por Realtime (com consulta periódica de garantia). No WhatsApp, o worker chama `whatsapp-send`, que confere liga/desliga, janela de 24 h, idempotência por pergunta e **reserva atômica no teto mensal/diário** antes de chamar a Graph API.

## Fluxo de um documento

Upload no painel (hash SHA-256 calculado no navegador; duplicidade e sobreposição verificadas) → Storage privado
→ `document_versions` (número sequencial no servidor) → tarefa `index_document` → worker baixa, **confere o hash**,
extrai (pdf.js, mammoth, ExcelJS, Papa Parse), avalia a qualidade (páginas vazias, baixa densidade, caracteres
corrompidos), aplica OCR local opcional (Tesseract + Poppler), divide em trechos com página, gera embeddings e grava.
`finalize_document_version`: extração boa → versão vigente (a anterior vira "substituída" e seus trechos saem da
busca); extração duvidosa ou OCR → **revisão humana** obrigatória antes de entrar nas respostas. Documentos ativos
sobrepostos (mesma operadora/categoria/abrangência/vigência) geram alerta de conflito potencial.

## Modelo de dados (principais tabelas)

`roles`, `profiles`, `operators`, `products`, `knowledge_documents`, `document_versions`, `document_chunks`
(vector(1024) + tsvector), `knowledge_faq`, `required_info_rules`, `knowledge_conflicts`, `questions`, `answers`,
`answer_sources`, `feedback`, `handoff_requests`, `processing_jobs`, `whatsapp_contacts`, `whatsapp_messages`,
`whatsapp_usage`, `usage_alerts`, `whatsapp_webhook_events`, `system_settings`, `audit_logs`, `worker_heartbeats`.

Funções relevantes: `submit_question`, `claim_jobs`, `save_answer`, `fail_job`, `release_jobs`,
`finalize_document_version`, `approve_document_version`, `search_chunks`, `search_faq`, `whatsapp_reserve_send`,
`get_dashboard`, `purge_expired_data`, `promote_first_admin`.

## Papéis

| Papel | Pode |
|---|---|
| Administrador | Tudo: usuários, configurações, custos, auditoria, base de conhecimento |
| Editor | Documentos, FAQ, regras, perguntas, feedback, atendimento humano |
| Colaborador | Consultar (extensão, painel, WhatsApp aprovado); ver só o próprio histórico |
| Worker (máquina) | Reivindicar/concluir tarefas, ler documentos e trechos, gravar trechos e respostas |

## Provedores de IA

`ChatProvider` / `EmbeddingProvider` (`packages/ai-core/src/types.ts`). Implementações: Ollama (padrão) e
"OpenAI-compatible" (para servidores locais como LM Studio ou, no futuro, serviços pagos). No **modo gratuito**
a fábrica recusa qualquer provedor que não seja local — trocar exige decisão explícita no código e na configuração.
