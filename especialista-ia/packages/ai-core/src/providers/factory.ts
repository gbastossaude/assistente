import { FreeModeViolationError, type ChatProvider, type EmbeddingProvider } from "../types.ts";
import { OllamaChatProvider, OllamaClient, OllamaEmbeddingProvider } from "./ollama.ts";
import { OpenAICompatibleChatProvider, OpenAICompatibleEmbeddingProvider } from "./openai-compatible.ts";

export interface ProviderConfig {
  /** "gratuito" (padrão) só aceita inferência local. */
  mode: "gratuito" | "pago";
  provider: "ollama" | "openai-compatible";
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  ollamaUrl?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface Providers {
  chat: ChatProvider;
  embedder: EmbeddingProvider;
  ollama?: OllamaClient;
}

export function createProviders(cfg: ProviderConfig): Providers {
  if (cfg.provider === "ollama") {
    const ollama = new OllamaClient({ baseUrl: cfg.ollamaUrl, fetchImpl: cfg.fetchImpl });
    return {
      ollama,
      chat: new OllamaChatProvider(ollama, cfg.chatModel),
      embedder: new OllamaEmbeddingProvider(ollama, cfg.embeddingModel, cfg.embeddingDimensions),
    };
  }
  if (!cfg.openaiBaseUrl) throw new FreeModeViolationError("openaiBaseUrl é obrigatório para o provedor openai-compatible.");
  const chat = new OpenAICompatibleChatProvider(cfg.openaiBaseUrl, cfg.chatModel, cfg.openaiApiKey, cfg.fetchImpl);
  const embedder = new OpenAICompatibleEmbeddingProvider(
    cfg.openaiBaseUrl, cfg.embeddingModel, cfg.embeddingDimensions, cfg.openaiApiKey, cfg.fetchImpl);
  if (cfg.mode === "gratuito" && (!chat.local || !embedder.local)) {
    throw new FreeModeViolationError(
      "Modo gratuito ativo: provedores de IA em nuvem estão bloqueados para evitar cobrança e envio de dados a terceiros.",
    );
  }
  return { chat, embedder };
}
