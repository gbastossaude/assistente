import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { hashEmbedding } from "../../packages/ai-core/src/providers/mock.ts";

export type ChatHandler = (body: { model: string; messages: Array<{ role: string; content: string }>; format?: unknown; think?: boolean }) => string;

/**
 * Servidor que imita os endpoints oficiais do Ollama (/api/version, /api/tags, /api/embed, /api/chat)
 * para testar o cliente HTTP real e o worker sem baixar modelos.
 */
export class MockOllama {
  server!: Server;
  url = "";
  mode: "ok" | "down" | "error500" | "missing_model" = "ok";
  dims = 1024;
  models = ["qwen3:4b", "bge-m3:latest"];
  chatCalls: Array<Record<string, unknown>> = [];
  embedCalls = 0;
  chat: ChatHandler = defaultGroundedChat;

  async start(): Promise<this> {
    this.server = createServer(async (req, res) => {
      if (this.mode === "down") return void req.socket.destroy();
      if (this.mode === "error500") return void res.writeHead(500).end("internal error");
      const body = await readBody(req);
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/version") return void res.end(JSON.stringify({ version: "0.12.0-mock" }));
      if (req.url === "/api/tags") return void res.end(JSON.stringify({ models: this.models.map((name) => ({ name, size: 1, details: {} })) }));
      if (this.mode === "missing_model") return void res.writeHead(404).end(JSON.stringify({ error: "model 'qwen3:4b' not found" }));
      if (req.url === "/api/embed") {
        this.embedCalls++;
        const input: string[] = Array.isArray(body.input) ? body.input : [body.input];
        return void res.end(JSON.stringify({ model: body.model, embeddings: input.map((t) => hashEmbedding(t, this.dims)) }));
      }
      if (req.url === "/api/chat") {
        this.chatCalls.push(body);
        let content: string;
        try {
          content = this.chat(body);
        } catch (err) {
          return void res.writeHead(500).end(JSON.stringify({ error: (err as Error).message }));
        }
        return void res.end(JSON.stringify({ model: body.model, message: { role: "assistant", content }, done: true, prompt_eval_count: 100, eval_count: 50 }));
      }
      res.writeHead(404).end("{}");
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop() {
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const words = (t: string) =>
  new Set(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Resposta "fiel": copia do trecho [1] a frase mais relacionada à pergunta e a cita (passa na validação). */
export const defaultGroundedChat: ChatHandler = (body) => {
  const user = body.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const m = /<trecho n="1"[^>]*>\n([\s\S]*?)\n<\/trecho>/.exec(user);
  if (!m) return JSON.stringify({ status: "sem_fonte", resposta: "", fontes: [] });
  const q = words(/PERGUNTA DO COLABORADOR: (.*)/.exec(user)?.[1] ?? "");
  const sentences = m[1].split(/(?<=[.!?])\s+|\n/).map((x) => x.trim()).filter(Boolean);
  const best = sentences
    .map((sentence) => ({ sentence, score: [...words(sentence)].filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score)[0].sentence;
  return JSON.stringify({ status: "respondida", resposta: `${best} [1]`, fontes: [1] });
};
