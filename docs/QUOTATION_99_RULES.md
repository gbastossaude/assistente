# Regras do fluxo Grandes Contas +99 vidas

Implementação: `src/lib/domain/*` (regras puras, testadas em `tests/unit`) + `src/server/services/*` (persistência).

## 1. Classificação

- "Grande conta" = cotação com **≥ 100 vidas** estimadas (`LARGE_ACCOUNT_MIN_LIVES`).
- O wizard é o mesmo para qualquer porte; a visão "Grandes Contas +99" filtra por vidas ≥ 100.

## 2. Wizard (5 etapas)

| Etapa | Conteúdo | Persistência |
|---|---|---|
| 1. Identificação | Empresa, NEW/RENEW, estipulante, CNPJs, vidas, motivo, abertura, data-alvo, renovação, responsável, prioridade | Cria a cotação (código `COT-AAAA-NNNN`), CNPJs, histórico de status inicial, checklist |
| 2. Contrato atual | Contratos atuais da empresa (N operadoras, vigência, aniversário, planos, vidas, custo e reembolso por plano), modalidade, encampação, FGTS 100%, dependentes 100%, pagamento, remissão, reajuste, break-even, upgrade/downgrade, comissão, alteração de desenho | Atualiza cotação + `current_contracts` da empresa |
| 3. Contribuição e coparticipação | Contribuição funcionário/dependente (% 0–100 ou valor), coparticipação S/N, %, procedimentos, observações | Cotação |
| 4. Situações especiais | 9 tipos com Sim/Não, quantidade, resumo e registros detalhados | `special_cases` + `special_case_entries` |
| 5. Documentos | Upload drag-and-drop por tipo, com data de referência, remetente, status e observação | `quotation_documents` + storage privado |

Cada etapa salva independentemente (o wizard pode ser retomado — `wizard_step`). Após cada salvamento o motor de
checklist e as pendências são reavaliados.

### Validações de negócio

- Contribuição percentual entre 0 e 100.
- Coparticipação: percentual obrigatório quando "Há coparticipação = Sim" e **limitado ao máximo configurável**
  (`settings.copay_max_pct`, padrão 30%). Ao menos um procedimento quando há coparticipação.
- Compulsório: o estudo pode marcar "considera 100% do FGTS" e "100% dos dependentes legais".
- Opcional: "Haverá encampação/tombamento?" torna-se obrigatório (item `encampacao` do checklist aplicável).
- Alteração de desenho = Sim exige detalhamento.
- CNPJ: validado com dígito verificador (numérico e alfanumérico).
- Data-alvo não pode ser anterior à abertura.

## 3. Motor de checklist

1. Ao criar a cotação, os itens ativos do modelo (`checklist_templates`) do tipo NEW ou RENEW são copiados.
2. A cada alteração relevante (`syncChecklist`):
   - **Condição** (`condition`): `always`, `special:<tipo>` (aplica só se o tipo foi declarado "Sim"),
     `modality:opcional`. Item não aplicável → `dispensado` automático; volta a `pendente` se passar a se aplicar.
   - **Fonte automática** (`auto_source`): `field:*` (dados da cotação/contratos), `doc:<tipo>` (documento
     recebido → `recebido`; validado → `validado`; inválido/desatualizado não atende), `lives` (importação
     confirmada), `special:<tipo>` (tipo sem pendências), `entries:<tipo>:<campos>` (todos os registros com os
     campos), `special:declared` (todos os 9 tipos declarados).
   - Status definido manualmente nunca é sobrescrito. Preenchimento automático que deixa de ser atendido volta a
     `pendente`.
3. Itens incluídos a partir do Playbook PJ +99 (Be Smart): **Carta de nomeação** e **Contrato social / cartão CNPJ**
   (obrigatórios em NEW, opcionais em RENEW), **Relatório analítico de utilização** (obrigatório em RENEW, opcional em
   NEW; documento sensível) e **Perfil de utilização** (opcional). "Maiores usuários" passou a "10 maiores
   utilizadores do plano"; sinistralidade = últimos 12 meses; base de vidas pede sexo, município/UF, afastados (CID),
   aposentados e gestantes. A obrigatoriedade continua configurável em Configurações → Checklists.
4. Itens novos adicionados ao modelo **não** são injetados em cotações existentes automaticamente (ação explícita
   "Reaplicar modelo" na aba Checklist).

## 4. Completude e "Pronta para mercado"

- Completude = obrigatórios aplicáveis resolvidos ÷ obrigatórios aplicáveis. Resolvido = `recebido`,
  `em_validacao`, `validado` ou `dispensado`. Opcionais aparecem à parte.
- Faixas: 0–49 Incompleta · 50–79 Em preparação · 80–99 Quase pronta · 100 Pronta para envio ao mercado.
- Mudar para qualquer status de mercado (`pronta_para_mercado` … `finalista`) a partir da preparação exige 100%
  **ou** override com justificativa (≥ 15 caracteres), registrado na cotação (`ready_override_*`), no histórico de
  status e na auditoria.
- `fechada_perdida` exige motivo de perda.
- Voltar status é permitido; todo movimento grava `quotation_status_history` e a timeline.

## 5. Score de prontidão (indicador, não decisão)

| Componente | Peso padrão | Cálculo |
|---|---|---|
| Documentação obrigatória | 50 | obrigatórios aplicáveis resolvidos (exceto base de vidas e situações especiais) |
| Base de vidas válida | 25 | importação ativa × (1 − registros com erro ÷ total) |
| Dados comerciais | 15 | modalidade, pagamento, comissão, contribuição, coparticipação, motivo, data-alvo, FGTS, desenho |
| Casos especiais tratados | 10 | tipos declarados e sem pendência ÷ 9 |

Pesos configuráveis em Configurações.

## 6. Operadoras

- Status individual (10) independente do status geral da cotação.
- Registrar envio → status `enviada`, `sent_at`, próximo follow-up = envio + X dias (regra `followup_after_send`) e
  tarefa de follow-up idempotente (`automation_key = qi:<id>:followup:<data>`).
- Registrar follow-up → atualiza último/próximo follow-up e cria nova tarefa.
- Proposta recebida → status `cotacao_recebida`, cancela tarefas de cobrança abertas daquela operadora, resolve
  pendências "sem resposta".
- Declinada exige motivo.

## 7. Pendências

Geradas automaticamente (idempotentes por `source_key`) e resolvidas automaticamente quando a condição deixa de
existir:

| Origem | Exemplo | Categoria |
|---|---|---|
| Checklist obrigatório pendente | "Sinistralidade não enviada" | cliente / documento / base de vidas |
| Situação especial | "Home Care sem relatório médico", "Liminar sem documento" | documento / cliente |
| Documento inválido/desatualizado | "Fatura desatualizada" | documento |
| Base de vidas com erros | "Base de vidas incompleta: 12 registros com erro" | base de vidas |
| Operadora | "Operadora sem resposta", "Proposta vencendo" | operadora |
| Manual | qualquer | qualquer |

## 8. Automações (configuráveis em Configurações → Automações)

| Regra | Gatilho | Efeito |
|---|---|---|
| `checklist_on_create` | criar cotação | gera checklist NEW/RENEW |
| `renewal_milestones` | cadastrar/alterar renovação | tarefas 120/90/60/30 dias antes |
| `document_updates_checklist` | upload/mudança de status de documento | atualiza item correspondente |
| `invalid_document_pendency` | documento inválido/desatualizado | pendência com prazo X dias |
| `ready_suggests_sending` | status → pronta para mercado | notificação sugerindo envio |
| `followup_after_send` | envio à operadora | follow-up em X dias |
| `proposal_cancels_followup` | proposta recebida | cancela cobranças daquela operadora |
| `client_followup_cadence` | status → apresentação ao cliente | tarefas D1 check-in, D3 objeção silenciosa, D5 urgência, D7 despedida (dias configuráveis; modelos de WhatsApp "Cadência D0–D7"). Canceladas quando a cotação vai para negociação/finalista ou é encerrada |
| `proposal_expiring` | rotina diária | alerta + pendência X dias antes da validade |
| `stale_process` | rotina diária | alerta de cotação sem movimentação há X dias |
| `insurer_no_response` | rotina diária | pendência quando passa da data prevista |
| `overdue_tasks` | rotina diária | notificação ao responsável |
| `task_reminders` | rotina diária/horária | notificação no horário do lembrete |

A rotina diária roda via `POST /api/cron/sweep` (agendador externo) e também de forma preguiçosa no carregamento
do "Meu Dia" (no máximo 1×/hora).

## 9. Pedido de informações ao cliente (seção 34)

O gerador monta a lista **exclusivamente** a partir dos itens obrigatórios/aplicáveis ainda pendentes (usando o
`request_text` de cada item) e das pendências de situações especiais. Itens recebidos/validados/dispensados são
omitidos. Placeholders sem dado viram `[informar …]` — nada é inventado.
