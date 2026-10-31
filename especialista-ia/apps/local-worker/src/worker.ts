import {
  AiUnavailableError,
  answerSettingsFromServer,
  createProviders,
  type ChatProvider,
  type EmbeddingProvider,
  type OllamaClient,
} from "@especialista/ai-core";
import type { ProcessingJobRow } from "@especialista/shared";
import type { WorkerConfig } from "./config.ts";
import { processAnswerJob } from "./jobs/answer.ts";
import { PermanentJobError, processFaqJob, processIndexJob } from "./jobs/index-document.ts";
import type { ServerConfig, WorkerRepository } from "./repository.ts";

export const WORKER_VERSION = "0.1.0";

type Log = { debug?: (m: string, meta?: Record<string, unknown>) => void; info: (m: string, meta?: Record<string, unknown>) => void; warn: (m: string, meta?: Record<string, unknown>) => void; error: (m: string, meta?: Record<string, unknown>) => void };

export interface ProvidersBundle {
  chat: ChatProvider;
  embedder: EmbeddingProvider;
  ollama?: OllamaClient;
  health: () => Promise<{ ok: boolean; missing: string[]; error?: string }>;
}

export type ProviderFactory = (models: { chat: string; embedding: string; dimensions: number; mode: string; provider: string }) => ProvidersBundle;

export const defaultProviderFactory = (cfg: WorkerConfig): ProviderFactory => (m) => {
  const p = createProviders({
    mode: m.mode === "pago" ? "pago" : "gratuito",
    provider: "ollama",
    chatModel: m.chat,
    embeddingModel: m.embedding,
    embeddingDimensions: m.dimensions,
    ollamaUrl: cfg.ollamaUrl,
  });
  return { ...p, health: () => p.ollama!.health([m.chat, m.embedding]) };
};

interface Lane {
  name: "answer" | "index";
  types: string[];
  concurrency: number;
  running: number;
}

/**
 * Worker local: consome a fila do Supabase, gera respostas com o Ollama e indexa documentos.
 * Se o computador desligar, as tarefas ficam pendentes e os bloqueios vencidos são recuperados ao religar.
 */
export class LocalWorker {
  private server: ServerConfig = {};
  private providers!: ProvidersBundle;
  private providerKey = "";
  private aiOk = false;
  private lastError: string | null = null;
  private jobsDone = 0;
  private stopping = false;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private inflight = new Set<Promise<void>>();
  private lastPurge = 0;
  private lastFlush = 0;
  private readonly lanes: Lane[];

  constructor(
    private readonly cfg: WorkerConfig,
    private readonly repo: WorkerRepository,
    private readonly log: Log,
    private readonly providerFactory: ProviderFactory = defaultProviderFactory(cfg),
  ) {
    this.lanes = [
      { name: "answer", types: ["answer_question"], concurrency: cfg.answerConcurrency, running: 0 },
      { name: "index", types: ["index_document", "index_faq"], concurrency: cfg.indexConcurrency, running: 0 },
    ];
  }

  private get lockSeconds(): number {
    return Number(this.server.worker?.lock_seconds ?? 300);
  }

  /** (Re)cria os provedores se o modelo configurado no painel mudar. */
  private ensureProviders() {
    const ai = this.server.ai ?? {};
    const models = {
      chat: String(ai.chat_model ?? this.cfg.chatModel),
      embedding: String(ai.embedding_model ?? this.cfg.embeddingModel),
      dimensions: Number(ai.embedding_dimensions ?? this.cfg.embeddingDimensions),
      mode: String(ai.mode ?? "gratuito"),
      provider: String(ai.provider ?? "ollama"),
    };
    const key = JSON.stringify(models);
    if (key !== this.providerKey) {
      this.providers = this.providerFactory(models);
      this.providerKey = key;
      this.log.info("modelos de IA configurados", { chat: models.chat, embedding: models.embedding });
    }
  }

  async heartbeat(status: "online" | "ocupado" | "parando" = "online"): Promise<void> {
    try {
      if (!this.providers) this.ensureProviders();
      const health = await this.providers.health();
      this.aiOk = health.ok;
      if (!health.ok) this.lastError = health.error ?? `Modelos ausentes no Ollama: ${health.missing.join(", ")}`;
      const running = this.lanes.reduce((s, l) => s + l.running, 0);
      this.server = await this.repo.heartbeat({
        machine_name: this.cfg.machineName,
        app_version: WORKER_VERSION,
        status: status === "online" && running > 0 ? "ocupado" : status,
        ollama_ok: this.aiOk,
        chat_model: this.providers.chat.model,
        embedding_model: this.providers.embedder.model,
        jobs_running: running,
        jobs_done: this.jobsDone,
        last_error: this.aiOk ? null : this.lastError,
        details: { missing_models: health.missing },
      });
      this.ensureProviders();
    } catch (err) {
      this.log.warn("heartbeat falhou (sem conexão com o Supabase?)", { error: (err as Error).message });
    }
  }

  async start(): Promise<void> {
    await this.heartbeat();
    if (!this.aiOk) this.log.warn("IA local indisponível: perguntas ficarão na fila até o Ollama responder", { error: this.lastError });
    const hb = Number(this.server.worker?.heartbeat_seconds ?? 30) * 1000;
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), hb);
    try {
      this.unsubscribe = this.repo.onNewJob(() => this.wake(200));
    } catch (err) {
      this.log.warn("realtime indisponível; usando apenas consulta periódica", { error: (err as Error).message });
    }
    this.log.info("worker iniciado", { worker: this.cfg.workerId, poll_s: this.cfg.pollSeconds });
    this.wake(0);
  }

  wake(delayMs: number) {
    if (this.stopping) return;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = setTimeout(() => void this.tick(), delayMs);
  }

  /** Um ciclo: tarefas de manutenção + reivindicação de tarefas para cada raia com vaga. */
  async tick(): Promise<number> {
    let claimed = 0;
    try {
      await this.maintenance();
      for (const lane of this.lanes) {
        const free = lane.concurrency - lane.running;
        if (free <= 0) continue;
        // Sem IA disponível não consumimos tentativas: as tarefas aguardam na fila.
        if (!this.aiOk) continue;
        const jobs = await this.repo.claimJobs(lane.types, free, this.lockSeconds);
        claimed += jobs.length;
        for (const job of jobs) this.track(lane, job);
      }
    } catch (err) {
      this.log.warn("falha ao consultar a fila", { error: (err as Error).message });
    } finally {
      this.wake(claimed > 0 ? 500 : this.cfg.pollSeconds * 1000);
    }
    return claimed;
  }

  private track(lane: Lane, job: ProcessingJobRow) {
    lane.running++;
    const p = this.runJob(job).finally(() => {
      lane.running--;
      this.inflight.delete(p);
      this.wake(100);
    });
    this.inflight.add(p);
  }

  async runJob(job: ProcessingJobRow): Promise<void> {
    const started = Date.now();
    try {
      this.ensureProviders();
      const settings = answerSettingsFromServer(this.server);
      if (job.type === "answer_question") {
        const r = await processAnswerJob(job, {
          repo: this.repo,
          logger: this.log,
          buildDeps: async () => ({
            chat: this.providers.chat,
            embedder: this.providers.embedder,
            catalog: await this.repo.getCatalog(),
            rules: await this.repo.getRules(),
            settings: { ...settings, embeddingModel: this.providers.embedder.model },
            logger: this.log,
          }),
        });
        this.log.info("pergunta processada", { job: job.id, outcome: r.outcome, whatsapp: r.whatsapp, ms: Date.now() - started });
      } else if (job.type === "index_document") {
        const docs = this.server.documents ?? {};
        const r = await processIndexJob(job, {
          repo: this.repo,
          embedder: this.providers.embedder,
          chunkSize: Number(docs.chunk_size ?? 1200),
          chunkOverlap: Number(docs.chunk_overlap ?? 200),
          minCharsPerPage: Number(docs.min_chars_per_page ?? 40),
          ocrEnabled: this.cfg.ocrEnabled,
          ocrLanguage: this.cfg.ocrLanguage,
          lockSeconds: this.lockSeconds,
          logger: this.log,
        });
        this.log.info("documento indexado", { job: job.id, status: r.status, chunks: r.chunks, ms: Date.now() - started });
      } else if (job.type === "index_faq") {
        await processFaqJob(job, { repo: this.repo, embedder: this.providers.embedder });
        this.log.info("FAQ indexada", { job: job.id, ms: Date.now() - started });
      }
      this.jobsDone++;
    } catch (err) {
      const retryable = err instanceof AiUnavailableError || !(err instanceof PermanentJobError);
      if (err instanceof AiUnavailableError) this.aiOk = false;
      this.lastError = (err as Error).message;
      this.log.error("falha na tarefa", { job: job.id, type: job.type, retryable, error: (err as Error).message });
      try {
        await this.repo.failJob(job.id, (err as Error).message, retryable);
      } catch (e) {
        this.log.error("não foi possível registrar a falha (o bloqueio vencerá e a tarefa será retomada)", { job: job.id, error: (e as Error).message });
      }
    }
  }

  private async maintenance() {
    const now = Date.now();
    // Reenvio de respostas do WhatsApp cujo envio falhou (dentro da janela de 24 h) — a cada 5 min.
    if (now - this.lastFlush > 5 * 60_000) {
      this.lastFlush = now;
      const r = await this.repo.notifyWhatsapp({ action: "flush" });
      if (!r.ok) this.log.debug?.("flush do WhatsApp não executado", { error: r.error });
    }
    // Retenção diária (garantia caso o pg_cron não esteja disponível no projeto).
    if (now - this.lastPurge > 24 * 3600_000) {
      this.lastPurge = now;
      try {
        await this.repo.purgeExpired();
      } catch (err) {
        this.log.warn("retenção não executada", { error: (err as Error).message });
      }
    }
  }

  /** Para de pegar tarefas, espera as em andamento (até o limite) e devolve as restantes à fila. */
  async stop(graceMs = 20_000): Promise<void> {
    this.stopping = true;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.unsubscribe?.();
    const timeout = new Promise((r) => setTimeout(r, graceMs));
    await Promise.race([Promise.allSettled([...this.inflight]), timeout]);
    try {
      const released = await this.repo.releaseJobs();
      this.log.info("worker encerrado", { tarefas_devolvidas: released });
    } catch (err) {
      this.log.warn("não foi possível devolver as tarefas; os bloqueios vencerão automaticamente", { error: (err as Error).message });
    }
  }

  /** Processa o que houver na fila e retorna (útil para testes e execução agendada). */
  async runOnce(maxRounds = 50): Promise<number> {
    await this.heartbeat();
    let total = 0;
    for (let i = 0; i < maxRounds; i++) {
      let claimed = 0;
      for (const lane of this.lanes) {
        if (!this.aiOk) break;
        const jobs = await this.repo.claimJobs(lane.types, lane.concurrency, this.lockSeconds);
        claimed += jobs.length;
        await Promise.all(jobs.map((j) => this.runJob(j)));
      }
      total += claimed;
      if (claimed === 0) break;
    }
    return total;
  }

  get state() {
    return { aiOk: this.aiOk, jobsDone: this.jobsDone, lastError: this.lastError, stopping: this.stopping };
  }
}
