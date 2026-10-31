import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Logger } from "@especialista/ai-core";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

/** Campos que nunca vão para o log (conteúdo de perguntas, respostas, documentos e credenciais). */
const FORBIDDEN_KEYS = /^(text|text_redacted|content|question|answer|body|prompt|password|token|access_token|refresh_token|apikey|authorization|phone|wa_id|email)$/i;

export function sanitizeMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.test(k)) out[k] = "[omitido]";
    else if (typeof v === "string") out[k] = v.length > 300 ? v.slice(0, 300) + "…" : v;
    else out[k] = v;
  }
  return out;
}

export function createLogger(opts: { level?: Level; dir?: string; console?: boolean } = {}): Logger & { debug: Logger["info"] } {
  const min = LEVELS[opts.level ?? "info"];
  let fileReady = false;
  const write = (level: Level, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[level] < min) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...sanitizeMeta(meta) });
    if (opts.console !== false) (level === "error" || level === "warn" ? console.error : console.log)(line);
    if (opts.dir) {
      try {
        if (!fileReady) mkdirSync(opts.dir, { recursive: true }), (fileReady = true);
        appendFileSync(path.join(opts.dir, `worker-${new Date().toISOString().slice(0, 10)}.log`), line + "\n");
      } catch {
        /* log em arquivo é melhor esforço */
      }
    }
  };
  return {
    debug: (m, meta) => write("debug", m, meta),
    info: (m, meta) => write("info", m, meta),
    warn: (m, meta) => write("warn", m, meta),
    error: (m, meta) => write("error", m, meta),
  };
}
