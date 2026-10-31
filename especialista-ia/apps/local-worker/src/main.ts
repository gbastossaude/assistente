import { ConfigError, loadConfig } from "./config.ts";
import { runDoctor } from "./doctor.ts";
import { createLogger } from "./logger.ts";
import { SupabaseWorkerRepository } from "./repository.ts";
import { LocalWorker } from "./worker.ts";

async function main() {
  const cmd = process.argv[2] ?? "start";
  if (cmd === "doctor") {
    let ollamaUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
    let models = [process.env.OLLAMA_CHAT_MODEL ?? "qwen3:4b", process.env.OLLAMA_EMBEDDING_MODEL ?? "bge-m3"];
    try {
      const cfg = loadConfig();
      ollamaUrl = cfg.ollamaUrl;
      models = [cfg.chatModel, cfg.embeddingModel];
    } catch {
      /* diagnóstico funciona mesmo sem .env completo */
    }
    console.log(await runDoctor(ollamaUrl, models));
    return;
  }

  const cfg = loadConfig();
  const log = createLogger({ level: cfg.logLevel, dir: cfg.logDir });
  const repo = new SupabaseWorkerRepository(cfg);
  await repo.signIn();
  const worker = new LocalWorker(cfg, repo, log);

  if (cmd === "once") {
    const n = await worker.runOnce();
    log.info("execução única concluída", { tarefas: n });
    await repo.releaseJobs().catch(() => {});
    return;
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("encerrando", { signal });
    await worker.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (err) => log.error("erro não tratado", { error: String((err as Error)?.message ?? err) }));
  await worker.start();
}

main().catch((err) => {
  if (err instanceof ConfigError) console.error(`Configuração: ${err.message}`);
  else console.error(`Falha ao iniciar o worker: ${(err as Error).message}`);
  process.exit(1);
});
