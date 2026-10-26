# Monitor de SLA – Bitrix24 (extensão para Google Chrome)

Extensão **somente leitura** que consulta os cards do Bitrix24 (negócios, leads e processos inteligentes) e mostra, em português, **quais cards estão atrasados, qual prazo foi ultrapassado, quem é o responsável e o que precisa de atenção primeiro**.

**Escopo configurado:** somente os **cards abertos** da página **be.smart Saúde** (`https://crm.hub-bnk.com/page/besmart/besmart_saude/`), acompanhando cada etapa. **Leads nunca são monitorados**, e negócios e outros processos ficam de fora. Enquanto o processo dessa página não for identificado, nada é monitorado: a extensão não cai em outra lista por engano.

**Como funciona no dia a dia:** você entra no Bitrix (`https://crm.hub-bnk.com`) normalmente, com o seu login. A extensão mostra uma aba **SLA** na lateral da página, com o número de cards que precisam de atenção. Ao clicar, abre a análise numa gaveta dentro do próprio Bitrix. A análise é atualizada sozinha quando você entra no portal e a cada 15 minutos enquanto ele estiver aberto. Não é preciso criar webhook.

## Novidades da versão 1.7.0

- **Estudo dos cards concluídos e cancelados.** Nova aba **Concluídos e cancelados**, atualizada a cada sincronização, com os cards que foram para uma etapa final de **sucesso** (concluídos) ou de **falha** (cancelados/perdidos) nos funis monitorados:
  - concluídos e cancelados com valores, **taxa de conclusão**, tempo médio e mediano da criação ao encerramento;
  - **onde os cards foram cancelados** (etapa em que estavam antes do cancelamento, pelo histórico de etapas do Bitrix);
  - **motivos** (campo "Motivo…" do card, detectado sozinho ou escolhido; sem motivo, o nome da etapa final);
  - resultados **por comercial, por assessor e por funil**, evolução dos últimos 6 meses e resumo com os fatos calculados;
  - lista dos encerrados com filtros, ordem pelo encerramento ou pela criação (botão "inverter") e exportação CSV;
  - períodos: últimos 30, 90 ou 180 dias, este mês e mês anterior. O Painel mostra o resumo dos últimos 30 dias.
- Configuração em **Configurações › Concluídos e cancelados** (ativar, janela de leitura — padrão 180 dias — e campo de motivo). O pós-venda continua excluído.

## Novidades da versão 1.6.0

- **Pós-venda fora.** Funis e processos com "pós-venda" no nome (em qualquer grafia: "Pós venda", "POS-VENDA"…) não são monitorados nem aparecem na fila, nas etapas, nos alertas ou no ranking de reuniões. Os termos ficam em **Configurações › Funis e etapas › Funis excluídos**.
- **Sem expediente.** A aba "Expediente e feriados" e o aviso para confirmá-lo foram removidos. Todos os prazos e tempos são contados em **tempo corrido** (24 h por dia, todos os dias); regras antigas em "horário comercial" passam a valer em tempo corrido.
- **Cards em ordem de criação.** Fila, etapas e central de alertas mostram os cards do **mais antigo para o mais recente**; o botão **"inverter"** passa a mostrar os **mais recentes primeiro** (a escolha é lembrada).
- **Comercial pelo e-mail do especialista.** O e-mail do campo "E-mail do especialista" vira nome e sobrenome na coluna **Comercial** (ex.: `yago.barbosa@besmart.com.br` → **Yago Barbosa**), com o e-mail logo abaixo. Card sem esse e-mail usa quem abriu o card. Vale também para os filtros, a distribuição "Por comercial" e o ranking de reuniões. O campo é encontrado sozinho (nome com "especialista") e pode ser escolhido em **Configurações › Funis e etapas › Comercial do card**.
- **Assessor.** A pessoa responsável pelo card passou a se chamar **Assessor** em todas as telas (colunas, filtros, distribuição "Por assessor", popup e notificações).

## Novidades da versão 1.5.0

- **Mais rápida.** A análise de 1.500 cards caiu de cerca de **50 s para 0,15 s** (o cálculo de horário comercial deixou de recalcular o fuso a cada dia). A sincronização incremental (a cada 15 min) caiu de 2,8 s para 1,0 s e a completa de 8,8 s para 4,3 s com a mesma carga, aproveitando a rajada que o limite do Bitrix24 permite e lendo histórico, atividades e comentários em paralelo. A busca do painel atualiza só a fila e a fila mostra 150 cards por vez ("Mostrar mais"). Medições em `docs/evidencias/desempenho.txt`.
- **Comercial = quem abriu o card.** O comercial passou a ser, por padrão, a pessoa que criou o card no Bitrix (campo nativo *Criado por*), em **coluna própria**, separada do **Responsável** atual — na fila, nas Etapas, na central de alertas, no detalhe, no popup e nas notificações.
- **Data de criação e idade.** Cada card mostra "Criado em dd/mm/aaaa · há N dias" (dias de calendário no fuso configurado). A fila pode ser ordenada pelos criados há mais tempo ou mais recentemente.
- **Valores nas etapas.** O fluxo do funil mostra o valor em aberto de cada etapa; cada etapa mostra a soma dos seus cards e a tabela traz o valor de cada card. As distribuições em Análises ganharam a coluna "Valor em aberto". Moedas diferentes nunca são somadas entre si.
- **Ranking automático de reuniões.** Nova aba **Ranking de reuniões**, recalculada a cada sincronização: reuniões realizadas, agendadas e pendentes por comercial (ou por responsável pela reunião, ou responsável do card), em hoje, esta semana, este mês, mês anterior ou últimos 30 dias, inclusive de cards já ganhos/perdidos. Resumo do mês no Painel e exportação CSV.
- **Armazenamento sem limite de 10 MB** (permissão `unlimitedStorage`, sem aviso extra na instalação): evita falhas ao salvar em portais com muitos cards.

> **Status da validação.** Toda a lógica foi testada com casos de cálculo e com um portal Bitrix24 **simulado** (mesmo formato de resposta da API oficial), carregando a extensão no Chromium tanto no modo "login do Bitrix" quanto por webhook. **A integração com o seu portal real ainda não foi validada.** Em particular, é preciso confirmar que o `crm.hub-bnk.com` aceita consultas pelo login do navegador; se não aceitar, a extensão avisa e o webhook resolve. Veja [Primeiro teste no seu portal](#primeiro-teste-no-seu-portal).

---

## 1. Instalação no Chrome

1. Descompacte `monitor-sla-bitrix24-v1.7.0.zip` numa pasta permanente (ex.: `Documentos/monitor-sla-bitrix24`). Não apague a pasta depois.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e escolha a pasta descompactada (a que contém `manifest.json`).
5. O Chrome informa que a extensão pode "ler e alterar dados em crm.hub-bnk.com". Esse é o aviso padrão para qualquer extensão que funcione dentro de um site. A extensão só lê, e qualquer comando de alteração é bloqueado no código.
6. Fixe o ícone (alfinete no menu de extensões). Clique no ícone → **Abrir painel completo**, ou use o botão direito → **Opções**.

**Atualizar de uma versão anterior (1.4 a 1.6):** descompacte o novo ZIP **na mesma pasta**, substituindo os arquivos, e clique no botão de atualizar (↻) da extensão em `chrome://extensions`. Configurações, regras e a conexão são mantidas. Depois da atualização, recarregue a aba do Bitrix (F5) para a gaveta nova aparecer. A primeira sincronização após atualizar é completa (lê o "Criado por", o e-mail do especialista e as reuniões) e pode levar alguns segundos a mais.

Requisitos: Chrome 116 ou superior (também funciona no Edge e Brave baseados em Chromium).

Para conhecer a ferramenta antes de conectar, clique em **Abrir demonstração com dados fictícios**. A demonstração usa um portal simulado embutido, com selo azul “DEMONSTRAÇÃO · DADOS FICTÍCIOS”, e fica separada da conexão real (configuração e dados próprios; “Sair da demonstração” apaga tudo dela).

## 2. Conectar ao Bitrix24

### 2.0 Jeito recomendado: entrar no Bitrix e analisar (sem webhook)
1. Entre em `https://crm.hub-bnk.com/page/besmart/besmart_saude/` com o seu login e espere as oportunidades carregarem.
2. A extensão identifica sozinha o processo dessa página. Ela usa os links dos cards (`…/type/NÚMERO/details/…`, no formato da página ou no formato `/crm/type/…`), a lista ou kanban, mesmo quando carregados em quadros internos, ou o card aberto. Só lê endereços e identificadores técnicos, nunca o conteúdo dos cards.
3. Clique na aba **SLA** na lateral direita e depois em **Analisar com meu login do Bitrix**.
4. A extensão passa a monitorar **somente** esse processo, com todos os funis dele, e abre **Regras de SLA**.
5. Defina os prazos (seção 3) e salve. A análise roda na hora, e o botão "Abrir no Bitrix" leva ao card dentro de be.smart Saúde.

Para mudar ou remover o foco: **Configurações › Funis e etapas › Escopo**. Lá você pode desmarcar funis do processo, trocar a página ou clicar **Remover foco** para escolher outros funis livremente. Se a página não mostrar nenhum card, ou se o Bitrix carregar a lista sem links, abra qualquer oportunidade dela: o endereço do card também serve para identificar o processo.

A extensão vê **exatamente o que o seu usuário vê** no Bitrix. Ela atualiza enquanto houver uma aba do portal aberta e logada. Com o Bitrix fechado, o painel mostra a última análise e avisa "O Bitrix24 está fechado"; quando você sai do portal, avisa "Você não está logado". Se o portal recusar esse tipo de consulta (erro `WRONG_AUTH_TYPE`), a extensão avisa e você usa o webhook (2.1 e 2.2). O webhook também serve se você quiser que a análise rode sem o Bitrix aberto.


**Seu portal:** `https://crm.hub-bnk.com` (já vem preenchido na tela de conexão). Os cards de **be.smart › Seguros** (`/page/besmart/seguros/`) ficam num **espaço digital**, ou seja, são de um **processo inteligente**. Veja o passo 2.3.

### 2.1 Alternativa: criar o webhook de entrada
1. Em `https://crm.hub-bnk.com`: **Aplicativos › Recursos para desenvolvedores › Outros › Webhook de entrada** (versões antigas: *Aplicativos › Webhooks*). Se a opção não aparecer, um administrador precisa liberar em *Configurações › Segurança › Integrações › Quem pode criar webhooks de entrada*.
2. Permissões (escopos): **CRM (`crm`)** e **Usuários (`user`)**. Opcional: **Estrutura da empresa (`department`)**, para filtrar por departamento.
3. **Recomendado:** crie o webhook com um **usuário dedicado** cujo papel de acesso no CRM permita **apenas leitura** dos funis que você vai monitorar. O Bitrix24 concede permissões de webhook por escopo (CRM inteiro), não por leitura/escrita. A extensão bloqueia no código qualquer método que não seja de consulta, mas o usuário somente-leitura é a segunda barreira.
4. O usuário do webhook precisa enxergar os cards do espaço be.smart › Seguros (e dos funis de negócios que você quiser monitorar).
5. Se o Bitrix pedir **data de expiração** do webhook, anote: depois dela a extensão mostra erro de autenticação e é preciso gerar outro.
6. Copie a URL completa: `https://crm.hub-bnk.com/rest/ID_DO_USUARIO/CODIGO/`.

O REST/webhook só está disponível nos planos comerciais do Bitrix24 (em planos sem REST, a conexão retorna erro de autenticação/assinatura).

### 2.2 Conectar
1. Painel › **Configurações › Conexão**.
2. Confira o **Endereço do portal** (`https://crm.hub-bnk.com`; também aceita colar `…/page/besmart/seguros/`). Cole a URL do webhook, escolha o limite (Padrão = 2 req/s, seguro para qualquer portal; Enterprise ou servidor próprio = 5 req/s) e onde guardar a credencial. Um webhook de outro endereço é recusado antes de qualquer consulta.
3. Clique **Conectar e testar**. O Chrome pede permissão **apenas para o domínio do seu portal**. A extensão lê funis, etapas e processos inteligentes e abre a tela **Funis e etapas**.

### 2.3 Adicionar o processo be.smart › Seguros (espaço digital)
O Bitrix24 só entrega a lista de processos inteligentes (`crm.type.list`) a **administradores do CRM**. Com o usuário somente-leitura recomendado, o processo de Seguros não aparece sozinho. Para adicioná-lo:
1. No Bitrix, abra **qualquer card** de be.smart › Seguros.
2. Copie o endereço da barra do navegador, algo como `https://crm.hub-bnk.com/page/besmart/seguros/type/NÚMERO/details/123/`.
3. Em **Configurações › Funis e etapas › Processo de um espaço digital**, cole e clique **Adicionar processo**.

A extensão lê o número do processo, carrega funis e etapas e passa a usar esse mesmo formato no botão **Abrir no Bitrix**. Se o webhook for de um administrador do CRM, o processo já aparece listado (com o nome do espaço digital); mesmo assim vale colar um link para garantir o formato correto do link.

### 2.4 Guarda da credencial — limitações do navegador
- A URL do webhook dá acesso ao CRM e é tratada como senha.
- **Padrão (recomendado):** fica só na memória da sessão do Chrome (`chrome.storage.session`). Ao fechar o Chrome ela é apagada e o painel pede para informá-la de novo (o ícone mostra “!”).
- **“Lembrar neste dispositivo”:** grava a URL no perfil do Chrome (`chrome.storage.local`) **sem criptografia**. Qualquer pessoa ou programa com acesso ao seu perfil do Windows/macOS pode lê-la. Use só em computador pessoal protegido.
- Uma extensão não tem cofre de segredos. O OAuth do Bitrix24 exige guardar o segredo do aplicativo para renovar tokens, o que também não é seguro dentro de uma extensão sem um servidor intermediário. Para uso individual, webhook + usuário somente-leitura + sessão é o fluxo mais seguro viável.
- A URL nunca aparece em logs, mensagens de erro ou na exportação de configurações. Se vazar, **exclua o webhook no Bitrix24** e gere outro.
- **Desconectar** remove a credencial e a permissão do domínio. **Apagar tudo e desconectar** também remove dados e configurações.

## 3. Guia de configuração e mapeamento

Siga as abas de **Configurações** na ordem.

### 3.1 Funis e etapas — o que é um “card”
A extensão lista o que existe no seu portal (mais os processos adicionados pelo link de um card, passo 2.3): **Negócios** (por funil) e cada **processo inteligente** com etapas (leads não são listados). Com o foco em be.smart Saúde ativo, só o processo dessa página aparece; use **Remover foco** para escolher outros funis. As etapas aparecem com a semântica lida do Bitrix: as finais (*sucesso* / *falha*) encerram o card, que sai da fila de pendências.

Tarefas avulsas do módulo Tarefas não são cards nesta versão; tarefas vinculadas a um card entram como atividades dele.

**Mapeando as etapas da corretora.** Os nomes do enunciado (Em cotação, Aguardando retorno da operadora, Em digitação, Pendência de documentos, Enviado para assinatura, Aguardando assinatura, Em análise, Aguardando boleto, Aguardando implantação, Implantado) são exemplos. A extensão usa as etapas reais do portal, identificadas pelo código (`STATUS_ID`, ex.: `C3:PREPARATION`). Monte uma tabela simples antes de configurar:

| Etapa no seu Bitrix | Código | Dono | SLA da etapa | Horário comercial? | Pausa? | Limite parado |
|---|---|---|---|---|---|---|
| (preencher) | | Comercial/Operacional/Assessor | | | | |

### 3.2 Contagem de tempo
Todos os prazos, atrasos e tempos na etapa são contados em **tempo corrido** (24 h por dia, todos os dias, no fuso de Brasília). Não há expediente, dias úteis ou feriados a configurar.

### 3.3 Regras de SLA (nenhum prazo vem preenchido)
Para cada funil:
- **SLA da etapa:** prazo em minutos, horas ou dias; contagem em **tempo corrido**; **% para aviso antecipado**.
- **Retorno à etapa:** *reiniciar* (conta do zero a cada nova entrada), *acumular* (soma todas as passagens) ou *manter original* (desde a primeira entrada).
- **Pausa:** por valor de campo do card (ex.: “Aguardando cliente = Sim”). Nenhuma etapa é pausa automática: “aguardando documentos” só pausa se você criar a condição.
- **Exceções:** por campo ou tipo de atendimento — usar outro prazo (ex.: urgente = 4 h) ou não aplicar SLA.
- **Limite parado:** alerta de card sem mudança de etapa além do limite (por etapa ou padrão do funil), independente do SLA.
- **SLA total do processo:** prazo do funil inteiro, começando na criação, na entrada no funil ou numa etapa escolhida; etapas marcadas podem ser descontadas (pausa por etapa).

**De onde vem a data de entrada na etapa** (mostrado em cada card):
1. **Histórico de etapas do Bitrix** (`crm.stagehistory.list`) — preferido.
2. Sem histórico: o campo **`movedTime`** do card (data da última mudança de etapa). Pode ser desativado em *Acompanhamento e prazos*.
3. Sem nenhum dos dois: **início do acompanhamento pela extensão**, marcado como **cálculo parcial**.

A última alteração genérica do card (`updatedTime`) **nunca** é usada como entrada na etapa.

### 3.4 Acompanhamento e prazos
- **Sem atividade futura agendada:** ativado ao marcar o funil (regra objetiva, sem prazo). Atividade aberta **sem prazo** não conta como agendamento. É possível excluir etapas (ex.: aguardando implantação).
- **Sem interação relevante há mais de X:** você define o limite por funil.
- **O que conta como interação comercial:** tabela com os tipos de atividade encontrados no portal (ligação, e-mail, reunião, canal aberto/WhatsApp, atividade “A fazer”, tarefa…). Fluxos automáticos, notificações e formulários não contam por padrão. Marque também os **usuários de automação** (robôs, integrações): o que eles criam não conta.
- O card mostra a **evidência usada** (ex.: “Ligação concluída em 22/10 14:05”) e o que foi **desconsiderado** (alteração genérica do card, `lastActivityTime`, automações).
- **Prazo definido no card:** escolha o campo de data que é o prazo (ex.: um campo personalizado “Prazo da proposta”). A extensão não presume que “Data prevista de fechamento” é prazo.

### 3.5 Prioridade
Pontuação **visível e configurável**: peso por tipo de alerta, pontos por dia de atraso, por % de estouro do SLA, peso por etapa, bônus para valores no topo X% dos cards monitorados, pontos por alertas simultâneos e faixas (crítica/alta/média/baixa). Cada card mostra a soma item a item (“Por que prioridade Crítica (135 pts)”).

### 3.6 Equipes, notificações e sincronização
- **Equipes:** departamentos do Bitrix (escopo `department`) e equipes manuais (ex.: Comercial, Operacional, Assessores).
- **Notificações do Chrome:** opcionais (a permissão só é pedida quando você ativa), com nível mínimo, aviso antecipado, horários e dias. Cada alerta notifica uma vez; fora do horário, os alertas acumulam e saem num resumo. Nada é enviado por e-mail, WhatsApp ou comentário no Bitrix.
- **Contador no ícone:** cards com atraso (padrão), prioridade alta+, só críticos ou todos.
- **Sincronização:** a cada 15 min (configurável), incremental; completa a cada 6 h para reconciliar exclusões.

## 4. Usando o painel
- **Assessor e comercial em colunas separadas:** o **Assessor** é o responsável atual do card no Bitrix; o **Comercial** vem do **e-mail do especialista** (convertido em nome e sobrenome) e, sem esse e-mail, de **quem abriu o card** (campo nativo "Criado por"). Os dois aparecem em colunas próprias na fila, nas Etapas e na central de alertas, além do detalhe, do popup e das notificações. Há filtro, ordenação e a distribuição "Por comercial". Se a operação usar outro campo de usuário para o comercial, escolha-o em **Configurações › Funis e etapas › Comercial do card** (ou desligue).
- **Criação do card:** "Criado em dd/mm/aaaa · há N dias" em cada card (fila, detalhe, Etapas e central de alertas). Ordem padrão por criação (mais antigos primeiro), com o botão "inverter" para os mais recentes primeiro; vale para a fila, as etapas e a central de alertas. (Antes: ordenação "criados há mais tempo" e "criados recentemente".
- **Ranking de reuniões:** aba própria, atualizada sozinha a cada sincronização. Mostra, por período (hoje, esta semana — segunda a domingo —, este mês, mês anterior, últimos 30 dias), as reuniões **realizadas** (concluídas), **agendadas** (ainda vão acontecer) e **pendentes** (passaram do horário sem ser concluídas), com posição (empates dividem a posição), cards envolvidos e exportação CSV. Agrupa por comercial (quem abriu o card), responsável pela reunião ou responsável do card. Conta como reunião: atividades do tipo **Reunião** (`CRM_MEETING`) e atividades **"A fazer"** com "reunião" no assunto — ajustável em **Configurações › Ranking de reuniões** (tipos, palavras, janela de leitura e se conta cards já ganhos/perdidos).
- **Etapas:** o fluxo do funil com a quantidade de cards e o **valor em aberto** de cada etapa (em vermelho as que têm SLA vencido) e o total do funil. Abaixo, cada etapa mostra a soma dos valores e lista seus cards abertos, do mais antigo para o mais recente, com responsável, comercial, data de criação e idade, valor, há quanto tempo está na etapa (corrido e em horário comercial, com a data de entrada), situação do SLA da etapa, próxima atividade e alertas. Mostra também a média atual de permanência e, quando há histórico suficiente, a média histórica.
- **Concluídos e cancelados:** estudo dos cards encerrados nos funis monitorados (ver Novidades da versão 1.7.0). Concluído = etapa final de sucesso; cancelado = etapa final de falha. A data do encerramento e a etapa anterior vêm do histórico de etapas do Bitrix; cards que se encerram entre as sincronizações completas entram pela consulta incremental, com a última etapa aberta vista pela extensão.
- **Painel:** indicadores (monitorados, com atraso, SLA vencido, próximos do vencimento, sem acompanhamento, valor em atraso sem duplicar cards), resumo operacional calculado, distribuição por responsável, funil, etapa e prioridade, e a **fila priorizada** com busca, filtros (responsável, equipe, funil, etapa, tipo de alerta, gravidade), ordenação e botão **Abrir no Bitrix**. Clique no card para ver cada alerta com prazo aplicado, atraso, vencimento, evidências e silenciamento (1 h a 3 dias).
- **Central de alertas:** novos, em atraso, próximos, acompanhamento, os que **venceram enquanto o Chrome estava fechado** e os silenciados.
- **Análises:** cobertura dos dados (o que foi lido, de onde veio cada data, falhas), tabelas por responsável/funil/etapa e métricas históricas **só quando há amostra suficiente** (tempo médio por etapa com pelo menos 5 passagens; evolução após 3 dias de sincronização).
- **“Nenhuma pendência encontrada” × “Não foi possível consultar”:** quando a consulta falha, o painel mostra o erro e deixa claro que os números exibidos são da última sincronização bem-sucedida.

## 5. Primeiro teste no seu portal
1. Conecte com o webhook (seção 2) e marque **um** funil.
2. Defina SLA em 2 ou 3 etapas.
3. Clique **Sincronizar** e abra **Análises › Cobertura dos dados**: confira a contagem de cards abertos, se o histórico de etapas veio como “ok” e quantos cards tiveram entrada na etapa por histórico, `movedTime` ou parcial.
4. Abra 3 cards da fila e compare com o Bitrix: etapa, assessor, comercial (e-mail do especialista), entrada na etapa e atividade vencida.
5. Em *Acompanhamento e prazos*, veja a coluna **Encontradas** dos tipos de atividade e ajuste o que conta como interação.

Se algo divergir, anote o card e a mensagem exibida.

## 6. O que é lido e armazenado
- **Lido do Bitrix (somente leitura):** `crm.settings.mode.get`, `crm.type.list`, `crm.category.list`, `crm.status.list`, `crm.item.fields`, `crm.item.list`, `crm.stagehistory.list`, `crm.activity.list`, `crm.timeline.comment.list` (somente data e autor), `user.get`, `department.get`, via `batch`. Para o ranking de reuniões: `crm.activity.list` filtrado por tipo e data, e `crm.item.list` com o mínimo (funil, etapa, criador e responsável) dos cards já encerrados que tiveram reunião. Para o estudo de concluídos e cancelados: `crm.item.list` dos cards encerrados na janela e `crm.stagehistory.list` deles. Métodos fora dessa lista são recusados pelo cliente.
- **Armazenado localmente:** cards abertos (ID, título, funil, etapa, responsável, valor, datas e apenas os campos usados nas suas regras), histórico de etapas, atividades (tipo, prazo, situação, autor e assunto até 80 caracteres — pode ser desligado), datas e autores de comentários, nomes de usuários e contagens diárias. Para o ranking: por reunião, apenas ID, card, tipo, situação, datas e responsável (o assunto é usado só para classificar e **não** é guardado); dos cards encerrados com reunião, apenas funil, etapa, criador e responsável. Para o estudo, por card encerrado na janela: ID, título, funil, etapa final e anterior, assessor, criador, valor, datas e os campos usados (e-mail do especialista e motivo).
- **Não lido:** contatos, empresas, documentos, arquivos, descrições, texto de comentários e dados de beneficiários. Se o **título dos cards** ou o assunto das atividades puderem conter informação de saúde, padronize os títulos no Bitrix e desligue o assunto em *Dados e privacidade*.
- Nas páginas do Bitrix, o script da extensão só desenha a aba SLA e a gaveta e obtém o token de sessão (`sessid`) para as consultas de leitura. Ele não lê o conteúdo das páginas, formulários nem mensagens.
- Nada é enviado a outro serviço além do seu portal.

## 7. Limitações e dependências reais
- **Comercial:** por padrão é quem abriu o card (campo "Criado por" do Bitrix). Se um card foi criado por automação, importação ou integração, o "comercial" mostrado será esse usuário técnico — nesse caso, escolha em *Funis e etapas* o campo de usuário que guarda o comercial.
- **Ranking de reuniões:** conta o que está registrado como atividade nos cards dos funis monitorados. Reuniões marcadas só na agenda (sem vínculo com o card), ou registradas com outro tipo/assunto, não entram — ajuste os tipos e palavras em *Ranking de reuniões*. A sincronização completa (a cada 6 h) lê as reuniões da janela configurada (padrão 70 dias, cobrindo o mês anterior); entre elas, as alterações chegam pela consulta incremental de atividades, sem requisições extras. Uma reunião excluída no Bitrix sai do ranking na próxima sincronização completa. Os tipos de atividade (como a reunião do calendário) variam por versão do Bitrix e não foram conferidos no seu portal.
- **Concluídos e cancelados:** dependem de as etapas finais estarem marcadas no Bitrix como sucesso ou falha (é o padrão dos funis). Cards encerrados antes da janela configurada não entram; cards antigos podem não ter histórico completo, e aí a etapa anterior aparece como "não identificada". Um card encerrado que for reaberto sai do estudo na sincronização seguinte. O motivo só aparece se houver um campo de motivo preenchido.
- **Idade do card:** dias de calendário desde a data de criação registrada no Bitrix, no fuso configurado (um card importado com data antiga mostra a data importada).
- **Identificação do processo da página de foco:** depende de a lista ou kanban de be.smart Saúde ter links no formato `…/besmart_saude/type/NÚMERO/details/…`, que é o padrão do Bitrix24 para espaços digitais, mas não pôde ser conferido no seu portal. Se não identificar, abra uma oportunidade da página ou cole o link dela em *Funis e etapas*.
- **Modo login do Bitrix:** depende de o portal aceitar consultas da API feitas com o login do navegador. A documentação oficial do Bitrix24 cita apenas webhook e OAuth, e alguns métodos recusam a sessão (`WRONG_AUTH_TYPE`). Por isso esse modo precisa ser confirmado no seu portal; se falhar, use o webhook. Nesse modo, a atualização só acontece com uma aba do Bitrix aberta e logada.
- **Chrome precisa estar aberto.** Não há monitoramento com o navegador fechado; o Chrome também pode suspender a extensão em segundo plano. Ao reabrir, ela sincroniza e destaca os vencimentos ocorridos no intervalo.
- **Credencial de sessão:** no modo recomendado, é preciso informar o webhook de novo após reiniciar o Chrome.
- **Pausa por campo** depende da observação da extensão: o Bitrix não fornece histórico de alteração de campos, então pausas que começaram e terminaram com o Chrome fechado não são vistas.
- **Histórico de etapas:** `crm.stagehistory.list` cobre leads, negócios, faturas e processos inteligentes. Cards antigos podem ter histórico incompleto; nesse caso vale `movedTime` ou o cálculo parcial.
- **Interações:** atividades concluídas são lidas numa janela (padrão 60 dias, até 50 por card); comentários, os 20 mais recentes. Um card sem nada na janela aparece como “mais de X” (limite inferior).
- **Tipos de atividade** variam por portal e integrações (WhatsApp por canal aberto, apps de telefonia). Revise a lista em *O que conta como interação*.
- **Limites da API:** 2 req/s (5 no Enterprise) e limite de tempo de execução por método. A extensão espera e tenta de novo; portais muito grandes podem levar alguns minutos na sincronização completa.
- **Departamentos** exigem o escopo `department`; sem ele, use equipes manuais.
- **Processos inteligentes / espaços digitais:** a lista automática exige administrador do CRM; sem isso, adicione pelo link de um card (passo 2.3). O formato do link do card vem do endereço colado.
- **Não verifiquei o seu portal:** `crm.hub-bnk.com` bloqueia acesso automatizado e não tenho credencial. Não sei se ele é Bitrix24 em nuvem com domínio próprio ou instalação em servidor próprio. Nas duas situações a API é a mesma; num servidor próprio desatualizado, métodos como o histórico de etapas podem faltar, e a extensão avisa e usa o plano B descrito em 3.3.
- **Instalação** é “sem compactação” (modo desenvolvedor). Publicar na Chrome Web Store é possível, mas não foi feito.
- **Sem IA:** os resumos são calculados por regras, a partir dos dados lidos.

## 8. Evidências das verificações (pasta `docs/evidencias`)
- `e2e-foco.txt` e `resultado-e2e-foco.json` — 15 verificações (incluindo o comercial na fila, nas Etapas, no filtro e na distribuição) do foco em `/page/besmart/besmart_saude/`: processo identificado pelos links dos cards, monitoramento restrito a ele, regras de SLA só dos funis dele, somente as oportunidades da página analisadas, links no formato da página, negócios e leads fora de todas as telas, visão Etapas com os cards e o tempo de cada um na etapa, suspensão do monitoramento ao trocar a página até identificar o novo processo, e identificação com links no formato `/crm/type/N/details/`. Telas: `F1`, `F2`, `F3`.
- `e2e-login.txt` e `resultado-e2e-login.json` — 13 verificações do modo "entrar no Bitrix e analisar", num portal simulado com login por cookie e `BX.bitrix_sessid()`: aba SLA dentro da página, gaveta com o painel, conexão pelo login sem webhook, análise feita só pela sessão, nenhuma escrita, contador na aba, link do card abrindo no próprio Bitrix, atualização automática ao reabrir o portal, avisos de "sem login" e "Bitrix fechado" mantendo a última análise, e orientação para usar webhook quando o portal recusa a sessão. Telas: `L1`–`L4-*.png`.
- `e2e-melhorias.txt` e `resultado-e2e-melhorias.json` — 33 verificações (versão 1.7: resumo no Painel, totais e taxa do estudo, etapa onde se cancela, motivos, lista com filtro e ordem, resumo e CSV — tela `M5`; versões 1.5 e 1.6: assessor e comercial em colunas próprias, nome tirado do e-mail do especialista, pós-venda excluído, sem tempos em "úteis" nem aviso de expediente, ordem por criação, botão inverter e preferência lembrada, cards das etapas em ordem de criação, ranking por e-mail do especialista; e as verificações da 1.5 com a extensão **carregada no Chromium** na largura da gaveta (1040 px): colunas separadas de Responsável e Comercial (abriu o card), comercial diferente do responsável, data de criação e idade (com conferência de um card), ordenação por criação, detalhe do card, valores no fluxo das etapas, valor da etapa igual à soma dos cards, ranking de reuniões (líder, totais, agrupamento por responsável, CSV sem fórmulas) e a opção de não contar cards encerrados. Telas: `M1`–`M4-*.png`.
- `desempenho.txt` — medições de análise e sincronização antes e depois (dados fictícios).
- `testes-unitarios.txt` — 65 testes de cálculo e integração (todos aprovados), incluindo, na versão 1.7: leitura dos encerrados da janela com etapa anterior e data pelo histórico, exclusão do pós-venda e de encerrados antigos, motivo por campo de lista, totais/taxa/valores/ciclo por período, encerramento capturado pela sincronização incremental sem requisição extra e estudo desativado; na versão 1.6: conversão de e-mail em nome e sobrenome, e-mail do especialista com reserva no criador do card, exclusão do pós-venda em várias grafias e migração das regras para tempo corrido; e, na versão 1.5: equivalência do cálculo de fuso com cache em 6 fusos (com horário de verão e fusos de 30/45 min), expediente de um ano inteiro, rajada do limite de requisições, comercial = criador do card, classificação de reuniões, períodos no fuso (semana de segunda a domingo, viradas de mês e de ano), ranking com cards encerrados, atualização incremental do ranking e empates. Dos 49 testes anteriores: expediente com almoço, fins de semana, feriados, fuso, vencimento exato, pausa e retomada, “aguardando documentos” sem pausa automática, retorno à etapa (reiniciar/acumular/manter), exceções, ausência de histórico (`movedTime` e parcial), SLA total com etapa de pausa, card parado, cards concluídos/perdidos fora da fila, atraso atual × vencimento histórico, múltiplos alertas no mesmo card, valor sem duplicidade, atividade sem prazo, automação ignorada, paginação e `batch`, sincronização incremental, `QUERY_LIMIT_EXCEEDED` com nova tentativa, perda de autenticação mantendo os dados anteriores, histórico indisponível, falta de escopo de departamento, processo de espaço digital adicionado pelo link de um card quando `crm.type.list` é negado, deduplicação, silenciamento, janela de notificação e vencimento durante ausência.
- `e2e.txt` e `resultado-e2e.json` — 34 verificações com a extensão **carregada no Chromium**: demonstração, indicadores, fila, detalhe, link, filtros, busca, silenciamento atualizando o contador do ícone, central, análises, popup, layout em 390 px, endereço do portal pré-preenchido, webhook de outro endereço recusado, webhook inválido recusado, processo de espaço digital adicionado pelo link, conexão HTTP com um servidor que imita o Bitrix24, apenas métodos de leitura recebidos pelo servidor, credencial só na sessão, aviso “não foi possível consultar” ao perder a credencial, “!” no ícone e limpeza de dados.
- `00`–`10-*.png` — telas capturadas durante o teste.

Observação sobre o teste automatizado: o diálogo do Chrome que pede permissão de domínio não pode ser clicado em modo automatizado; a cópia usada no teste já declara acesso ao servidor local `127.0.0.1`. A extensão distribuída pede a permissão normalmente.

## 9. Para desenvolvedores
```
src/core/          motor puro (tempo útil, SLA, interações, detecção, prioridade, análise, configuração)
src/integration/   cliente REST (limites, erros, batch, paginação), estrutura do portal, sincronização
src/alerts/        deduplicação, silenciamento, notificações e contador
src/store/         armazenamento e credencial
src/demo/          portal simulado e configuração com dados fictícios
ui/                painel, popup, estilos
content/           scripts nas páginas do Bitrix (aba SLA, gaveta e consultas pelo login)
background.js      service worker (alarms, mensagens)
tests/             node --test tests/*.test.js
tools/             servidor simulado, teste ponta a ponta, gerador da prévia
```
- Testes: `node --test tests/*.test.js` (Node 20+).
- Servidor simulado: `node tools/mock-server.mjs 8787` → webhook `http://127.0.0.1:8787/rest/1/teste123/`.
- Teste ponta a ponta: `node tools/e2e.mjs saida/`, `node tools/e2e-login.mjs saida/`, `node tools/e2e-foco.mjs saida/` e `node tools/e2e-melhorias.mjs saida/` (requer Playwright).
- Desempenho: `node tools/bench.mjs [cards] [repetições]` (análise) e `node tools/bench-sync.mjs [latênciaMs]` (sincronização).
- Prévia em arquivo único: `node tools/build-preview.mjs caminho/do/esbuild` → `dist/previa-painel.html`.
