# BeSmart Health Cockpit

Cockpit operacional + assistente de grandes contas para o **Head de Planos de Saúde da BeSmart** — cotações
empresariais (foco em +99 vidas), checklist automático NEW/RENEW, importação e validação da base de vidas,
documentos com storage privado, operadoras e propostas, comparativo, tarefas, agenda, pendências, renovações,
relatórios, auditoria e assistente inteligente.

> Especificação e decisões: [`docs/`](docs) — comece por [`PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) e
> [`REQUIREMENTS_MATRIX.md`](docs/REQUIREMENTS_MATRIX.md).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 + componentes no padrão shadcn/ui (Radix) ·
PostgreSQL + Drizzle ORM (migrations versionadas) · Zod · React Hook Form · TanStack Table · Recharts ·
ExcelJS (XLSX/XLSM) · Anthropic SDK (assistente) · Vitest · Playwright.

## Requisitos

- Node.js 20+ (testado com 22)
- PostgreSQL 15+ (local ou Supabase)

## Instalação e execução (desenvolvimento)

```bash
npm install
cp .env.example .env            # ajuste DATABASE_URL, AUTH_SECRET (≥ 32 caracteres) e CRON_SECRET

npm run db:migrate              # aplica as migrations de drizzle/
ADMIN_EMAIL=voce@empresa.com ADMIN_PASSWORD='senha-forte-123' npm run db:bootstrap
                                # parâmetros, checklists NEW/RENEW, templates, automações,
                                # catálogo de operadoras e o primeiro administrador

npm run db:seed-dev             # (opcional, SOMENTE dev) dados fictícios de demonstração
npm run dev                     # http://localhost:3000
```

Usuários do seed de demonstração (senha `Besmart@2026`): `head@besmart.local`, `analista@besmart.local`,
`comercial@besmart.local`, `leitura@besmart.local`.

### Base de vidas de referência

Coloque a planilha real **`EXEMPLO BASE 1.xlsm`** em `templates/`. O repositório inclui apenas um gerador de
planilha **sintética** no mesmo layout (aba `BASE SAÚDE`, 13 colunas) para testes: `npm run sample:base` →
`templates/BASE_SINTETICA_EXEMPLO.xlsm` (com 3 linhas de erro propositais para ver a validação).

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Desenvolvimento, build e servidor de produção |
| `npm run lint` · `npm run typecheck` | ESLint e TypeScript |
| `npm test` | Testes unitários + integração (integração requer `TEST_DATABASE_URL`; o banco de teste é recriado) |
| `npm run test:e2e` | Playwright — critérios de aceite pela interface (requer app com seed de dev) |
| `npm run db:generate` | Gera nova migration a partir de `src/server/db/schema.ts` |
| `npm run db:migrate` | Aplica migrations |
| `npm run db:bootstrap` | Configuração base idempotente (seguro em produção) |
| `npm run db:seed-dev` | Dados de demonstração (recusa rodar com `NODE_ENV=production`) |
| `npm run sample:base` | Gera planilha sintética de base de vidas |

E2E: `PLAYWRIGHT_CHROMIUM_PATH` permite apontar um Chromium já instalado; `E2E_EMAIL`/`E2E_PASSWORD` trocam o usuário.

## Variáveis de ambiente

Veja [`.env.example`](.env.example). Principais:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL (Supabase: connection string com `sslmode=require`) |
| `AUTH_SECRET` | Assinatura das sessões (JWT HS256) — mínimo 32 caracteres |
| `SESSION_TTL_HOURS` | Duração da sessão |
| `STORAGE_DRIVER` | `local` (pasta privada `STORAGE_LOCAL_DIR`) ou `supabase` (bucket privado) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Storage Supabase |
| `UPLOAD_MAX_MB` | Limite de upload |
| `CRON_SECRET` | Protege `POST /api/cron/sweep` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Assistente com Claude (opcional; padrão `claude-opus-5-5`) |
| `APP_TIMEZONE` | Fuso de negócio (padrão `America/Sao_Paulo`) |

## Arquitetura (resumo)

```
src/lib/domain        regras puras (checklist, completude, prontidão, CNPJ, faixas ANS, renovações, mensagens…)
src/lib/lives-import  mapeamento/validação/resumo da base de vidas
src/lib/validation    schemas Zod compartilhados
src/server/services   persistência + regras com banco (um módulo por domínio)
src/server/actions    Server Actions (RBAC + Zod + erros centralizados)
src/server/automation motor de automações e rotina diária
src/server/assistant  ferramentas controladas + orquestração (Claude ou roteador local)
src/app               páginas (App Router) e rotas de API (upload/download, importação, exportação, cron)
src/components        design system e componentes por módulo
```

Detalhes em [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) e [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

## Assistente IA

- **Com `ANTHROPIC_API_KEY`**: Claude (`ANTHROPIC_MODEL`, padrão `claude-opus-5-5`) com tool use sobre ferramentas
  tipadas e somente leitura (busca, resumo de cotação, pendências, renovações, operadoras sem resposta,
  histórico, agenda do dia, geração de mensagens). Fallback de recusa do lado do servidor habilitado
  (`fallbacks: "default"`). Erros da API caem para o modo local.
- **Sem chave**: roteador de intenções em português, determinístico, que usa as mesmas ferramentas.
- Ações em lote (ex.: “crie tarefas para as operadoras que não responderam”) são **propostas** com a lista
  exata de registros e só executam após o botão “Confirmar”. Nada é enviado por e-mail/WhatsApp
  automaticamente. Histórico de conversas e ações fica persistido e auditado.

## Rotina diária (alertas e automações)

Agende `POST /api/cron/sweep` com `Authorization: Bearer $CRON_SECRET` (ex.: a cada hora). A rotina também roda
sozinha, no máximo 1×/hora, quando alguém abre o “Meu Dia”. Ela recalcula pendências, gera alertas (processos
parados, propostas vencendo, follow-ups, tarefas atrasadas, lembretes, janelas de renovação) e aplica a
política de retenção.

## Deploy, backup e segurança

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md).
