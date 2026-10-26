// Igual a bench-sync.mjs, mas com o ranking de reuniões desligado (comparação com a versão 1.4).
process.env.BENCH_NO_MEETINGS = '1';
await import('./bench-sync.mjs');
