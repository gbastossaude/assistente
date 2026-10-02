# Modelo de Dados

Fonte da verdade: `src/server/db/schema.ts` (Drizzle ORM). Migrations versionadas em `drizzle/` (geradas por
`npm run db:generate`, aplicadas por `npm run db:migrate`). Banco: PostgreSQL 15+ (local ou Supabase).

Convenções:

- PK `uuid` (`gen_random_uuid()`), `created_at`/`updated_at` (`timestamptz`) em toda entidade relevante.
- `created_by`/`updated_by` → `users.id` onde há autoria.
- **Soft delete** (`deleted_at`) em: companies, contacts, insurers, current_contracts, quotations,
  quotation_documents, proposals, tasks, calendar_events, renewals. Consultas padrão filtram `deleted_at IS NULL`.
- Datas de calendário como `date` (sem fuso); instantes como `timestamptz`. Fuso de negócio: America/Sao_Paulo.
- Valores monetários `numeric(14,2)`; percentuais `numeric(7,3)`.
- Enums PostgreSQL derivados de `src/lib/domain/constants.ts` (fonte única para banco, validação e UI).

## Diagrama (resumo)

```
users ─┬─< companies ─┬─< company_cnpjs
       │              ├─< contacts
       │              ├─< current_contracts ─< current_contract_plans
       │              ├─< renewals
       │              └─< quotations ─┬─< quotation_cnpjs
       │                              ├─< quotation_status_history
       │                              ├─< quotation_checklist_items  (gerados de checklist_templates)
       │                              ├─< quotation_documents
       │                              ├─< life_imports ─< lives
       │                              ├─< special_cases (1 por tipo)  ─ special_case_entries
       │                              │       └ views: home_care_cases, injunction_cases, dismissed_retired_cases
       │                              ├─< quotation_insurers ─┬─< insurer_followups
       │                              │        (insurers)     └─< proposals ─< proposal_plans
       │                              ├─< pendencies
       │                              └─< interactions (timeline única empresa/cotação)
       ├─< tasks, calendar_events, notifications, assistant_messages, assistant_actions
       ├─< activity_logs (auditoria)
       ├── users.supervisor_id → users (equipe do Supervisor)
       ├─< opportunities (CRM; broker_id = corretor) ─┬─< opportunity_stage_history
       │        │ (company_id, quotation_id,          ├─< interactions (opportunity_id)
       │        │  campaign_id opcionais)             ├─< meetings ── calendar_events
       │        └──────────────── campaigns ──────────└─< tasks (opportunity_id / meeting_id / campaign_id)
       └─< library_items (mensagens prontas e respostas rápidas)
settings, message_templates, automation_rules, checklist_templates (configuração)
```

## Entidades

| Tabela | Finalidade | Campos-chave |
|---|---|---|
| `users` | Usuários e papel (RBAC) | email único, `password_hash` (bcrypt), `role` (admin, head, supervisor, analista, comercial, corretor, assistente, leitura), `supervisor_id` (equipe), `active` |
| `settings` | Parâmetros configuráveis | `key` → `value jsonb` (faixas ANS, limite coparticipação, pesos do score, retenção) |
| `companies` | Clientes/prospects | razão social, fantasia, CNPJ principal, grupo econômico, segmento, vidas estimadas, endereço, cidade/UF, executivo responsável, origem |
| `company_cnpjs` | CNPJs participantes | único por empresa; CNPJ canônico de 14 caracteres (aceita alfanumérico) |
| `contacts` | Contatos | nome, cargo, e-mail, telefone, WhatsApp, principal |
| `insurers` | Operadoras/seguradoras | nome único, tipo, código ANS, contato, prazo padrão de follow-up |
| `current_contracts` | Contratos atuais (N por empresa) | operadora, vigência, aniversário, tipo/modalidade, pagamento, remissão, reajuste, break-even, comissão, sinistralidade |
| `current_contract_plans` | Planos do contrato | plano, vidas, custo mensal, custo por vida, reembolso de consulta |
| `quotations` | Cotação/processo | código `COT-AAAA-NNNN`, NEW/RENEW, estipulante, vidas, motivo, datas (abertura, alvo, renovação), prioridade, status, campos das etapas 2 e 3 do wizard, override de prontidão; perfil do plano desejado: acomodação, abrangência, titulares, dependentes, data desejada para início, prazo do cliente |
| `quotation_cnpjs` | CNPJs cotados | único por cotação |
| `quotation_status_history` | Histórico de status | de/para, nota, usuário, data/hora |
| `checklist_templates` | Modelos NEW/RENEW | item, obrigatório, condição, `auto_source`, tipo de documento, texto do pedido ao cliente, ordem |
| `quotation_checklist_items` | Checklist da cotação | cópia do modelo + `applicable`, `status`, `auto_filled`, solicitante, remetente, datas, documento |
| `quotation_documents` | Documentos | tipo, nome original, `storage_key` privado, mime, tamanho, sha256, data de referência, remetente, status, `sensitive` |
| `life_imports` | Importações de base | arquivo/aba, mapeamento usado, totais (válidas/erro/aviso/ignoradas), resumo `jsonb`, `active` (a mais recente é a vigente) |
| `lives` | Vidas importadas | 13 campos normalizados + `sex` (M/F, opcional) + `issues jsonb` (erros/avisos por campo) |
| `special_cases` | Resumo por tipo de situação especial | `has` (null = não declarado), quantidade, `details jsonb` |
| `special_case_entries` | Registros individuais | `kind`, `data jsonb` validado pela definição em `special-cases.ts` |
| `quotation_insurers` | Distribuição por operadora | status individual, envio, protocolo, contato, retorno previsto, pendências, último/próximo follow-up, arquivos enviados, comissão, taxa adm., condições |
| `insurer_followups` | Follow-ups realizados | data, canal, nota, próximo follow-up |
| `proposals` | Propostas | versão, recebimento, validade, comissão, taxa adm., condições, documento, destaque para apresentação |
| `proposal_plans` | Linhas da proposta | produto, rede, abrangência, acomodação, coparticipação, reembolso, valor mensal, custo atual, carências |
| `interactions` | Timeline CRM | tipo, data/hora, usuário, descrição, próxima ação e data; vínculo com empresa, cotação e/ou oportunidade |
| `tasks` | Tarefas | vínculos (empresa, cotação, operadora, renovação, oportunidade, reunião, campanha), prioridade, data/hora, prazo, status, categoria, checklist interno, recorrência, lembrete, origem, `automation_key` (idempotência) |
| `calendar_events` | Agenda | tipo (14, incl. ligação, envio de cotação, retorno de operadora, pós-venda, campanha), status (agendado/realizado/remarcado/cancelado), início/fim, cliente, assessor, comercial, lembrete (minutos antes) e `reminder_sent_at`, vínculos (empresa, cotação, operadora, tarefa, oportunidade), `external_provider/id` (Google Calendar futuro) |
| `renewals` | Renovações | empresa, contrato, operadora, vidas, aniversário, início recomendado, reajuste, sinistralidade, status |
| `pendencies` | Central de pendências | categoria, origem (`manual`/`checklist`/`documento`/`especial`/`operadora`/`automacao`), `source_key` (idempotência das automáticas), prazo, prioridade, status, próxima ação |
| `notifications` | Alertas por usuário | `dedupe_key` evita duplicidade |
| `activity_logs` | Auditoria | ação, entidade, resumo, `changes jsonb` (sem dados de saúde), `sensitive` |
| `message_templates` | Templates de mensagens | público, canal, tom, assunto, corpo com placeholders |
| `automation_rules` | Regras de automação | `enabled`, `params jsonb` (prazos em dias) |
| `playbook_entries` | Playbook Estratégico (conteúdo editável) | `section` + `key` únicos, título, subtítulo, objetivo, `kind` (`texto`/`roteiro`), corpo, ordem, `active`, `updated_by`. Semeado pelo bootstrap a partir de `src/lib/playbook/content.ts` sem sobrescrever edições |
| `assistant_messages` / `assistant_actions` | Histórico do assistente | mensagens; ações propostas (`create_tasks`, `create_campaign`) → confirmadas/recusadas com resultado |
| `opportunities` | CRM — oportunidade de venda | cliente/empresa, CPF/CNPJ, contato/telefone/e-mail, produto (saúde, dental, vida, seguro, consórcio, benefícios), vidas, valor estimado (R$/mês), operadora atual, operadoras cotadas, corretor (`broker_id`, base do escopo), assessor, comercial, origem do lead, campanha, etapa (11), próximo passo e data do follow-up, motivo da perda, cotação +99 vinculada, `closed_at`, `anonymized_at`, soft delete |
| `opportunity_stage_history` | Histórico de etapas | de/para (inclui retornos), nota, usuário, data |
| `meetings` | Ficha de reunião com um cliente | cliente, empresa, assessor, comercial, responsável, data/início/fim, participantes, local/link, objetivo, resumo, status, `questions jsonb` (pergunta, feita, resposta recebida/pendente, resposta, observação), `actions jsonb` (ação, responsável, prazo, concluída), ata e WhatsApp gerados, compromisso da agenda e tarefa de retorno vinculados |
| `campaigns` | Campanhas do mês | nome, produto, período, público-alvo, meta (texto, leads, vendas, valor), mensagem principal, canais, responsável(is), status (planejada/ativa/pausada/finalizada), lembretes automáticos, resultados |
| `library_items` | Biblioteca | `kind` (`mensagem`/`resposta`), categoria/tema, título, canal, assunto, corpo com variáveis `{{…}}`, ordem, `active`, `source_key` (itens padrão do bootstrap — permite “Restaurar original”) |

### Views

`home_care_cases`, `injunction_cases` e `dismissed_retired_cases` são VIEWs SQL (migration `0001_views.sql`) sobre
`special_case_entries`. Decisão: um único motor genérico e tipado de situações especiais (definições em
`src/lib/domain/special-cases.ts`), mantendo as entidades pedidas consultáveis diretamente em SQL. Para evoluir
para tabelas físicas, basta materializar a view e migrar os dados.

## Dados sensíveis (LGPD)

- `lives.cid`, `special_case_entries` com campos marcados `sensitive`, e documentos com `sensitive = true`
  (tipos em `SENSITIVE_DOCUMENT_TYPES`) só são exibidos a papéis com a permissão `sensitive:read`.
- Downloads de documentos sensíveis geram registro em `activity_logs` com `sensitive = true`.
- `activity_logs.changes` nunca recebe CID, relatório médico ou dado de beneficiário.
- Oportunidades, reuniões e contatos podem ser **anonimizados** (Configurações → LGPD e backup): nome, documento,
  contato, telefone, e-mail e textos livres são removidos; etapa, produto e valores permanecem para relatórios.
- O backup JSON (`/api/backup`) exclui base de vidas, situações especiais, arquivos, senhas e auditoria.
