# Histórico de versões

## 1.8.0
- Ponto de restauração: marcação `v1.7.0` no repositório e ZIP da 1.7.0 mantido em `dist/`.
- Desempenho: telas leem um resumo leve (`view_*`, `summary_*`) em vez do conjunto completo; avisos de mudança por `chrome.storage.session` (`uiRev`) em vez de escutar todo o armazenamento e de consultar a cada 4 s; análise lida direto pelo painel só quando mudou; leituras atrasadas descartadas; painel oculto/gaveta fechada adiam a atualização; Etapas com 40 cards por etapa e "Mostrar mais"; popup pelo resumo.
- Aba do Bitrix: contador recebido por mensagem (o script da página não escuta mais o armazenamento — eliminado o travamento de ~0,5–0,7 s por sincronização com 1.500 cards); navegação interna pela Navigation API (sem verificação a cada 1,5 s).
- Atualização da extensão religa os scripts nas abas do Bitrix abertas (`scripting`), com a instância antiga se desligando sozinha; ponte da sessão protegida contra duplicação; detector de processo idem.
- Estabilidade: progresso de sincronização preso ignorado e limpo ao reiniciar o service worker; sem internet não há tentativas inúteis (estado "Sem conexão"); edições não salvas, campos digitados e mensagens de resultado preservados nas atualizações em segundo plano; botões ocupados durante a ação; erros sempre visíveis e registrados.
- Diagnóstico local (histórico de sincronizações agrupando falhas repetidas e erros recentes, mascarados) com "Copiar diagnóstico".
- Interface: novo visual com ícones SVG, tema claro/escuro/automático, cabeçalho com situação e progresso, abas com contadores, busca global, atalhos de teclado, filtros rápidos (Meus cards, Novos desde a última visita, Críticos, SLA vencido), marca "novo", estados de carregamento/vazio/erro, avisos empilháveis, acessibilidade; popup redesenhado; gaveta com ícones e atalho Alt+Shift+S.
- Segurança: CSP explícita; permissões `http://127.0.0.1/*` e `http://localhost/*` removidas da versão distribuída; `batch` com comando de escrita recusado também no script da página; código de moeda sanitizado.
- Testes: 4 unitários novos (69 no total) e nova suíte `tools/e2e-v18.mjs` (37 verificações); `tools/bench-ui.mjs` e `tools/check-update.mjs` para comparar versões.

## 1.7.0
- Estudo dos cards concluídos e cancelados: aba própria, resumo no Painel, períodos, taxa de conclusão, valores, ciclo, etapa onde se cancela, motivos, por comercial/assessor/funil, evolução mensal, lista com filtros e CSV; configuração de janela e campo de motivo.
- Sincronização completa lê os encerrados da janela (com histórico de etapas); a incremental captura os encerramentos sem requisição extra e reaproveita esses dados para o ranking de reuniões.

## 1.6.0
- Funis/processos com "pós-venda" no nome excluídos do monitoramento (termos configuráveis).
- Expediente removido: aba, aviso de confirmação e opção "horário comercial"; tudo em tempo corrido (regras antigas migradas).
- Cards em ordem de criação (mais antigos primeiro) na fila, etapas e central de alertas, com botão para inverter (preferência lembrada).
- Comercial pelo campo "E-mail do especialista", convertido em nome e sobrenome (yago.barbosa@… → Yago Barbosa), com o e-mail visível; sem e-mail, quem abriu o card.
- "Responsável" passa a se chamar "Assessor" nas telas.

## 1.5.0
- Desempenho: cálculo de horário comercial com cache por dia e de fuso por faixa de 15 min (análise de 1.500 cards: ~50 s → ~0,15 s, resultado idêntico); cliente REST usa a rajada permitida pelo limite do Bitrix24 (10 requisições, depois 2/s; 25 e 5/s no plano de 5 req/s); histórico, atividades, comentários, reuniões, usuários e departamentos lidos em paralelo; busca do painel sem redesenhar a página; fila paginada (150 por vez); permissão `unlimitedStorage`.
- Comercial = quem abriu o card (`createdBy`), em coluna própria, separado do responsável (configurável).
- Data de criação e idade em dias de cada card; ordenação por criação.
- Valores em aberto por etapa (fluxo, cabeçalho da etapa, tabela) e nas distribuições.
- Ranking automático de reuniões (aba própria, resumo no Painel, CSV, configuração de tipos/palavras/janela/cards encerrados).
- Gaveta dentro do Bitrix mais larga (até 1040 px) para caber as colunas.

## 1.4.0
- Versão enviada pelo usuário (base desta atualização).
