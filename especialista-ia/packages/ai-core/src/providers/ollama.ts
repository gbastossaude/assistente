import {
  AiUnavailableError,
  FreeModeViolationError,
  type ChatMessage,
  type ChatOptions,
  type ChatProvider,
  type ChatResult,
  type EmbeddingProvider,
} from "../types.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** O Ollama só pode ser acessado pela própria máquina: a porta nunca é exposta publicamente. */
export function assertLoopbackUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new FreeModeViolationError(`OLLAMA_URL inválida: ${baseUrl}`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new FreeModeViolationError(
      `O Ollama deve ser acessado somente por 127.0.0.1/localhost (recebido: ${url.hostname}). Não exponha a porta 11434.`,
    );
  }
  return url;
}

/** Modelos com modo de raciocínio que aceitam `think: false` (respostas mais rápidas e só o JSON final). */
function supportsThinkFlag(model: string): boolean {
  return /^(qwen3|deepseek-r1|gpt-oss|magistral)/i.test(model);
}

/** Remove blocos <think> que alguns modelos emitem antes da resposta. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export interface OllamaClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  keepAlive?: string;
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  parameter_size?: string;
  family?: string;
}

export class OllamaClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  readonly keepAlive: string;

  constructor(opts: OllamaClientOptions = {}) {
    this.baseUrl = assertLoopbackUrl(opts.baseUrl ?? "http://127.0.0.1:11434").toString().replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.keepAlive = opts.keepAlive ?? "15m";
  }

  async request<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
    const timeout = AbortSignal.timeout(init.timeoutMs ?? 120_000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers: init.body ? { "content-type": "application/json" } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal,
      });
    } catch (err) {
      const reason = (err as Error)?.name === "TimeoutError" ? "tempo limite excedido" : "serviço não está respondendo";
      throw new AiUnavailableError(`Ollama indisponível (${reason}) em ${this.baseUrl}.`, err);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404 && /model/i.test(text)) {
        throw new AiUnavailableError(`Modelo não encontrado no Ollama. Execute "ollama pull <modelo>". Detalhe: ${text.slice(0, 200)}`);
      }
      throw new AiUnavailableError(`Ollama respondeu HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async version(timeoutMs = 3000): Promise<string> {
    const r = await this.request<{ version: string }>("/api/version", { timeoutMs });
    return r.version;
  }

  async listModels(timeoutMs = 5000): Promise<OllamaModelInfo[]> {
    const r = await this.request<{ models: Array<{ name: string; size: number; details?: { parameter_size?: string; family?: string } }> }>(
      "/api/tags",
      { timeoutMs },
    );
    return (r.models ?? []).map((m) => ({ name: m.name, size: m.size, parameter_size: m.details?.parameter_size, family: m.details?.family }));
  }

  /** Verifica se o serviço responde e se os modelos configurados estão baixados. */
  async health(models: string[]): Promise<{ ok: boolean; version?: string; missing: string[]; error?: string }> {
    try {
      const version = await this.version();
      const installed = await this.listModels();
      const names = installed.map((m) => m.name);
      const missing = models.filter((m) => !names.some((n) => n === m || n === `${m}:latest` || n.split(":")[0] === m));
      return { ok: missing.length === 0, version, missing };
    } catch (err) {
      return { ok: false, missing: models, error: (err as Error).message };
    }
  }
}

export class OllamaChatProvider implements ChatProvider {
  readonly name = "ollama";
  readonly local = true;
  constructor(private readonly client: OllamaClient, readonly model: string) {}

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const started = Date.now();
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      keep_alive: this.client.keepAlive,
      options: { temperature: options.temperature ?? 0.1, num_ctx: options.numCtx ?? 8192 },
    };
    if (options.jsonSchema) body.format = options.jsonSchema;
    if (supportsThinkFlag(this.model)) body.think = false;
    const r = await this.client.request<{
      message?: { content?: string };
      model?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    }>("/api/chat", { body, timeoutMs: options.timeoutMs, signal: options.signal });
    return {
      content: stripThinking(r.message?.content ?? ""),
      model: r.model ?? this.model,
      durationMs: Date.now() - started,
      promptTokens: r.prompt_eval_count,
      outputTokens: r.eval_count,
    };
  }
}

/** Prefixos recomendados por alguns modelos de embeddings (ex.: nomic-embed-text). */
export function embeddingPrefixes(model: string): { query: string; document: string } {
  if (/nomic-embed/i.test(model)) return { query: "search_query: ", document: "search_document: " };
  return { query: "", document: "" };
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly local = true;
  constructor(private readonly client: OllamaClient, readonly model: string, readonly dimensions: number) {}

  async embed(texts: string[], kind: "query" | "document", options: { timeoutMs?: number } = {}): Promise<number[][]> {
    if (texts.length === 0) return [];
    const prefix = embeddingPrefixes(this.model)[kind];
    const r = await this.client.request<{ embeddings?: number[][] }>("/api/embed", {
      body: { model: this.model, input: texts.map((t) => prefix + t), truncate: true, keep_alive: this.client.keepAlive },
      timeoutMs: options.timeoutMs ?? 120_000,
    });
    const embeddings = r.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new AiUnavailableError(`Ollama retornou ${embeddings.length} embeddings para ${texts.length} textos.`);
    }
    for (const e of embeddings) {
      if (e.length !== this.dimensions) {
        throw new FreeModeViolationError(
          `O modelo ${this.model} gera vetores de ${e.length} dimensões, mas o banco está configurado para ${this.dimensions}. ` +
            `Ajuste "embedding_dimensions" e a coluna vector (scripts/sql/alterar-dimensao-embeddings.sql).`,
        );
      }
    }
    return embeddings;
  }
}
