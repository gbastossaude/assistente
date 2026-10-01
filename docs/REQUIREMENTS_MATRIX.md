# Matriz requisito × implementação

Legenda: ✅ implementado e testado · 🟡 implementado em versão mínima (ver débito) · ⏭️ fase posterior prevista na própria especificação.
Testes: **U** = unitário (`tests/unit`), **I** = integração com PostgreSQL (`tests/integration`), **E** = E2E Playwright (`tests/e2e`).

| § | Requisito | Status | Onde | Teste |
|---|---|---|---|---|
| 2 | Padronizar cotação +99, checklist automático, NEW × RENEW | ✅ | `lib/domain/checklist-*`, `services/checklist.ts` | U, I, E |
| 2 | Importar/validar planilha de vidas | ✅ | `lib/lives-import`, `services/lives.ts`, `components/lives` | U, I, E |
| 2 | Grupos econômicos e múltiplos CNPJs | ✅ | `companies`, `company_cnpjs`, `quotation_cnpjs` | I, E |
| 2 | Operadoras na cotação, prazos, retornos, pendências | ✅ | `services/insurers.ts`, aba Operadoras | I, E |
| 2 | Comparar propostas | ✅ | aba Comparativo, `/comparativos` | I |
| 2 | Agenda, tarefas, reuniões, follow-ups | ✅ | `/agenda`, `/tarefas`, automações | I, E |
| 2 | Dashboard executivo | ✅ | `/` (Meu Dia) | I, E |
| 2 | E-mails e WhatsApp padronizados | ✅ | `lib/domain/messages.ts`, `MessageDialog` | U, I |
| 2 | Alertas de renovação, vencimentos, atrasos | ✅ | `automation/engine.ts` (rotina) | I |
| 2 | Histórico completo | ✅ | `interactions`, `quotation_status_history`, `activity_logs` | I |
| 2 | Pesquisa em linguagem natural | ✅ | Assistente (Claude ou roteador local) | U, I, E |
| 3 | Next.js + TS + React + Tailwind + shadcn/ui | ✅ | — | build |
| 3 | PostgreSQL / Supabase (banco) | ✅ | Drizzle; compatível com Supabase Postgres | I |
| 3 | Supabase para autenticação | 🟡 | Autenticação própria (JWT + bcrypt) — roda sem Supabase; troca isolada em `lib/auth` | — |
| 3 | Supabase para documentos | 🟡 | Driver `supabase` (REST + URL assinada) implementado; testado apenas o driver local neste ambiente | — |
| 3 | Zod, RHF, TanStack Table, Recharts | ✅ | — | — |
| 3 | SheetJS ou equivalente | ✅ | ExcelJS (SheetJS sem versão segura no npm) | U |
| 3 | PDF.js quando necessário | 🟡 | Visualização inline de PDF pelo navegador (botão 👁); PDF.js não necessário até aqui | — |
| 3 | `.env.example`, sem segredos no código | ✅ | `.env.example` | — |
| 4 | Sidebar fixa, cards, busca global, atalhos (Nova Cotação/Tarefa/Empresa/Importar Base) | ✅ | `components/layout` | E |
| 4 | Responsivo (celular) | ✅ | menu em gaveta, grids responsivos | manual |
| 4 | Menu com 14 itens | ✅ | + item “Pendências” (seção 17) | — |
| 5 | 12 cards do Meu Dia, Prioridades do Dia, timeline | ✅ | `services/dashboard.ts` | U (ranking), I, E |
| 6 | Cadastro completo de empresas, contratos atuais (múltiplos), planos/vidas/custos/reembolso | ✅ | `/empresas`, `ContractsManager` | I, E |
| 7 | Wizard 5 etapas com todos os campos | ✅ | `/cotacoes/nova`, `/cotacoes/[id]/wizard` | I, E |
| 7 | Regra compulsório: 100% FGTS e dependentes | ✅ | Etapa 2 | I |
| 7 | Coparticipação com limite configurável (30%) | ✅ | Etapa 3 + Configurações | I |
| 7 | 9 situações especiais com subcadastros | ✅ | `lib/domain/special-cases.ts` (+ views SQL) | U, I |
| 7 | Documentos com tipo, datas, responsável, 5 status, observação | ✅ | `quotation_documents` | I, E |
| 8 | Motor de checklist configurável, condições e preenchimento automático | ✅ | `checklist-engine.ts`, Configurações → Checklists | U, I |
| 8 | Campos por item (obrigatório, status, solicitante, remetente, datas, observação, documento) | ✅ | aba Checklist | I |
| 8 | Barra de completude 4 faixas; bloqueio “Pronta para mercado” + override justificado | ✅ | `canMarkReadyForMarket`, `StatusDialog` | U, I, E |
| 9 | Importador XLSX/XLSM com drag-and-drop, preview, mapeamento automático/manual, validação por linha, confirmação | ✅ | `LivesImporter`, `/api/quotations/[id]/lives/*` | U, I, E |
| 9 | Todas as validações e cálculos (idade, faixa ANS configurável), arquivo original preservado | ✅ | `validate.ts`, storage `wx` | U, I |
| 9 | Resumo com cards e gráficos | ✅ | `LivesSummaryView` | U, E |
| 10 | Kanban + tabela, 20 status, histórico de mudanças, voltar status | ✅ | `/cotacoes` | I |
| 11 | Controle por operadora (todos os campos e 10 status), independente do status geral | ✅ | `InsurersPanel` | I, E |
| 12 | Comparativo lado a lado, variação vs. atual, destaque sem eleger “melhor” | ✅ | `ComparisonView` | I |
| 12 | Exportação PDF e Excel | ✅/🟡 | Excel ✅ (`/api/quotations/[id]/comparativo`); PDF via impressão do navegador com CSS de impressão | — |
| 13 | Timeline única com todos os tipos e próxima ação | ✅ | `interactions`, `InteractionForm` | I |
| 14 | Tarefas completas, recorrência, lembretes, próxima ação ao concluir | ✅ | `/tarefas` | I, E |
| 14 | Anexos em tarefas | ✅ | upload no diálogo da tarefa (`task_id`) | — |
| 14 | Lembretes | 🟡 | Notificação no sistema (sino) pela rotina; sem e-mail/push | I |
| 15 | Agenda dia/semana/mês, tipos, vínculos | ✅ | `/agenda` | manual |
| 15 | Google Calendar via OAuth | ⏭️ | Campos reservados; plano em `DEPLOY.md` §8 | — |
| 16 | Renovações 30/60/90/120, marcos configuráveis | ✅ | `/renovacoes`, `renewal_milestones` | U, I |
| 17 | Central de pendências agrupada, com responsável/origem/prazo/prioridade/status/próxima ação | ✅ | `/pendencias`, `syncPendencies` | I, E |
| 18 | Chat com ferramentas controladas, regras (confirmação, não inventar, não enviar) | ✅ | `server/assistant` | U, I, E |
| 18 | Modo Claude (API) | 🟡 | Implementado com tool use + fallback de recusa; não exercitado contra a API real neste ambiente (sem chave) | — |
| 19 | Templates cliente/operadora, pedido baseado só em pendências reais | ✅ | `messages.ts`, Configurações → Templates | U, I |
| 20 | Motor de regras com as 10 automações e prazos configuráveis | ✅ | `automation/engine.ts`, Configurações → Automações | I |
| 21 | Relatórios com filtros e todos os indicadores | ✅ | `/relatorios` | I |
| 22 | Busca global (9 tipos) com link direto | ✅ | `services/search.ts` | I, E |
| 23 | Todas as entidades mínimas + `id/created_at/updated_at/created_by` + soft delete | ✅ | `schema.ts` (+ views) | I |
| 24 | Autenticação, RBAC, storage privado, logs de acesso sensível, retenção, uploads, CSRF/XSS/SQLi | ✅ | ver `DEPLOY.md` §7 | U, I |
| 24 | URLs temporárias para arquivos | 🟡 | Supabase: URL assinada 60 s; driver local: transmissão pela rota autenticada (sem URL pública) | — |
| 25 | 5 papéis, arquitetura para RBAC granular | ✅ | `permissions.ts` | U |
| 26 | Auditoria de todos os eventos listados + tela administrativa | ✅ | `activity_logs`, Configurações → Auditoria | I |
| 27 | Central da Cotação: cabeçalho fixo + 12 abas | ✅ | `/cotacoes/[id]` | E |
| 28 | Score de prontidão com componentes e pesos configuráveis | ✅ | `readiness.ts` | U, I |
| 29 | Validação de schemas, erros centralizados, loading/empty states, toasts, testes, seed só dev | ✅ | `action-utils.ts`, `api-utils.ts`, `loading.tsx`, `error.tsx` | 94 U/I + 11 E2E |
| 31 | 15 critérios de aceite | ✅ | `tests/e2e/acceptance.spec.ts` | E |
| 32 | Sem telas falsas/botões sem ação, sem `alert()`, migrations versionadas, README, confirmação em ações destrutivas, preview em importação, filtros nas listas, timeline em mudanças | ✅ | — | — |
| 34 | Pedido de informações ao cliente omitindo itens recebidos/validados | ✅ | `clientRequestItems` | I |
| — | Conteúdo do site Be Smart (Playbook/Arsenal): módulo Playbook, checklist PJ +99, coluna SEXO, cadência D0–D7, assistente | ✅ | `/playbook`, `lib/playbook/*`, `client_followup_cadence`, `consultar_playbook` | U, I, E |

## Débitos técnicos explícitos

1. **Autenticação própria em vez de Supabase Auth** — decisão para rodar em qualquer ambiente. Sem SSO/MFA ainda;
   próximo passo: MFA TOTP ou login via provedor corporativo (OIDC).
2. **Limite de tentativas de login em memória** — por instância; em produção com várias instâncias, mover para
   tabela/Redis.
3. **Listas com limite fixo (500–1000 linhas)** — suficiente para o volume do time; paginação no servidor fica
   para quando a base crescer (a base de vidas já é paginada).
4. **Lembretes só no sistema** — integração de e-mail transacional (ex.: SES/Resend) e push ficam para depois.
5. **Driver Supabase Storage e modo Claude do assistente** não foram exercitados contra os serviços reais neste
   ambiente (sem credenciais). Ambos são isolados e o sistema funciona sem eles (driver local / roteador local).
6. **Exportação PDF do comparativo** via impressão do navegador (CSS de impressão); geração de PDF no servidor
   prevista para fase posterior, como indica a seção 12.
7. **Google Calendar** — fase posterior prevista na seção 15.
8. **Planilha real `EXEMPLO BASE 1.xlsm`** não estava no repositório; a validação usa o layout descrito na
   especificação e uma planilha sintética equivalente. Validar com o arquivo real assim que for adicionado em
   `templates/`.
