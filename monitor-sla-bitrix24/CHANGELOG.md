# Histórico de versões

## 1.5.0
- Desempenho: cálculo de horário comercial com cache por dia e de fuso por faixa de 15 min (análise de 1.500 cards: ~50 s → ~0,15 s, resultado idêntico); cliente REST usa a rajada permitida pelo limite do Bitrix24 (10 requisições, depois 2/s; 25 e 5/s no plano de 5 req/s); histórico, atividades, comentários, reuniões, usuários e departamentos lidos em paralelo; busca do painel sem redesenhar a página; fila paginada (150 por vez); permissão `unlimitedStorage`.
- Comercial = quem abriu o card (`createdBy`), em coluna própria, separado do responsável (configurável).
- Data de criação e idade em dias de cada card; ordenação por criação.
- Valores em aberto por etapa (fluxo, cabeçalho da etapa, tabela) e nas distribuições.
- Ranking automático de reuniões (aba própria, resumo no Painel, CSV, configuração de tipos/palavras/janela/cards encerrados).
- Gaveta dentro do Bitrix mais larga (até 1040 px) para caber as colunas.

## 1.4.0
- Versão enviada pelo usuário (base desta atualização).
