# Testes

```bash
cd especialista-ia
npm ci
npx tsc -b                     # tipos de todo o monorepo
npm run test:unit              # rápidos, sem dependências externas
npm run test:db                # requer PostgreSQL 15+ com pgvector (TEST_PG_ADMIN_URL)
npx vitest run --project stack # interface: requer Docker + imagens supabase/gotrue e postgrest/postgrest
```

## Projetos de teste

| Projeto | Arquivos | O que cobre |
|---|---|---|
| unit | `tests/unit/*.test.ts` | LGPD/PII, entidades, temas, telefones, injeção, formatação WhatsApp, chunking, qualidade de extração, validação de citações/números, cenários do `answerQuestion()`, assinatura do webhook (conferida com openssl), verificação GET, comandos, cliente da Graph API (retentativas, Retry-After, 131047), sincronização do código das Edge Functions |
| db | `tests/db/database.test.ts` | Migrations completas; autenticação e perfis; RLS por papel; escalonamento de privilégio; limites; fila (SKIP LOCKED concorrente, bloqueio de outro worker, retentativas, bloqueio vencido, encerramento gracioso, janela expirada); conflitos; versões; duplicidade; busca híbrida; revisão; sobreposição; desativação; teto do WhatsApp sob concorrência; idempotência; status de entrega; dashboard; auditoria; retenção |
| db | `tests/db/worker-e2e.test.ts` | Worker real + cliente HTTP real do Ollama contra servidor que imita a API oficial: PDF/DOCX/XLSX/CSV indexados; consulta com fonte e página; sem fonte; vencido; conflito; Ollama fora do ar; falha durante a geração; worker offline; acionamento do WhatsApp; PDF digitalizado em revisão; integridade; FAQ |
| db | `tests/db/whatsapp-e2e.test.ts` | Webhook assinado → fila → worker → envio pela Graph API simulada: assinatura inválida, número não autorizado, nono dígito, minimização, reentrega, idempotência por pergunta, status de entrega, atendimento humano, ajuda, mídia, complemento, falha + reenvio, janela expirada, teto atingido, envio desativado, outro número |
| stack | `tests/stack/ui.e2e.test.ts` | Chromium real: login inválido; dashboard com worker online; editor envia PDF pelo painel e o worker (via supabase-js, Storage e Auth reais) indexa; editor cola texto como documento e ele é indexado; colaborador consulta pela extensão MV3 (fonte, favorito, feedback, histórico); sem fonte; permissões no painel; RLS/Storage/Edge Function contra acesso indevido; criação de colaborador com senha temporária; perguntas para o editor |

## Simulações (e por quê)

- **Ollama**: o download de modelos estava bloqueado no ambiente de desenvolvimento. `tests/helpers/mock-ollama.ts`
  implementa `/api/version`, `/api/tags`, `/api/embed` e `/api/chat` no formato oficial; o cliente HTTP do worker é o real.
- **Meta Graph API**: sem credenciais e com o domínio bloqueado. Os testes usam respostas no formato oficial e eventos
  assinados com HMAC como a Meta faz.
- **Supabase Storage/Edge Runtime**: no teste de interface, um gateway local emula o Storage aplicando **as mesmas
  políticas RLS** de `storage.objects` e executa os handlers das Edge Functions em Node (o mesmo código publicado no Deno).
  Auth (GoTrue) e PostgREST são as imagens oficiais.

Nenhum desses testes comprova o funcionamento com os serviços reais; para isso, siga o checklist de
[IMPLANTACAO.md](IMPLANTACAO.md#7-validação-final-checklist).
