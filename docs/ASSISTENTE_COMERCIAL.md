# Assistente de IA para o Head de Planos de Saúde — módulo comercial

Este documento responde aos entregáveis do *Prompt Mestre — Sistema Assistente de IA para Head de Planos de Saúde*:
(1) arquitetura, (2) módulos, (3) modelo de dados, (4) fluxo de uso diário e (5) checklist de funcionalidades.

O prompt foi atendido **estendendo o BeSmart Health Cockpit** (que já entregava cotações +99, agenda, tarefas,
empresas, relatórios e assistente) em vez de criar um sistema paralelo: a operação de cotações e o comercial
passam a compartilhar empresas, agenda, tarefas, timeline, auditoria e o mesmo assistente. Como o ambiente
permite, foi seguida a opção **"SaaS completo"** do prompt (front-end moderno, API, banco, autenticação,
permissões, histórico de alterações e lembretes), não a versão HTML com LocalStorage.

## 1. Arquitetura

```
Navegador (Next.js App Router · React 19 · Tailwind · componentes shadcn/Radix)
   │  Server Components (leitura)            Server Actions (escrita: RBAC + escopo + Zod + auditoria)
   ▼                                          ▼
src/server/services/*  ← regras com banco (um módulo por domínio)
src/lib/domain/*       ← regras puras e testáveis (CRM, reuniões, campanhas, biblioteca, escopo, pendências de dados)
src/server/scope.ts    ← escopo de dados por papel (Corretor = carteira; Supervisor = equipe; demais = tudo)
src/server/access.ts   ← guardas por ID nas ações/rotas (impede editar/baixar registro fora do escopo)
src/server/assistant/* ← assistente: Claude com ferramentas tipadas ou roteador local em português
src/server/automation  ← rotina (cron) de alertas: follow-ups, lembretes de agenda, campanhas, renovações…
PostgreSQL (Drizzle ORM, migrations versionadas em drizzle/) · storage privado de documentos
```

- **Sem dados fictícios em produção**: o bootstrap cria apenas configuração (parâmetros, modelos, biblioteca de
  mensagens/respostas). Dados de demonstração só via `npm run db:seed-dev`, que recusa rodar em produção.
- **Nada é enviado automaticamente**: mensagens, atas e follow-ups são gerados para copiar/abrir no WhatsApp.
- **Integrações futuras** (WhatsApp, Google Calendar, e-mail): campos e pontos de extensão já existem
  (`calendar_events.external_provider/id`, mensagens com variáveis, assistente com ferramentas).

## 2. Módulos (menu)

| Seção | Módulo | O que faz |
|---|---|---|
| Meu dia | **Início** | Indicadores comerciais (leads, clientes ativos, cotações em andamento, propostas enviadas, vendas no mês, valor em negociação, conversão, tarefas atrasadas, reuniões da semana, campanhas ativas), alertas importantes, compromissos de hoje, follow-ups de vendas atrasados, campanhas ativas e a operação do dia (cotações, renovações, prioridades). |
| | Minha Central | Tudo sob minha responsabilidade. |
| | **Agenda** | Dia/semana/mês; 14 tipos (reunião, ligação, follow-up, envio de cotação, retorno de operadora, implantação, pós-venda, campanha…); cliente, assessor, comercial, local/link, observações, **status** (agendado/realizado/remarcado/cancelado) e **lembrete antes do compromisso** (notificação + aviso na tela). |
| | **Tarefas** | Lista e **Kanban** (arrastar entre colunas), prioridade baixa/média/alta/urgente, prazo, lembrete, categorias (cotação, venda, campanha, reunião, pós-venda, documento, financeiro, operadora…), atrasadas em destaque, recorrência e próxima ação. |
| | **Reuniões** | Ficha de reunião com **um cliente**: dados, participantes, objetivo, **roteiro de 17 perguntas** (marcar pergunta feita, resposta recebida/pendente, resposta e observação; perguntas extras), próximos passos com responsável e prazo. Gera **ata, pendências, próximos passos, WhatsApp de follow-up e tarefa de retorno**; aparece na agenda e na timeline do cliente. |
| Comercial | **CRM** | Pipeline de 11 etapas (lead novo → implantado/perdido) em Kanban e tabela; multi-produto; todos os campos do prompt; mover/voltar etapa com histórico; perder exige motivo; próximo passo e follow-up; histórico de interações; tarefas e reuniões da oportunidade; **próximos passos sugeridos**, **mensagem de follow-up pronta** e **checklist de documentos**; exportação CSV; anonimização LGPD. |
| | **Campanhas** | Campanhas do mês com produto, período, público, metas, mensagem, canais, responsáveis, status e resultados; leads/vendas/follow-ups calculados do CRM; **lembretes automáticos** de início, meio, últimos dias e encerramento; ativação automática na data de início. |
| | **Mensagens prontas** | 24 mensagens em 11 categorias com variáveis `{{cliente}}`, `{{empresa}}`, `{{operadora}}`, `{{valor}}`, `{{data}}`, `{{horario}}`, `{{consultor}}`…; preencher variáveis uma vez, **copiar**, abrir no WhatsApp, **editar**, **duplicar**, restaurar original. |
| | **Respostas rápidas** | 16 temas (carência, coparticipação, acomodação, rede, reembolso, PME, empresarial, individual, familiar, redução de custo, portabilidade, vigência, documentos, dependentes, cancelamento, implantação) — editáveis, com copiar e a ressalva de que as condições variam por operadora, contrato, região e análise. |
| | **Calendário editorial** | 30 dias de posts para Instagram, LinkedIn, TikTok, Facebook ou YouTube (1x/dia, 5x ou 3x por semana): dia, dia da semana, **pilar** (50% educativo, 20% conexão, 15% venda, 15% engajamento), formato, tema, resumo da legenda (2 frases) e CTA; vendas concentradas na **semana de lançamento** (com aquecimento antes e últimas chamadas depois); **datas importantes** (sugestão automática de feriados e campanhas de saúde do período); resumo semanal, 5 ideias de Stories, 3 de Reels e dicas de horário. Textos escritos pelo Claude quando há `ANTHROPIC_API_KEY` (dias, pilares e formatos continuam calculados pelo sistema); sem chave, banco de temas local. Copiar em Markdown, CSV e impressão/PDF. |
| | Empresas | Cadastro de clientes/prospects (agora com endereço). |
| Cotações | Cotações / Grandes Contas +99 | Wizard, checklist NEW/RENEW, base de vidas, operadoras, propostas, comparativo — e o novo painel **"Pendências de dados antes do envio às operadoras"** (empresa, cotação, contrato atual e documentos, campo a campo), com acomodação, abrangência, titulares/dependentes, início desejado e prazo do cliente. |
| | Pendências, Operadoras, Comparativos, Documentos, Renovações | Retaguarda (visão global; não disponível para Corretor/Supervisor). |
| Inteligência | Playbook | Base técnica e roteiros comerciais. |
| | **Relatórios** | Aba Comercial: vendas por período, por corretor e por produto, oportunidades por etapa, leads por origem, campanhas e resultados, clientes sem follow-up, reuniões realizadas, motivos de perda, tarefas atrasadas. Aba Cotações: status, tempo médio por etapa e de retorno das operadoras. **CSV** (vendas, oportunidades, reuniões, tarefas, campanhas) e **PDF** pela impressão. |
| | **Assistente IA** | Ver seção 2.1. |
| | Configurações | Usuários e **hierarquia** (supervisor de cada usuário), parâmetros, checklists, automações, templates, auditoria e **LGPD e backup**. |

### 2.1 Assistente de IA

Funciona com Claude (`ANTHROPIC_API_KEY`) ou, sem chave, com um roteador determinístico em português. Usa somente
dados do sistema por ferramentas tipadas, respeitando o escopo do usuário. Comandos (exemplos do prompt):

| Pedido | Ferramenta |
|---|---|
| "Criar mensagem de follow-up para o cliente X" | `mensagem_followup_cliente` (texto por etapa da venda) |
| "Resumir esta reunião" | `resumir_reuniao` (ata, pendências e próximos passos) |
| "Listar pendências desta cotação" | `pendencias` |
| "Criar roteiro para reunião com o cliente X" | `roteiro_reuniao` (omite o que o CRM já sabe) |
| "Gerar mensagem pedindo documentos" | `checklist_documentos` (checklist + WhatsApp da biblioteca) |
| "Mostrar vendas com follow-up atrasado" | `listar_oportunidades` |
| "Criar campanha para planos empresariais este mês" | `propor_campanha` → **só cria após "Confirmar"** |
| "Quais os próximos passos para o cliente X?" | `resumo_oportunidade` |
| "Resumo do dia" / "Resumo semanal" | `resumo_diario` / `resumo_semanal` |
| "Relatório de vendas do mês" | `relatorio_vendas` |
| "Crie um calendário editorial de novembro para o Instagram" | `calendario_editorial` (30 dias de posts) |

Além das ferramentas de cotações já existentes (resumo, pendências, renovações, operadoras sem resposta,
histórico, agenda, e-mails/WhatsApp de cobrança, playbook). Corretor e Supervisor só acessam as ferramentas que
respeitam o escopo de carteira/equipe.

### 2.2 Hierarquia e permissões

| Papel | Vê | Pode |
|---|---|---|
| Administrador | Tudo | Tudo, inclusive usuários |
| Head/Gerente | Toda a operação | Operação, configurações, auditoria, LGPD/backup, exclusões, override de prontidão |
| Supervisor | **Sua equipe** (usuários com ele como supervisor) | CRM, reuniões, campanhas, tarefas, agenda, empresas/cotações da equipe, exportação |
| Corretor | **Apenas os próprios** leads, clientes, cotações, tarefas, reuniões e vendas | CRM, reuniões, tarefas, agenda, empresas/cotações próprias |
| Assistente | Operação | Agenda, tarefas, reuniões, mensagens, pendências, documentos, apoio ao CRM (sem exclusões nem configurações) |
| Analista / Comercial / Somente leitura | Papéis da operação de cotações (mantidos) | — |

O escopo é aplicado nas listas, nas fichas (registro fora do escopo responde como inexistente), na busca global,
nos indicadores, nos relatórios, nas exportações, no assistente e nas **ações de escrita por ID** (`src/server/access.ts`).
Telas de visão global (Pendências, Operadoras, Comparativos, Documentos, Renovações, Grandes Contas) exigem a
permissão `operations:read`, que Corretor e Supervisor não têm.

## 3. Modelo de dados (novidades)

Detalhes em [`DATA_MODEL.md`](DATA_MODEL.md). Migration: `drizzle/0003_comercial.sql`.

- `opportunities` + `opportunity_stage_history` — CRM.
- `meetings` — ficha de reunião (`questions`/`actions` em JSONB tipado).
- `campaigns` — campanhas do mês.
- `library_items` — mensagens prontas e respostas rápidas (`kind`).
- Novas colunas: `users.supervisor_id`; `companies.address`; `quotations` (acomodação, abrangência, titulares,
  dependentes, início desejado, prazo do cliente); `tasks` (oportunidade, reunião, campanha); `calendar_events`
  (status, cliente, assessor, comercial, oportunidade, lembrete); `interactions.opportunity_id`.
- Novos valores de enum: papéis `supervisor`, `corretor`, `assistente`; tipos de compromisso `ligacao`,
  `envio_cotacao`, `retorno_operadora`, `pos_venda`, `campanha`.

## 4. Fluxo de uso diário

1. **Abrir o Início** — alertas no topo (follow-ups atrasados, tarefas atrasadas, reuniões sem ata, campanhas
   terminando), indicadores do mês e compromissos de hoje. A faixa de "próximo compromisso" e os avisos na tela
   lembram das reuniões; o sino traz as notificações da rotina.
2. **Pedir o "Resumo do dia"** ao assistente, se quiser o panorama em texto.
3. **Trabalhar os follow-ups** no CRM (filtro "Atrasados"): abrir a oportunidade, copiar a mensagem pronta da
   etapa, registrar a interação e definir o próximo follow-up — ou arrastar o cartão para a próxima etapa.
4. **Reuniões**: antes, gerar o roteiro ("Criar roteiro para reunião com o cliente X"); durante, marcar as
   perguntas na ficha; ao final, **"Finalizar: ata + tarefa de retorno"** e enviar o WhatsApp de follow-up.
5. **Cotações**: novos dados entram pelo CRM ("Cotação em andamento"); grandes contas seguem o módulo Cotações +99,
   cujo painel de pendências de dados indica o que falta antes de enviar às operadoras.
6. **Mensagens e respostas**: preencher as variáveis e copiar; responder dúvidas com as respostas rápidas.
7. **Tarefas**: Kanban para ver o que está em andamento; concluir registrando a próxima ação.
8. **Fim do dia/semana**: Relatórios → aba Comercial (vendas, conversão, clientes sem follow-up); exportar CSV ou
   PDF para a reunião de equipe; "Resumo semanal" no assistente; acompanhar a campanha do mês.

## 5. Checklist de funcionalidades

| # | Requisito do prompt | Status | Onde |
|---|---|---|---|
| 1 | Dashboard: compromissos, tarefas, cotações, reuniões, follow-ups atrasados, vendas, campanhas, alertas e os 9 indicadores | ✅ | `/` · `services/commercial.ts` |
| 2 | Agenda com todos os campos, 8 tipos pedidos, status, lembrete; visão dia/semana/mês | ✅ | `/agenda` |
| 3 | Tarefas com campos, prioridades (urgente), status (atrasada = derivado), categorias; lista + Kanban | ✅ | `/tarefas`, `/tarefas?modo=kanban` |
| 4 | CRM com 11 etapas, todos os campos, editar/excluir/mover/voltar/observações | ✅ | `/crm`, `/crm/[id]` |
| 5 | Cotações com todos os campos, documentos, status e pendências automáticas antes do envio | ✅ | `/cotacoes/[id]` (checklist + pendências de dados) |
| 6 | Reunião com roteiro de 17 perguntas marcáveis e geração de ata, pendências, próximos passos, WhatsApp e tarefa | ✅ | `/reunioes` |
| 7 | Campanhas com campos, status e lembretes (início, meio, últimos dias, leads, follow-ups, resultado) | ✅ | `/campanhas` · rotina |
| 8 | Mensagens prontas em 11 categorias, variáveis, copiar/editar/duplicar | ✅ | `/mensagens` |
| 9 | Respostas rápidas em 16 temas, editáveis, copiar, ressalva de variação | ✅ | `/respostas` |
| 10 | Assistente: mensagens, e-mails, resumos, próximos passos, pendências, follow-ups, campanhas, roteiro, checklist, relatórios, resumo diário/semanal | ✅ | `/assistente` |
| 11 | Relatórios pedidos + CSV e PDF | ✅ | `/relatorios`, `/api/export/[dataset]` |
| 12 | Hierarquia: Administrador, Head/Gerente, Supervisor, Corretor, Assistente | ✅ | `permissions.ts`, `scope.ts`, `access.ts` |
| 13 | LGPD: acesso por usuário, auditoria, proteção de dados, minimização, anonimização, avisos, backup | ✅ | Configurações → LGPD e backup |
| 14 | Visual: dashboard, menu lateral, cards, tabelas, Kanban, calendário, responsivo | ✅ | — |
| — | Dados de exemplo para testar | ✅ | `npm run db:seed-dev` (somente desenvolvimento) |
| — | Integração WhatsApp/Google Calendar/e-mail | ⏭️ | Preparado (links "Abrir no WhatsApp", campos de integração); envio automático não faz parte desta versão |

### Limitações conhecidas

- Lembretes no sino dependem da rotina (`POST /api/cron/sweep`, de hora em hora por padrão); o aviso na tela é
  imediato para quem está com o sistema aberto. Para lembretes de 10–30 min por notificação, agende a rotina a
  cada 5–15 minutos.
- O backup JSON é lógico e parcial (sem dados de saúde/arquivos); o backup integral é o do PostgreSQL/Supabase.
  Não há importação de backup JSON pela interface (restauração é feita no banco).
- O valor de oportunidade é mensal estimado; não há cálculo de comissão por venda.
