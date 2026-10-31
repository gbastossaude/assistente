import {
  AiUnavailableError,
  type ChatMessage,
  type ChatOptions,
  type ChatProvider,
  type ChatResult,
  type EmbeddingProvider,
} from "../types.ts";

/**
 * Provedor para APIs compatíveis com o formato OpenAI (serviços pagos futuros ou servidores locais
 * como LM Studio/vLLM). No modo "gratuito" a fábrica só permite este provedor quando a URL é local.
 * Mantido aqui para que a troca de provedor não exija reescrever o motor de respostas.
 */
export class OpenAICompatibleChatProvider implements ChatProvider {
  readonly name = "openai-compatible";
  readonly local: boolean;
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const host = new URL(baseUrl).hostname;
    this.local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const started = Date.now();
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.1,
        response_format: options.jsonSchema
          ? { type: "json_schema", json_schema: { name: "resposta", schema: options.jsonSchema } }
          : undefined,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    }).catch((err) => {
      throw new AiUnavailableError("Provedor de IA indisponível.", err);
    });
    if (!res.ok) throw new AiUnavailableError(`Provedor respondeu HTTP ${res.status}.`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    return { content: data.choices?.[0]?.message?.content ?? "", model: data.model ?? this.model, durationMs: Date.now() - started };
  }
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai-compatible";
  readonly local: boolean;
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    readonly dimensions: number,
    private readonly apiKey: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const host = new URL(baseUrl).hostname;
    this.local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(120_000),
    }).catch((err) => {
      throw new AiUnavailableError("Provedor de embeddings indisponível.", err);
    });
    if (!res.ok) throw new AiUnavailableError(`Provedor de embeddings respondeu HTTP ${res.status}.`);
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return (data.data ?? []).map((d) => d.embedding);
  }
}
