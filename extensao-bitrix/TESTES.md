# Evidências de teste e limitações — v1.0.0

Três níveis de validação, mantidos separados:

| Nível | Executado? | Onde |
|---|---|---|
| 1. Testes simulados (Node, sem navegador) | **Sim — 24/24** | `tests/unit/core.test.js` → `tests/evidencias/resultado-unitarios.txt` |
| 2. Testes no Chromium com a extensão real carregada, em páginas representativas servidas em `https://crm.hub-bnk.com/...` (sem rede) | **Sim — 16/16** | `tests/e2e/extension.e2e.js` → `tests/evidencias/resultado-chromium.txt` e capturas `tests/evidencias/*.png` |
| 3. Validação no portal real crm.hub-bnk.com | **Não executada** | Sem acesso ao portal a partir do ambiente de desenvolvimento (ver Limitações) |

Ambiente dos níveis 1 e 2: Node 22.22, Chromium 1243 (Playwright 1.63, headless novo), fuso `America/Sao_Paulo`, 26/10/2026.

## 1. Testes simulados (Node)

- Formulário: `1,25`, `1.25`, `0`, vazio aceitos; `-1`, `abc`, `1,2,3`, `1e3` rejeitados.
- Valores: `R$ 12.500,00`, `US$ 1,000.50`, `€ 10`, número sem moeda (moeda não presumida).
- Links: só `https://crm.hub-bnk.com/crm/...`; rejeita `javascript:`, `data:`, `http:`, outro domínio, `user@host`.
- Escape de HTML; funções nativas guardadas com `bind` (sem *Illegal invocation*).
- Datas brasileiras: `dd/mm/aaaa [hh:mm]`, `dd.mm.aaaa às hh:mm`, ISO, `26 de outubro de 2026`, `5 mar. 2027`,
  hoje/ontem/amanhã no fuso configurado (inclusive perto da meia-noite UTC).
- Datas ausentes, inválidas (`31/02`), formato americano, sem ano (ambíguo), duas datas no campo (ambíguo).
- Fuso com horário de verão (America/New_York) e America/Sao_Paulo.
- Expediente: fim de semana, feriado em segunda-feira, 1,25 h atravessando sexta→terça, tempo corrido.
- Configuração antiga com `webhookUrl`/`token` removida; fuso inválido e expediente invertido corrigidos;
  regras com 0 descartadas; nenhum prazo pré-definido.
- Observação local: continuidade, lacunas não contadas (padrão) e contadas (opção), mudança de etapa,
  retorno sem pausa (recomeça), pausa → retorno (retoma, sem contar o período em pausa), retenção e saneamento.
- Regras: prazo do card vencido/no prazo/sem ano; "não exibido" × "não encontrado" × "sem regra";
  SLA parcial → aviso → vencido com prazo aplicado exato; data de entrada exibida (não parcial); etapa em pausa;
  finalizados (WON/LOSE/manual, e "não" manual sobrepondo o automático).
- Totais: valor contado uma vez por card, moedas separadas, cards sem valor contados à parte; prioridade.
- CSV: `=`, `+`, `-`, `@`, tab, `;`, quebras de linha, BOM.

## 2. Testes no Chromium com a extensão carregada

| # | Cenário | Resultado |
|---|---|---|
| 1 | Manifesto: permissões `storage`, `scripting`; host e content script só em `https://crm.hub-bnk.com/*` | ok |
| 2 | Kanban: 5 cards reconhecidos; atividade vencida (contador), "Sem atividades planejadas", "SLA vencido"; card em `C2:WON` fora da fila; texto "sem atividades vencidas" em campo de comentário **não** gera alerta; coluna com 3 declarados e 2 carregados → "cobertura parcial" | ok |
| 3 | Título com `"><img onerror=…>` exibido como texto; nenhum `<img>` no painel; `href="javascript:…"` substituído pelo link seguro do card; nenhum script executado | ok |
| 4 | Configuração no painel: sugestão de campo detectado, SLA `1,25`, valor inválido `abc` bloqueado com mensagem, gravação e reanálise | ok |
| 5 | SLA vencido com histórico local semeado: chip "SLA vencido", texto "Contagem parcial desde a observação local." e evidência "Não é o histórico oficial do Bitrix" | ok |
| 6 | Card novo inserido e card movido para etapa finalizada → atualização automática sem recarregar (< 4 s) | ok |
| 7 | Localizar card (destaque sobre o elemento) e exportação CSV (BOM, cabeçalho, sem células iniciadas por fórmula) | ok |
| 8 | Teclas digitadas no painel não chegam aos atalhos da página; cliques no kanban continuam chegando ao Bitrix; minimizar | ok |
| 9 | Navegação interna (`history.pushState`) do Kanban para a Lista; leitura do grid, atividade vencida, "Sem atividades", "Responsável não exibido"; nenhum "null/undefined/NaN" na tela | ok |
| 10 | Sessão encerrada durante o uso e página de login | ok |
| 11 | Layout desconhecido (mensagem clara), página fora do CRM, página de detalhes | ok |
| 12 | Iframe do mesmo domínio lido; iframe de outro domínio contado como inacessível | ok |
| 13 | Atualização da extensão (reinstalação da pasta via CDP, como o botão ↻): nova instância assume a aba aberta, um único painel | ok |
| 14 | Tela de 390 px: painel ocupa a largura, sem rolagem horizontal; Esc minimiza | ok |
| 15 | Nenhuma requisição além das páginas de teste do próprio domínio (a única externa é o iframe que a página de teste contém); varredura estática sem `fetch`/XHR/WebSocket/beacon/cookies/localStorage; nenhum erro "Illegal invocation" | ok |
| 16 | Extensão recarregada/desativada sem reinjeção: painel antigo mostra o aviso e para de processar | ok |

Desempenho (medição avulsa no mesmo Chromium): kanban com **1.000 cards** lido e analisado em ~106 ms;
rajada de 50 inserções seguidas resultou em **uma** leitura agrupada (~159 ms).

## Limitações reais

1. **Não validado no portal real.** O endereço crm.hub-bnk.com estava bloqueado pela rede do ambiente de
   desenvolvimento e a extensão Claude in Chrome do usuário não é acessível a partir da sessão em nuvem.
   Os seletores seguem a estrutura padrão do Bitrix24 (`main-kanban-column[data-id]`, `main-kanban-item[data-id]`,
   `crm-kanban-item-*`, `main-grid-table`, `th[data-name]`, `tr.main-grid-row[data-id]`) **sem confirmação neste
   portal**. Use o diagnóstico estrutural (aba Cobertura) para calibrar.
2. **Documentação oficial não acessível** no ambiente (developer.chrome.com e apidocs.bitrix24.com bloqueados).
   A implementação segue as regras do Manifest V3 conhecidas e foi verificada empiricamente no Chromium 1243.
   Pela central de ajuda do Bitrix24 (resumo de busca): o contador de atividades fica **vermelho 15 min antes do
   prazo** (padrão) — por isso um destaque só por cor é marcado como "vencida ou prestes a vencer" nas evidências;
   não foi encontrado indicador nativo de tempo na etapa/SLA no kanban de negócios.
3. **Somente o que está carregado na página.** Não há chamadas à API do Bitrix, não percorre páginas da lista,
   não rola o kanban e não abre cards. Cards não carregados aparecem como "não carregados" quando o Bitrix exibe o
   total da etapa; na Lista, só a página atual é analisada.
4. **Entrada na etapa**: sem um campo exibido com essa data, a contagem é parcial (desde a observação local) e
   só existe enquanto o Chrome e a página estiverem abertos.
5. **Responsável no kanban** só é lido se o card exibir o campo "Responsável" ou um elemento identificado como
   responsável; caso contrário aparece "Responsável não exibido".
6. **Nome do funil** depende do que a página mostra; quando não identificado, usa "Funil N" (ID da categoria).
   Na Lista sem coluna/URL de funil, o funil só é inferido se a etapa existir em um único funil já visto.
7. **Etapas são identificadas pelo nome** dentro do funil (a Lista não mostra o ID). Renomear uma etapa no
   Bitrix exige refazer a regra dela e reinicia a observação local.
8. **Datas exibidas sem ano** são tratadas como ambíguas por padrão (opção para considerar o ano corrente).
9. **Iframes** de outros domínios não são lidos; iframes ocultos são ignorados.
10. Teste de atualização da extensão feito via CDP (`Extensions.loadUnpacked`), que reproduz o botão ↻; a
    atualização pela loja não se aplica (instalação sem compactação).
