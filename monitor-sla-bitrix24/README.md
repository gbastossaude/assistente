# Monitor de SLA – Bitrix24 (extensão para Google Chrome)

Extensão **somente leitura** que consulta os cards do Bitrix24 (negócios, leads e processos inteligentes) e mostra, em português, **quais cards estão atrasados, qual prazo foi ultrapassado, quem é o responsável e o que precisa de atenção primeiro**.

**Escopo configurado:** somente os **cards abertos** da página **be.smart Saúde** (`https://crm.hub-bnk.com/page/besmart/besmart_saude/`), acompanhando cada etapa. **Leads nunca são monitorados**, e negócios e outros processos ficam de fora. Enquanto o processo dessa página não for identificado, nada é monitorado: a extensão não cai em outra lista por engano.

**Como funciona no dia a dia:** você entra no Bitrix (`https://crm.hub-bnk.com`) normalmente, com o seu login. A extensão mostra uma aba **SLA** na lateral da página, com o número de cards que precisam de atenção. Ao clicar, abre a análise numa gaveta dentro do próprio Bitrix. A análise é atualizada sozinha quando você entra no portal e a cada 15 minutos enquanto ele estiver aberto. Não é preciso criar webhook.

> **Status da validação.** Toda a lógica foi testada com casos de cálculo e com um portal Bitrix24 **simulado** (mesmo formato de resposta da API oficial), carregando a extensão no Chromium tanto no modo "login do Bitrix" quanto por webhook. **A integração com o seu portal real ainda não foi validada.** Em particular, é preciso confirmar que o `crm.hub-bnk.com` aceita consultas pelo login do navegador; se não aceitar, a extensão avisa e o webhook resolve. Veja [Primeiro teste no seu portal](#primeiro-teste-no-seu-portal).

---

## 1. Instalação no Chrome

1. Descompacte `monitor-sla-bitrix24.zip` numa pasta permanente (ex.: `Documentos/monitor-sla-bitrix24`). Não apague a pasta depois.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e escolha a pasta descompactada (a que contém `manifest.json`).
5. O Chrome informa que a extensão pode "ler e alterar dados em crm.hub-bnk.com". Esse é o aviso padrão para qualquer extensão que funcione dentro de um site. A extensão só lê, e qualquer comando de alteração é bloqueado no código.
6. Fixe o ícone (alfinete no menu de extensões). Clique no ícone → **Abrir painel completo**, ou use o botão direito → **Opções**.

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

### 3.2 Expediente e feriados
- Fuso horário, dias úteis e um ou mais intervalos por dia (ex.: 08:30–12:00 e 13:00–18:00).
- Em regras em **dias** no horário comercial, 1 dia = duração do expediente (ou o valor que você informar). Ex.: 2 dias úteis a partir de segunda 15:00 vencem quarta 15:00.
- Feriados: botões para os nacionais do ano; Carnaval e Corpus Christi são opcionais. Acrescente os estaduais e municipais.
- Marque **Confirmo que expediente…**: até lá o painel lembra que o expediente padrão está em uso.

### 3.3 Regras de SLA (nenhum prazo vem preenchido)
Para cada funil:
- **SLA da etapa:** prazo em minutos, horas ou dias; contagem em **horário comercial** ou **tempo corrido**; **% para aviso antecipado**.
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
- **Comercial do card:** além do responsável, todas as telas mostram o **comercial** de cada card: fila, detalhe, Etapas, central de alertas, popup e notificações. Também há filtro, ordenação e a distribuição "Por comercial". A extensão usa automaticamente o campo de usuário do processo chamado "Comercial" (ou "Vendedor", "Consultor", "Corretor"). Para escolher outro campo, como "Criado por", ou desligar, vá em **Configurações › Funis e etapas › Comercial do card**. Cards sem o campo preenchido aparecem como "Sem comercial".
- **Etapas:** o fluxo do funil com a quantidade de cards em cada etapa (em vermelho as que têm SLA vencido). Abaixo, cada etapa lista seus cards abertos, do mais antigo para o mais recente, com responsável, há quanto tempo está na etapa (corrido e em horário comercial, com a data de entrada), situação do SLA da etapa, próxima atividade e alertas. Mostra também a média atual de permanência e, quando há histórico suficiente, a média histórica.
- **Painel:** indicadores (monitorados, com atraso, SLA vencido, próximos do vencimento, sem acompanhamento, valor em atraso sem duplicar cards), resumo operacional calculado, distribuição por responsável, funil, etapa e prioridade, e a **fila priorizada** com busca, filtros (responsável, equipe, funil, etapa, tipo de alerta, gravidade), ordenação e botão **Abrir no Bitrix**. Clique no card para ver cada alerta com prazo aplicado, atraso, vencimento, evidências e silenciamento (1 h a 3 dias).
- **Central de alertas:** novos, em atraso, próximos, acompanhamento, os que **venceram enquanto o Chrome estava fechado** e os silenciados.
- **Análises:** cobertura dos dados (o que foi lido, de onde veio cada data, falhas), tabelas por responsável/funil/etapa e métricas históricas **só quando há amostra suficiente** (tempo médio por etapa com pelo menos 5 passagens; evolução após 3 dias de sincronização).
- **“Nenhuma pendência encontrada” × “Não foi possível consultar”:** quando a consulta falha, o painel mostra o erro e deixa claro que os números exibidos são da última sincronização bem-sucedida.

## 5. Primeiro teste no seu portal
1. Conecte com o webhook (seção 2) e marque **um** funil.
2. Defina SLA em 2 ou 3 etapas e confirme o expediente.
3. Clique **Sincronizar** e abra **Análises › Cobertura dos dados**: confira a contagem de cards abertos, se o histórico de etapas veio como “ok” e quantos cards tiveram entrada na etapa por histórico, `movedTime` ou parcial.
4. Abra 3 cards da fila e compare com o Bitrix: etapa, responsável, entrada na etapa e atividade vencida.
5. Em *Acompanhamento e prazos*, veja a coluna **Encontradas** dos tipos de atividade e ajuste o que conta como interação.

Se algo divergir, anote o card e a mensagem exibida.

## 6. O que é lido e armazenado
- **Lido do Bitrix (somente leitura):** `crm.settings.mode.get`, `crm.type.list`, `crm.category.list`, `crm.status.list`, `crm.item.fields`, `crm.item.list`, `crm.stagehistory.list`, `crm.activity.list`, `crm.timeline.comment.list` (somente data e autor), `user.get`, `department.get`, via `batch`. Métodos fora dessa lista são recusados pelo cliente.
- **Armazenado localmente:** cards abertos (ID, título, funil, etapa, responsável, valor, datas e apenas os campos usados nas suas regras), histórico de etapas, atividades (tipo, prazo, situação, autor e assunto até 80 caracteres — pode ser desligado), datas e autores de comentários, nomes de usuários e contagens diárias.
- **Não lido:** contatos, empresas, documentos, arquivos, descrições, texto de comentários e dados de beneficiários. Se o **título dos cards** ou o assunto das atividades puderem conter informação de saúde, padronize os títulos no Bitrix e desligue o assunto em *Dados e privacidade*.
- Nas páginas do Bitrix, o script da extensão só desenha a aba SLA e a gaveta e obtém o token de sessão (`sessid`) para as consultas de leitura. Ele não lê o conteúdo das páginas, formulários nem mensagens.
- Nada é enviado a outro serviço além do seu portal.

## 7. Limitações e dependências reais
- **Comercial:** depende de existir no processo um campo de usuário com o comercial. Se o nome do campo no seu portal for diferente, escolha-o manualmente em *Funis e etapas*; sem campo, só o responsável é mostrado.
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
- `testes-unitarios.txt` — 49 testes de cálculo e integração (todos aprovados): expediente com almoço, fins de semana, feriados, fuso, vencimento exato, pausa e retomada, “aguardando documentos” sem pausa automática, retorno à etapa (reiniciar/acumular/manter), exceções, ausência de histórico (`movedTime` e parcial), SLA total com etapa de pausa, card parado, cards concluídos/perdidos fora da fila, atraso atual × vencimento histórico, múltiplos alertas no mesmo card, valor sem duplicidade, atividade sem prazo, automação ignorada, paginação e `batch`, sincronização incremental, `QUERY_LIMIT_EXCEEDED` com nova tentativa, perda de autenticação mantendo os dados anteriores, histórico indisponível, falta de escopo de departamento, processo de espaço digital adicionado pelo link de um card quando `crm.type.list` é negado, deduplicação, silenciamento, janela de notificação e vencimento durante ausência.
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
- Teste ponta a ponta: `node tools/e2e.mjs saida/`, `node tools/e2e-login.mjs saida/` e `node tools/e2e-foco.mjs saida/` (requer Playwright).
- Prévia em arquivo único: `node tools/build-preview.mjs caminho/do/esbuild` → `dist/previa-painel.html`.
