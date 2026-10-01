# BeSmart Health Cockpit — Especificação de Produto

Documento consolidado a partir do `PROMPT MASTER — Assistente Operacional + Sistema para Head de Planos de Saúde`.
Nenhum requisito foi removido; quando um item foi entregue em versão mínima, isso está registrado em
`docs/IMPLEMENTATION_PLAN.md` (seção "Débitos técnicos explícitos").

## 1. Visão

Cockpit operacional + assistente de grandes contas para o **Head de Planos de Saúde da BeSmart**, com foco em
cotações empresariais acima de 99 vidas. O sistema deve responder, em poucos segundos:

- quais clientes precisam de atenção;
- quais documentos ainda faltam;
- quais cotações estão prontas para mercado;
- quais operadoras precisam de follow-up;
- quais propostas chegaram;
- quais renovações estão próximas;
- quais tarefas estão atrasadas;
- qual a próxima ação recomendada em cada processo.

Princípios: confiabilidade operacional, velocidade de uso, rastreabilidade e clareza. Nada de dado fictício fora do
seed de desenvolvimento; toda informação é persistida no PostgreSQL.

## 2. Personas e papéis

| Papel | Descrição | Acesso |
|---|---|---|
| Administrador | Mantém usuários e configurações | Total |
| Head | Dono do processo de Saúde Corporativa | Total, exceto gestão de usuários admin |
| Analista | Opera cotações, documentos e base de vidas | Operacional + dados sensíveis |
| Comercial | Relacionamento, empresas, tarefas e cotações | Operacional, **sem** dados sensíveis de saúde |
| Somente leitura | Consulta | Leitura, sem dados sensíveis |

Matriz detalhada em `src/lib/auth/permissions.ts` (RBAC granular por permissão, pronto para expansão).

## 3. Módulos (menu principal)

1. **Início — Meu Dia**: cards de prioridade (tarefas hoje/atrasadas, follow-ups do dia, pendência de cliente,
   aguardando operadora, propostas para analisar, renovações 30/60/90, grandes contas em andamento, cotações paradas
   há X dias, processos críticos), lista "Prioridades do Dia" ordenada por prazo × criticidade × impacto e timeline
   das últimas movimentações.
2. **Minha Central**: tudo que está sob minha responsabilidade (tarefas, cotações, pendências, notificações).
3. **Pendências**: central única agrupada por Cliente / Operadora / Documento / Base de vidas / Interna.
4. **Empresas**: cadastro de clientes/prospects, grupo econômico, múltiplos CNPJs, contatos, múltiplos contratos
   atuais (com planos, vidas, custos e reembolso por plano), timeline.
5. **Cotações**: pipeline Kanban + tabela com 20 status, histórico de status, wizard de abertura.
6. **Grandes Contas +99**: visão dedicada às cotações acima de 99 vidas com completude e prontidão.
7. **Operadoras**: cadastro de operadoras/seguradoras e desempenho (tempo médio de retorno).
8. **Comparativos**: propostas lado a lado por cotação, destaque manual para apresentação, exportação Excel e
   impressão/PDF.
9. **Agenda**: dia/semana/mês, 9 tipos de compromisso, vínculo com empresa/cotação/operadora/tarefa.
10. **Tarefas**: completo, com recorrência, lembretes, checklist interno, anexos e "próxima ação" ao concluir.
11. **Documentos**: todos os documentos com status, tipo, referência, filtros e download controlado.
12. **Renovações**: janelas 30/60/90/120 dias, marcos automáticos configuráveis.
13. **Relatórios**: indicadores com filtros por período, empresa, operadora e status.
14. **Assistente IA**: chat ligado aos dados por ferramentas controladas, com confirmação para ações.
15. **Configurações**: usuários, modelos de checklist, prazos de automação, faixas ANS, pesos do score,
    limite de coparticipação, templates de mensagens, política de retenção e auditoria.

Busca global no cabeçalho (empresa, CNPJ, contato, cotação, operadora, protocolo, plano, documento, tarefa) e atalhos
"Nova Cotação", "Nova Tarefa", "Nova Empresa" e "Importar Base de Vidas".

## 4. Fluxo Grandes Contas +99 (resumo — detalhes em `QUOTATION_99_RULES.md`)

Wizard em 5 etapas: Identificação → Contrato atual → Contribuição e coparticipação → Situações especiais →
Documentos. Ao criar a cotação, o **motor de checklist** gera os itens do modelo NEW ou RENEW, avalia condições
(ex.: "Relatório médico dos afastados" só se aplica quando há afastados) e preenche automaticamente itens já
atendidos por dados do sistema. A completude considera os itens obrigatórios; "Pronta para mercado" fica bloqueada
enquanto houver obrigatório pendente, salvo override com justificativa registrada em auditoria.

## 5. Central da Cotação

Uma tela com cabeçalho fixo (empresa, vidas, NEW/RENEW, status, completude, renovação, próximo prazo, responsável,
pendências críticas) e 12 abas: Visão Geral, Checklist, Dados da Empresa, Base de Vidas, Situações Especiais,
Documentos, Operadoras, Propostas, Comparativo, Tarefas, Interações, Timeline.

## 6. Base de vidas (detalhes em `IMPORT_LIVES_SPEC.md`)

Importador XLSX/XLSM com drag-and-drop, reconhecimento da aba `BASE SAÚDE`, mapeamento automático e manual das 13
colunas, validação linha a linha, preview com erros antes de confirmar, cálculo de idade e faixa etária ANS e
resumo da população (por faixa, plano, CNPJ, UF, cidade, titularidade, situações especiais, CID, incompletos).
O arquivo original é armazenado sem alteração.

## 7. Operadoras, propostas e comparativo

Cada cotação é distribuída para N operadoras, cada uma com status próprio (10 status), protocolo, prazos,
follow-ups, pendências, comissão, taxa administrativa e proposta(s). O status geral da cotação nunca sobrescreve o
status individual. Comparativo lado a lado com variação versus custo atual; o sistema **não** elege "a melhor"
proposta — o usuário destaca a escolhida para apresentação.

## 8. Produtividade

Tarefas (5 status, 4 prioridades, recorrência, lembretes), agenda, pendências, renovações e notificações.
Motor de automações com regras configuráveis (ver `QUOTATION_99_RULES.md` §8).

## 9. Assistente inteligente

- Responde usando apenas dados do sistema (ferramentas de consulta tipadas).
- Gera e-mails e mensagens de WhatsApp a partir das pendências reais.
- Ações em lote (ex.: criar tarefas para operadoras sem resposta) são **propostas**, listando exatamente os registros
  afetados, e só executadas após confirmação explícita.
- Nunca envia e-mail/WhatsApp externamente: gera o texto para o usuário copiar/enviar.
- Histórico de conversas e ações persistido.
- Funciona em dois modos: com `ANTHROPIC_API_KEY` (Claude com tool use) ou sem chave (roteador de intenções
  determinístico em português, cobrindo as perguntas da especificação).

## 10. Segurança e LGPD

Autenticação obrigatória, RBAC, storage privado, URLs temporárias assinadas, log de acesso a documentos sensíveis,
log de alterações, CID e relatórios médicos ocultos de quem não tem permissão e fora dos dashboards, nenhum dado
pessoal em logs técnicos, retenção configurável, validação de upload (tipo/tamanho), sanitização de nomes,
proteções contra SQL injection (ORM parametrizado), XSS (React escapa saída; sem `dangerouslySetInnerHTML`) e CSRF
(Server Actions com verificação de origem + checagem de `Origin` nas rotas `POST` + cookie `SameSite=Lax`).

## 11. Critérios de aceite da primeira versão utilizável

1. Cadastrar empresa. 2. Criar cotação +99. 3. Escolher NEW/RENEW. 4. Ver checklist automático. 5. Anexar
documentos. 6. Importar planilha de vidas. 7. Ver erros antes de importar. 8. Ver total de vidas e distribuição.
9. Visualizar pendências. 10. Marcar "pronta para mercado" só com obrigatórios resolvidos. 11. Selecionar
operadoras. 12. Controlar envio/retorno por operadora. 13. Criar tarefas e follow-ups. 14. Ver tudo no "Meu Dia".
15. Pesquisar empresa/cotação rapidamente.
