import { hostname } from "node:os";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { assertLoopbackUrl } from "@especialista/ai-core";
import { EDGE_FUNCTIONS } from "@especialista/shared";

export interface WorkerConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  workerEmail: string;
  workerPassword: string;
  workerId: string;
  machineName: string;
  ollamaUrl: string;
  /** Modelos usados se o servidor ainda não respondeu com a configuração central. */
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  answerConcurrency: number;
  indexConcurrency: number;
  pollSeconds: number;
  ocrEnabled: boolean;
  ocrLanguage: string;
  logDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
  whatsappFunctionName: string;
}

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new ConfigError(`Variável ${key} não definida. Copie apps/local-worker/.env.example para .env e preencha.`);
  return v;
}

function int(env: NodeJS.ProcessEnv, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${key} deve ser um inteiro entre ${min} e ${max}.`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, envFile?: string): WorkerConfig {
  if (envFile !== undefined || env === process.env) {
    loadEnv({ path: envFile ?? path.resolve(import.meta.dirname, "../.env"), quiet: true });
  }
  const supabaseUrl = required(env, "SUPABASE_URL");
  if (!/^https:\/\//.test(supabaseUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)) {
    throw new ConfigError("SUPABASE_URL deve usar HTTPS.");
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConfigError(
      "Não use SUPABASE_SERVICE_ROLE_KEY no worker. Ele autentica com a conta de máquina (papel worker) de privilégio mínimo.",
    );
  }
  const ollamaUrl = env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434";
  assertLoopbackUrl(ollamaUrl);
  const workerId = (env.WORKER_ID?.trim() || `worker-${hostname()}`).replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 64);
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabaseAnonKey: required(env, "SUPABASE_ANON_KEY"),
    workerEmail: required(env, "WORKER_EMAIL"),
    workerPassword: required(env, "WORKER_PASSWORD"),
    workerId: workerId.length >= 3 ? workerId : `worker-${workerId}`,
    machineName: hostname().slice(0, 120),
    ollamaUrl,
    chatModel: env.OLLAMA_CHAT_MODEL?.trim() || "qwen3:4b",
    embeddingModel: env.OLLAMA_EMBEDDING_MODEL?.trim() || "bge-m3",
    embeddingDimensions: int(env, "EMBEDDING_DIMENSIONS", 1024, 64, 4096),
    answerConcurrency: int(env, "WORKER_CONCURRENCY", 1, 1, 4),
    indexConcurrency: 1,
    pollSeconds: int(env, "WORKER_POLL_SECONDS", 15, 3, 300),
    ocrEnabled: env.OCR_ENABLED === "true",
    ocrLanguage: env.OCR_LANGUAGE?.trim() || "por",
    logDir: env.LOG_DIR?.trim() || path.resolve(import.meta.dirname, "../logs"),
    logLevel: (["debug", "info", "warn", "error"].includes(env.LOG_LEVEL ?? "") ? env.LOG_LEVEL : "info") as WorkerConfig["logLevel"],
    whatsappFunctionName: env.WHATSAPP_SEND_FUNCTION?.trim() || EDGE_FUNCTIONS.send,
  };
}
