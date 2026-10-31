/**
 * Testes de interface ponta a ponta: navegador real (Chromium) + painel + extensão MV3 + worker real,
 * sobre Auth (GoTrue) e API (PostgREST) oficiais do Supabase em Docker. O Ollama e a Graph API são simulados.
 * Requer: Docker com as imagens supabase/gotrue e postgrest/postgrest e PostgreSQL local com pgvector.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { Server } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseWorkerRepository } from "../../apps/local-worker/src/repository.ts";
import { LocalWorker } from "../../apps/local-worker/src/worker.ts";
import { canConnect } from "../helpers/db.ts";
import { makePdf } from "../helpers/files.ts";
import { MockOllama } from "../helpers/mock-ollama.ts";
import { ANON_KEY, dockerAvailable, GATEWAY_URL, startStack, type Stack } from "./stack.ts";
import { serveStatic } from "./static-server.ts";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "../..");
const CACHE = path.join(ROOT, "node_modules/.cache/e2e");
const SHOTS = process.env.E2E_SCREENSHOTS ?? path.join(CACHE, "screenshots");
const ADMIN_PORT = 5180;
const ADMIN_URL = `http://127.0.0.1:${ADMIN_PORT}`;
const PASS = "Senha-Forte-123!";
const enabled = (await canConnect()) && dockerAvailable();
const silent = { info() {}, warn() {}, error() {}, debug() {} };

function build(app: string, outDir: string) {
  execFileSync("npx", ["vite", "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"], {
    cwd: path.join(ROOT, "apps", app), stdio: "pipe",
    env: { ...process.env, VITE_SUPABASE_URL: GATEWAY_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
  });
}

describe.skipIf(!enabled)("Interface ponta a ponta (navegador real + Supabase Auth/PostgREST)", () => {
  let stack: Stack;
  let ollama: MockOllama;
  let worker: LocalWorker;
  let adminServer: Server;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any;
  let extId = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    stack = await startStack();
    await stack.pool.query(`update public.system_settings set value = value || '{"min_vector_similarity": 0.2}' where key = 'ai'`);
    ids.admin = await stack.createUser("admin@corretora.test", PASS, "admin", "Ana Administradora");
    ids.editor = await stack.createUser("editor@corretora.test", PASS, "editor", "Edu Editor");
    ids.colab = await stack.createUser("colab@corretora.test", PASS, "colaborador", "Carla Colaboradora");
    await stack.createUser("worker@corretora.test", PASS, "worker", "Worker Escritório");

    ollama = await new MockOllama().start();
    const cfg = {
      supabaseUrl: GATEWAY_URL, supabaseAnonKey: ANON_KEY, workerEmail: "worker@corretora.test", workerPassword: PASS, workerId: "worker-e2e",
      machineName: "pc-escritorio", ollamaUrl: ollama.url, chatModel: "qwen3:4b", embeddingModel: "bge-m3", embeddingDimensions: 1024,
      answerConcurrency: 1, indexConcurrency: 1, pollSeconds: 2, ocrEnabled: false, ocrLanguage: "por", logDir: "", logLevel: "error" as const,
      whatsappFunctionName: "whatsapp-send",
    };
    const repo = new SupabaseWorkerRepository(cfg);
    await repo.signIn();
    worker = new LocalWorker(cfg, repo, silent);
    await worker.start();

    build("admin", path.join(CACHE, "admin"));
    build("chrome-extension", path.join(CACHE, "extension"));
    adminServer = await serveStatic(path.join(CACHE, "admin"), ADMIN_PORT);

    const { chromium } = require("playwright");
    const ext = path.join(CACHE, "extension");
    ctx = await chromium.launchPersistentContext("", {
      headless: true, channel: "chromium", viewport: { width: 1440, height: 900 }, locale: "pt-BR",
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker");
    extId = new URL(sw.url()).host;
  }, 600_000);

  afterAll(async () => {
    await worker?.stop(2000);
    await ctx?.close();
    adminServer?.close();
    await ollama?.stop();
    await stack?.stop();
  });

  async function adminLogin(email: string) {
    const page = await ctx.newPage();
    await page.goto(ADMIN_URL);
    // Cada cenário começa sem sessão (o contexto do navegador é compartilhado entre as abas).
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(PASS);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    return page;
  }

  it("login com senha errada mostra erro amigável", async () => {
    const page = await ctx.newPage();
    await page.goto(ADMIN_URL);
    await page.screenshot({ path: path.join(SHOTS, "painel-login.png") });
    await page.getByLabel("E-mail").fill("admin@corretora.test");
    await page.getByLabel("Senha").fill("errada-123");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByText("E-mail ou senha inválidos.").waitFor();
    await page.close();
  });

  it("administrador vê o dashboard com o worker online", async () => {
    const page = await adminLogin("admin@corretora.test");
    await page.getByRole("heading", { name: "Dashboard" }).waitFor();
    await page.getByText("pc-escritorio").waitFor({ timeout: 30_000 });
    await page.getByText("Ollama OK").waitFor();
    await page.getByText("Utilização do WhatsApp (mês atual)").waitFor();
    await page.screenshot({ path: path.join(SHOTS, "painel-dashboard.png"), fullPage: true });
    await page.close();
  });

  it("editor envia um PDF pelo painel; o worker indexa e o documento fica ativo", async () => {
    const page = await adminLogin("editor@corretora.test");
    await page.getByRole("link", { name: "Documentos" }).click();
    await page.getByRole("button", { name: "Novo documento" }).click();
    await page.getByLabel("Título *").fill("Manual Comercial PME Bradesco 2026");
    await page.getByLabel("Operadora / seguradora").selectOption({ label: "Bradesco Saúde" });
    await page.getByLabel("Categoria do documento").selectOption("regras_elegibilidade");
    await page.getByRole("button", { name: "PME" }).click();
    await page.getByLabel("Abrangência geográfica").selectOption("nacional");
    await page.getByLabel("Válido até").fill("2027-12-31");
    await page.getByLabel("Arquivo *").setInputFiles({
      name: "manual-pme-bradesco.pdf", mimeType: "application/pdf",
      buffer: Buffer.from(makePdf(["Manual Comercial Bradesco Saude PME", "ELEGIBILIDADE\nA Bradesco aceita empresas PME a partir de 3 vidas, com pelo menos 1 titular socio."])),
    });
    await page.screenshot({ path: path.join(SHOTS, "painel-novo-documento.png") });
    await page.getByRole("button", { name: "Salvar e enviar" }).click();
    await page.getByText("Documento enviado").waitFor();
    // O worker (rodando em segundo plano) baixa do Storage, extrai, gera embeddings e ativa.
    try {
      await expect.poll(async () => (await stack.pool.query("select status from public.knowledge_documents where title like 'Manual Comercial PME%'")).rows[0]?.status, { timeout: 60_000 }).toBe("ativo");
    } catch (err) {
      const state = await stack.pool.query(`select d.status doc, v.status ver, v.error_message, j.status job, j.attempts, j.last_error
        from public.knowledge_documents d left join public.document_versions v on v.document_id = d.id left join public.processing_jobs j on j.document_version_id = v.id
        where d.title like 'Manual Comercial PME%'`);
      console.error("estado da indexação:", JSON.stringify(state.rows), "worker:", JSON.stringify(worker.state));
      throw err;
    }
    await page.keyboard.press("Escape");
    await page.reload();
    const row = page.getByRole("row", { name: /Manual Comercial PME Bradesco 2026/ });
    await row.getByText("Ativo", { exact: true }).waitFor();
    await row.getByText(/v1 · \d+ trechos/).waitFor();
    await page.screenshot({ path: path.join(SHOTS, "painel-documentos.png") });
    await page.close();
  });

  it("colaborador consulta pela extensão: resposta com fonte, favorito, feedback e histórico", async () => {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 400, height: 860 });
    await page.goto(`chrome-extension://${extId}/sidepanel.html`);
    await page.getByLabel("E-mail").fill("colab@corretora.test");
    await page.getByLabel("Senha").fill(PASS);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByText("IA online").waitFor({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SHOTS, "extensao-inicio.png") });
    await page.getByLabel("Sua pergunta").fill("A Bradesco aceita empresa PME com 3 vidas?");
    await page.getByRole("button", { name: "Enviar pergunta" }).click();
    await page.getByText("Fontes").waitFor({ timeout: 60_000 });
    await page.getByText("Respondida").waitFor();
    await expect(page.getByText(/3 vidas/).first()).toBeTruthy();
    await page.getByText("Manual Comercial PME Bradesco 2026").waitFor();
    await page.screenshot({ path: path.join(SHOTS, "extensao-resposta.png"), fullPage: true });
    await page.getByRole("button", { name: "Adicionar aos favoritos" }).click();
    await page.getByRole("button", { name: "Útil" }).click();
    await page.getByText("Obrigado!").waitFor();
    await page.getByRole("tab", { name: "Favoritos" }).click();
    await page.getByText("A Bradesco aceita empresa PME com 3 vidas?").waitFor();
    const fb = await stack.pool.query("select rating from public.feedback");
    expect(fb.rows[0].rating).toBe("util");
    await page.close();
  });

  it("pergunta sem documento mostra a mensagem padrão na extensão", async () => {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/sidepanel.html`);
    await page.getByLabel("Sua pergunta").fill("Qual o reembolso de psicologia da Alice?");
    await page.getByRole("button", { name: "Enviar pergunta" }).click();
    await page.getByText("Não encontrei uma regra atualizada e confirmada na nossa base de conhecimento.").waitFor({ timeout: 60_000 });
    await page.getByText("Sem fonte confiável").waitFor();
    await page.close();
  });

  it("colaborador no painel só acessa a consulta; rotas administrativas redirecionam", async () => {
    const page = await adminLogin("colab@corretora.test");
    await page.getByRole("heading", { name: "Consultar o especialista" }).waitFor();
    expect(await page.getByRole("link", { name: "Documentos" }).count()).toBe(0);
    await page.goto(`${ADMIN_URL}/configuracoes`);
    await page.getByRole("heading", { name: "Consultar o especialista" }).waitFor();
    await page.close();
  });

  it("acesso indevido pela API é bloqueado (RLS e Storage)", async () => {
    const sb = createClient(GATEWAY_URL, ANON_KEY, { auth: { persistSession: false } });
    await sb.auth.signInWithPassword({ email: "colab@corretora.test", password: PASS });
    const docs = await sb.from("knowledge_documents").select("*");
    expect(docs.data).toEqual([]);
    const up = await sb.storage.from("knowledge").upload("intruso.txt", new Blob(["x"], { type: "text/plain" }), { contentType: "text/plain" });
    expect(up.error).toBeTruthy();
    const esc = await sb.from("profiles").update({ role: "admin" }).eq("id", ids.colab).select();
    expect(esc.data).toEqual([]);
    const fn = await sb.functions.invoke("admin-users", { body: { action: "create", email: "x@x.test", role: "admin" } });
    expect(fn.error).toBeTruthy();
  });

  it("administrador cria um colaborador pelo painel e recebe a senha temporária uma única vez", async () => {
    const page = await adminLogin("admin@corretora.test");
    await page.getByRole("link", { name: "Colaboradores" }).click();
    await page.getByRole("button", { name: "Novo acesso" }).click();
    await page.getByLabel("Nome").fill("Novo Vendedor");
    await page.getByLabel("E-mail *").fill("vendedor@corretora.test");
    await page.getByRole("button", { name: "Criar" }).click();
    await page.getByText("Senha temporária").first().waitFor();
    const temp = await page.getByRole("textbox", { name: "Senha temporária" }).inputValue();
    expect(temp.length).toBeGreaterThan(20);
    await page.screenshot({ path: path.join(SHOTS, "painel-colaboradores.png") });
    const sb = createClient(GATEWAY_URL, ANON_KEY, { auth: { persistSession: false } });
    const login = await sb.auth.signInWithPassword({ email: "vendedor@corretora.test", password: temp });
    expect(login.error).toBeNull();
    await page.close();
  });

  it("perguntas recebidas aparecem para o editor com status e detalhes", async () => {
    const page = await adminLogin("editor@corretora.test");
    await page.getByRole("link", { name: "Perguntas" }).click();
    await page.getByText("A Bradesco aceita empresa PME com 3 vidas?").waitFor();
    await page.getByRole("tab", { name: "Sem resposta" }).click();
    await page.getByText("Qual o reembolso de psicologia da Alice?").waitFor();
    await page.screenshot({ path: path.join(SHOTS, "painel-perguntas.png") });
    await page.close();
  });
});
