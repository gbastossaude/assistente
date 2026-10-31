/**
 * Provedores simulados para testes automatizados (sem Ollama). Nunca usados em produção.
 */
import { AiUnavailableError, type ChatMessage, type ChatOptions, type ChatProvider, type ChatResult, type EmbeddingProvider } from "../types.ts";

export type ChatScript = (messages: ChatMessage[], options: ChatOptions, call: number) => string | Error;

export class MockChatProvider implements ChatProvider {
  readonly name = "mock";
  readonly local = true;
  calls: ChatMessage[][] = [];
  constructor(private readonly script: ChatScript, readonly model = "mock-chat") {}

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    this.calls.push(messages);
    const out = this.script(messages, options, this.calls.length);
    if (out instanceof Error) throw out;
    return { content: out, model: this.model, durationMs: 1 };
  }
}

/** Embeddings determinísticos por "saco de palavras" com hashing — suficientes para testes de ranking. */
export function hashEmbedding(text: string, dimensions = 64): number[] {
  const v = new Array<number>(dimensions).fill(0);
  const words = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  for (const w of words) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    v[Math.abs(h) % dimensions] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";
  readonly local = true;
  failing = false;
  constructor(readonly dimensions = 64, readonly model = "mock-embed") {}
  async embed(texts: string[]): Promise<number[][]> {
    if (this.failing) throw new AiUnavailableError("Ollama indisponível (simulado).");
    return texts.map((t) => hashEmbedding(t, this.dimensions));
  }
}
