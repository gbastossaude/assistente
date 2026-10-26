// Mede a sincronização com o portal SIMULADO (dados fictícios), com latência de rede e o limite
// padrão do Bitrix24 (2 req/s). Uso: node tools/bench-sync.mjs [latênciaMs=250]
import { BitrixClient } from '../src/integration/bitrix-client.js';
import { syncData, emptyDataset } from '../src/integration/sync.js';
import { createMockPortal, DEMO_WEBHOOK } from '../src/demo/mock-portal.js';
import { demoConfig } from '../src/demo/demo-config.js';

const LAT = Number(process.argv[2] ?? 250);
const now = Date.now();
const mock = createMockPortal({ now });
const fetchImpl = (url, init) => new Promise(r => setTimeout(() => r(mock.fetchImpl(url, init)), LAT));
const config = demoConfig(now);
if (process.env.BENCH_NO_MEETINGS) config.meetings = { ...config.meetings, enabled: false };

async function run(label, ds, forceFull) {
  const client = new BitrixClient({ webhookUrl: DEMO_WEBHOOK, fetchImpl, requestsPerSecond: 2 });
  const t0 = performance.now();
  const r = await syncData({ client, config, ds, now: Date.now(), forceFull });
  const ms = performance.now() - t0;
  console.log(JSON.stringify({ etapa: label, segundos: +(ms / 1000).toFixed(2), requisicoes: r.report.requests, status: r.ds.sync.status,
    cards: Object.keys(r.ds.cards).length }));
  return r.ds;
}

let ds = await run('completa (primeira)', emptyDataset('real'), true);
ds = await run('incremental', ds, false);
