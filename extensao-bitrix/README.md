# Assistente de Pendências — extensão Chrome para o Bitrix24 (crm.hub-bnk.com)

Extensão Chrome (Manifest V3) **somente leitura** que funciona dentro do próprio Bitrix24 em
`https://crm.hub-bnk.com/*`. Você entra com o seu login normal, abre o CRM e encontra, na própria página,
uma fila priorizada dos cards que precisam de atenção.

- **Sem webhook, token, senha ou servidor.** A extensão lê apenas o que a página do Bitrix já exibe, com a
  sessão que você já usa. Não faz nenhuma requisição de rede.
- **Não altera nada** no Bitrix: não clica, não arrasta, não edita cards, responsáveis, etapas, atividades,
  prazos ou configurações.
- Painel lateral em Shadow DOM (estilos e eventos isolados) aberto por um botão flutuante **"Pendências"** na
  borda direita da tela, ou pelo ícone da extensão na barra do Chrome.

## Instalação (5 minutos)

1. Baixe `dist/assistente-pendencias-bitrix-v1.0.0.zip` e extraia em uma pasta fixa
   (ex.: `Documentos\Extensoes\assistente-pendencias`). Não apague essa pasta depois.
2. No Chrome, abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta extraída (a que contém `manifest.json`).
5. Abra `https://crm.hub-bnk.com`, entre normalmente e abra o CRM (Negócios, Leads ou processo inteligente)
   em **Kanban** ou **Lista**. O botão **Pendências** aparece na borda direita.

O Chrome pede apenas: *"Ler e alterar seus dados em crm.hub-bnk.com"* (necessário para ler a página e
desenhar o painel) e armazenamento local. Nenhum outro site.

## Atualização

1. Extraia o novo ZIP **na mesma pasta** (substituindo os arquivos).
2. Em `chrome://extensions`, clique no botão **↻ (Atualizar)** do card da extensão.
3. As abas do Bitrix já abertas recebem o novo painel automaticamente em alguns segundos. Se uma aba mostrar
   *"A extensão foi atualizada, recarregada ou desativada"*, pressione F5 nela.

Configurações e observações locais são preservadas entre atualizações.

## Primeiro uso: configurar os prazos

Nenhum prazo da empresa vem pré-definido (todas as regras começam em **0 = desativada**). Na aba
**Configurar SLA**:

| Opção | O que faz |
|---|---|
| Contagem | Tempo corrido (24 h) ou expediente (dias úteis, horário inicial/final, feriados). |
| Fuso horário | Padrão `America/Sao_Paulo`. Usado em todas as datas, independentemente do fuso do computador. |
| Feriados | Uma data por linha (`25/12/2026` ou `2026-12-25`). |
| Aviso antecipado | % do SLA a partir do qual o card aparece como "SLA próximo" (0 desativa). |
| Prazo por funil e etapa | **SLA (h)** e **Parado (h)** aceitam frações: `1,25` = 1 h 15 min. 0 desativa. |
| Pausa | Etapas que suspendem o SLA (ex.: aguardando documentos do cliente). Ao voltar para a etapa anterior, a contagem é retomada. |
| Final | Etapas finalizadas saem da fila. "Auto" reconhece IDs `WON`/`LOSE` exibidos pelo Bitrix. |
| Campo de prazo do card | Rótulo exato do campo exibido no card que representa o prazo operacional. A tela sugere os rótulos detectados. |
| Campo de entrada na etapa | Opcional: se o seu card exibir a data de entrada na etapa, ela substitui a observação local. |
| Continuidade / lacunas | Ver "Contagem parcial" abaixo. |
| Retenção | Dias que as observações locais ficam guardadas (padrão 30). |

As etapas aparecem na tabela depois que você abre o Kanban (ou a Lista) daquele funil ao menos uma vez.

## O que é identificado

Separadamente, e só quando houver evidência na página:

| Pendência | Origem da evidência |
|---|---|
| Prazo do card vencido | Campo configurado exibido no card (data brasileira; data sem hora vence no fim do dia). |
| Atividade pendente vencida | Indicador de atividade do Bitrix no card/linha (texto "vencida"/"atrasada", dica do contador ou destaque de alerta). |
| SLA da etapa vencido | Regra configurada × tempo na etapa (campo exibido ou observação local). |
| SLA vencido sinalizado pelo Bitrix | Texto/indicador de SLA vencido exibido no card. |
| Parado na etapa além do limite | Regra "Parado (h)" configurada. |
| Sem atividade | **Somente** quando o Bitrix escreve isso no card (ex.: "Sem atividades planejadas"). A falta de agenda/histórico na tela **não** gera alerta. |
| SLA próximo do vencimento | % de aviso antecipado configurado. |

Para cada card: nome, ID, funil e etapa, responsável, valor e moeda, tipos de pendência, prazo aplicado,
tempo de atraso, origem da informação, link seguro para abrir o card e botão **Localizar na página**.

Estados exibidos sem ambiguidade: **Nenhuma pendência identificada** (avaliado, nada encontrado) ·
**Sem regra ou dado aplicável** · **não exibido** (campo ausente neste card) · **não encontrado** (nenhum card
da página exibe o campo) · **não carregado** (o Bitrix informa mais cards na etapa do que os presentes).

### Contagem parcial desde a observação local

O Kanban do Bitrix normalmente não mostra quando o card entrou na etapa. Nesse caso a extensão usa o que ela
própria viu e mostra **"Contagem parcial desde a observação local."** — não é o histórico oficial do Bitrix.

- Só conta o tempo em que o card foi visto na etapa. Se você fecha a página por 3 h, essas 3 h **não** são
  contadas (não se presume que o card continuou lá). Há uma opção para contar as lacunas, desligada por padrão.
- Mudança de etapa observada reinicia a contagem; o momento exato da entrada continua desconhecido.
- Pausa → retorno à etapa anterior retoma a contagem; retorno sem pausa recomeça.
- "Modificado em" (última alteração genérica) nunca é usado como prova de contato ou de entrada na etapa.

### Prioridade

1. Gravidade (SLA vencido e prazo vencido → atividade vencida e parado → sem atividade informada → SLA próximo).
2. Proporção do atraso sobre o prazo aplicado. 3. Atraso absoluto. 4. Quantidade de tipos de pendência.
5. Valor (apenas desempate). A prioridade indica urgência operacional — não causa nem responsabilidade de ninguém.

Valores: cada card entra uma única vez no total em atraso; moedas diferentes não são somadas.

## Atualização automática

- Observa alterações no conteúdo (novos cards, movimentações, contadores) e relê sem recarregar a página,
  agrupando rajadas de alterações (espera 0,4 s, no máximo 2 s; intervalo mínimo de 0,8 s entre leituras).
- Reconhece a navegação interna do Bitrix (troca de funil, etapa, filtro, página) e iframes **visíveis do mesmo
  domínio** (ex.: kanban aberto em painel deslizante). Iframes de outros domínios são contados como inacessíveis.
- Releitura periódica a cada 60 s (para prazos que vencem com o passar do tempo) e botão **↻ Reanalisar**.
- Aba em segundo plano: pausa e retoma ao voltar.
- Cards lidos há pouco que saem do DOM por carregamento gradual continuam na fila por até 10 min, marcados
  "Não visível agora"; mudança de rota ou filtro descarta essa retenção.
- Funciona enquanto o Chrome e a página do Bitrix estiverem abertos. Não há monitoramento com o computador
  desligado.

## Privacidade e segurança

- Permissões: `storage`, `scripting` e acesso apenas a `https://crm.hub-bnk.com/*`.
  `scripting` serve só para reinstalar o painel nas abas abertas após uma atualização.
- Sem rede: nenhum `fetch`, XHR, WebSocket, analytics, IA ou servidor (verificado por teste estático e de navegador).
- Não lê nem guarda cookies, senhas ou tokens. Configurações antigas com webhook/token são apagadas
  automaticamente.
- Guardado localmente (`chrome.storage.local`): configurações, nomes de funis/etapas e, por card, só
  `entidade:ID`, etapa e horários de observação. Títulos, valores, responsáveis, descrições, documentos,
  dados de saúde e mensagens **não** são gravados. Botões para limpar observações e restaurar padrões.
- Texto da página é exibido sempre como texto (nunca HTML); links só são aceitos se forem `https://crm.hub-bnk.com/crm/...`.
- CSV gerado apenas ao clicar em **Exportar CSV**, no seu computador, com proteção contra fórmulas (`=`, `+`, `-`, `@`).

## Calibração no portal real

Os seletores seguem a estrutura padrão do Bitrix24 (`main.kanban`/`crm.kanban` e `main.ui.grid`), mas **não
foram confirmados no crm.hub-bnk.com** (sem acesso ao portal durante o desenvolvimento). Se o painel mostrar
"Layout não reconhecido" ou campos faltando:

1. Abra o Kanban do funil → painel → aba **Cobertura** → **Copiar diagnóstico estrutural**.
2. O diagnóstico contém apenas contagens e nomes de classes CSS — sem nomes, valores ou textos de cards.
3. Envie esse texto para ajuste dos seletores em `src/content/extract.js`.

## Desenvolvimento

```
extensao-bitrix/
  manifest.json
  src/background/service-worker.js   reinjeção após atualização + clique no ícone
  src/content/util.js                 texto, links seguros, números e moedas
  src/content/time.js                 fuso, expediente, feriados, datas brasileiras
  src/content/settings.js             configurações, migração (remove webhook/token), storage
  src/content/observe.js              observação local da permanência na etapa
  src/content/analyze.js              regras, prioridade, totais
  src/content/csv.js                  exportação protegida
  src/content/extract.js              leitura do DOM (kanban, lista, iframes, login)
  src/content/panel.css.js, panel.js  interface em Shadow DOM
  src/content/main.js                 orquestração, observadores, recuperação
  tests/unit/core.test.js             testes simulados (Node)
  tests/e2e/extension.e2e.js          testes no Chromium com a extensão carregada
  tests/fixtures/pages.js             páginas representativas do Bitrix24
  tests/evidencias/                   capturas de tela e saída dos testes
```

```bash
npm run check      # manifesto, sintaxe, ausência de rede/cookies/innerHTML
npm test           # testes unitários (node:test)
npm run test:e2e   # Chromium + extensão (requer: npm i -D playwright && npx playwright install chromium)
npm run build      # check + dist/assistente-pendencias-bitrix-v<versão>.zip
```

Resultados e limitações detalhados: [`TESTES.md`](TESTES.md).
