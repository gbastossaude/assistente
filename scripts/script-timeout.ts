/**
 * Execução resiliente dos scripts de inicialização (migrate/bootstrap) no deploy: cada tentativa tem tempo limite —
 * uma conexão de rede pendurada não trava o deploy — e falhas transitórias são repetidas. Ambos os scripts são
 * idempotentes, então repetir é seguro. Ao final o processo encerra explicitamente (conexões penduradas não o
 * mantêm vivo).
 */
export async function runResilient(what: string, fn: () => Promise<void>, opts: { attempts?: number; timeoutMs?: number } = {}) {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? Number(process.env.DB_SCRIPT_TIMEOUT_MS ?? 120_000);
  for (let i = 1; i <= attempts; i++) {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`não terminou em ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      process.exit(0);
    } catch (e) {
      clearTimeout(timer);
      console.error(`${what}: tentativa ${i}/${attempts} falhou —`, e instanceof Error ? e.message : e);
      if (i === attempts) {
        console.error(e);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
}
