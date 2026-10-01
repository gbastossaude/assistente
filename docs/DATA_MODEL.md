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
       └─< activity_logs (auditoria)
settings, message_templates, automation_rules, checklist_templates (configuração)
```

## Entidades

| Tabela | Finalidade | Campos-chave |
|---|---|---|
| `users` | Usuários e papel (RBAC) | email único, `password_hash` (bcrypt), `role`, `active` |
| `settings` | Parâmetros configuráveis | `key` → `value jsonb` (faixas ANS, limite coparticipação, pesos do score, retenção) |
| `companies` | Clientes/prospects | razão social, fantasia, CNPJ principal, grupo econômico, segmento, vidas estimadas, cidade/UF, executivo responsável, origem |
| `company_cnpjs` | CNPJs participantes | único por empresa; CNPJ canônico de 14 caracteres (aceita alfanumérico) |
| `contacts` | Contatos | nome, cargo, e-mail, telefone, WhatsApp, principal |
| `insurers` | Operadoras/seguradoras | nome único, tipo, código ANS, contato, prazo padrão de follow-up |
| `current_contracts` | Contratos atuais (N por empresa) | operadora, vigência, aniversário, tipo/modalidade, pagamento, remissão, reajuste, break-even, comissão, sinistralidade |
| `current_contract_plans` | Planos do contrato | plano, vidas, custo mensal, custo por vida, reembolso de consulta |
| `quotations` | Cotação/processo | código `COT-AAAA-NNNN`, NEW/RENEW, estipulante, vidas, motivo, datas (abertura, alvo, renovação), prioridade, status, campos das etapas 2 e 3 do wizard, override de prontidão |
| `quotation_cnpjs` | CNPJs cotados | único por cotação |
| `quotation_status_history` | Histórico de status | de/para, nota, usuário, data/hora |
| `checklist_templates` | Modelos NEW/RENEW | item, obrigatório, condição, `auto_source`, tipo de documento, texto do pedido ao cliente, ordem |
| `quotation_checklist_items` | Checklist da cotação | cópia do modelo + `applicable`, `status`, `auto_filled`, solicitante, remetente, datas, documento |
| `quotation_documents` | Documentos | tipo, nome original, `storage_key` privado, mime, tamanho, sha256, data de referência, remetente, status, `sensitive` |
| `life_imports` | Importações de base | arquivo/aba, mapeamento usado, totais (válidas/erro/aviso/ignoradas), resumo `jsonb`, `active` (a mais recente é a vigente) |
| `lives` | Vidas importadas | 13 campos normalizados + `issues jsonb` (erros/avisos por campo) |
| `special_cases` | Resumo por tipo de situação especial | `has` (null = não declarado), quantidade, `details jsonb` |
| `special_case_entries` | Registros individuais | `kind`, `data jsonb` validado pela definição em `special-cases.ts` |
| `quotation_insurers` | Distribuição por operadora | status individual, envio, protocolo, contato, retorno previsto, pendências, último/próximo follow-up, arquivos enviados, comissão, taxa adm., condições |
| `insurer_followups` | Follow-ups realizados | data, canal, nota, próximo follow-up |
| `proposals` | Propostas | versão, recebimento, validade, comissão, taxa adm., condições, documento, destaque para apresentação |
| `proposal_plans` | Linhas da proposta | produto, rede, abrangência, acomodação, coparticipação, reembolso, valor mensal, custo atual, carências |
| `interactions` | Timeline CRM | tipo, data/hora, usuário, descrição, próxima ação e data |
| `tasks` | Tarefas | vínculos (empresa, cotação, operadora, renovação), prioridade, data/hora, prazo, status, categoria, checklist interno, recorrência, lembrete, origem, `automation_key` (idempotência) |
| `calendar_events` | Agenda | tipo, início/fim, vínculos, `external_provider/id` (Google Calendar futuro) |
| `renewals` | Renovações | empresa, contrato, operadora, vidas, aniversário, início recomendado, reajuste, sinistralidade, status |
| `pendencies` | Central de pendências | categoria, origem (`manual`/`checklist`/`documento`/`especial`/`operadora`/`automacao`), `source_key` (idempotência das automáticas), prazo, prioridade, status, próxima ação |
| `notifications` | Alertas por usuário | `dedupe_key` evita duplicidade |
| `activity_logs` | Auditoria | ação, entidade, resumo, `changes jsonb` (sem dados de saúde), `sensitive` |
| `message_templates` | Templates de mensagens | público, canal, tom, assunto, corpo com placeholders |
| `automation_rules` | Regras de automação | `enabled`, `params jsonb` (prazos em dias) |
| `assistant_messages` / `assistant_actions` | Histórico do assistente | mensagens; ações propostas → confirmadas/recusadas com resultado |

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
