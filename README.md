# BeSmart Health Cockpit

Central de comando comercial e operacional + assistente de IA para o **Head de Planos de Saúde da BeSmart** e sua
equipe — **CRM multi-produto, reuniões com ata automática, campanhas do mês, calendário editorial de redes sociais, carrossel para Instagram (PNG 1080×1080), mensagens prontas, respostas rápidas,
hierarquia (Supervisor/Corretor/Assistente)**, cotações
empresariais (foco em +99 vidas), checklist automático NEW/RENEW, importação e validação da base de vidas,
documentos com storage privado, operadoras e propostas, comparativo, tarefas, agenda, pendências, renovações,
relatórios, auditoria, **Playbook Estratégico Be Smart** (regras das modalidades, SPIN, ganchos e cadência de
follow-up D0–D7, integrados de planosaude26-rgb.github.io/besmart) e assistente inteligente.

> Especificação e decisões: [`docs/`](docs) — comece por [`ASSISTENTE_COMERCIAL.md`](docs/ASSISTENTE_COMERCIAL.md)
> (arquitetura, módulos, modelo de dados, fluxo diário e checklist do módulo comercial),
> [`PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) e [`REQUIREMENTS_MATRIX.md`](docs/REQUIREMENTS_MATRIX.md).

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

Usuários do seed de demonstração (senha `Besmart@2026`): `head@besmart.local`, `supervisor@besmart.local`,
`corretor@besmart.local` e `corretor2@besmart.local` (equipe do supervisor), `assistente@besmart.local`,
`analista@besmart.local`, `comercial@besmart.local`, `leitura@besmart.local`. O seed inclui oportunidades no CRM,
uma reunião com ata gerada, uma campanha ativa e compromissos; se o banco já tiver empresas, ele acrescenta apenas
os dados comerciais.

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
| `DATABASE_URL` | PostgreSQL (Supabase: string do *Session pooler*; o SSL é ativado automaticamente) |
| `DATABASE_CA_CERT` | (Opcional) certificado do Supabase para verificar o servidor |
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

## Módulo comercial (resumo)

| Tela | Para quê |
|---|---|
| `/` Início | Indicadores comerciais, alertas, compromissos de hoje, follow-ups atrasados, campanhas e operação do dia |
| `/crm` | Pipeline de 11 etapas (Kanban/tabela), próximos passos sugeridos, mensagem de follow-up e checklist de documentos |
| `/reunioes` | Ficha com roteiro de 17 perguntas → ata, pendências, WhatsApp de follow-up e tarefa de retorno |
| `/campanhas` | Campanhas do mês com metas e lembretes de início, meio, últimos dias e resultado |
| `/carrossel` | Carrossel para Instagram: capa, conteúdo e CTA com palavra-chave, prévia ao vivo, checklist e ZIP com os PNGs 1080×1080 e a legenda |
| `/mensagens` · `/respostas` | Biblioteca com variáveis e botão copiar · respostas rápidas sobre planos de saúde |
| `/tarefas?modo=kanban` · `/agenda` | Kanban de tarefas · agenda com status, assessor/comercial e lembrete |
| `/relatorios` | Aba Comercial + exportação CSV/PDF |
| Configurações → LGPD e backup | Localizar e anonimizar titular; backup JSON sem dados de saúde |

Hierarquia: **Corretor** vê só a própria carteira; **Supervisor** vê a equipe (defina o supervisor de cada usuário
em Configurações → Usuários); Head/Administrador veem tudo. Detalhes em
[`docs/ASSISTENTE_COMERCIAL.md`](docs/ASSISTENTE_COMERCIAL.md).

## Assistente IA

- **Com `ANTHROPIC_API_KEY`**: Claude (`ANTHROPIC_MODEL`, padrão `claude-opus-5-5`) com tool use sobre ferramentas
  tipadas e somente leitura (busca, resumo de cotação, pendências, renovações, operadoras sem resposta,
  histórico, agenda do dia, geração de mensagens, **CRM, follow-ups atrasados, mensagem de follow-up por cliente,
  resumo e roteiro de reunião, checklist de documentos, resumo diário/semanal e relatório de vendas**). Fallback de recusa do lado do servidor habilitado
  (`fallbacks: "default"`). Erros da API caem para o modo local.
- **Sem chave**: roteador de intenções em português, determinístico, que usa as mesmas ferramentas.
- Ações (ex.: “crie tarefas para as operadoras que não responderam”, “criar campanha para planos empresariais este
  mês”) são **propostas** com a lista exata do que será criado e só executam após o botão “Confirmar”. Nada é enviado por e-mail/WhatsApp
  automaticamente. Histórico de conversas e ações fica persistido e auditado.

## Rotina diária (alertas e automações)

Agende `POST /api/cron/sweep` com `Authorization: Bearer $CRON_SECRET` (ex.: a cada hora). A rotina também roda
sozinha, no máximo 1×/hora, quando alguém abre o “Meu Dia”. Ela recalcula pendências, gera alertas (processos
parados, propostas vencendo, follow-ups, tarefas atrasadas, lembretes de tarefas e de compromissos, follow-ups de
vendas atrasados, marcos das campanhas, janelas de renovação) e aplica a política de retenção. Para lembretes de
compromissos com antecedência de minutos, agende a rotina a cada 5–15 minutos (a tela também avisa em tempo real).

## Deploy, backup e segurança

Passo a passo completo (Supabase + Render + GitHub Actions) em [`docs/DEPLOY.md`](docs/DEPLOY.md).
