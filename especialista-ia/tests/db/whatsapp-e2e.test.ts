import { createHash } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WorkerConfig } from "../../apps/local-worker/src/config.ts";
import { LocalWorker } from "../../apps/local-worker/src/worker.ts";
import { MetaCloudApi } from "../../supabase/functions/_shared/meta-api.ts";
import { computeSignature } from "../../supabase/functions/_shared/signature.ts";
import { createRpcWhatsAppDb } from "../../supabase/functions/_shared/whatsapp-db.ts";
import { flushPendingAnswers, handleWebhook, MESSAGES, sendAnswer, sendHumanReply, type CoreDeps } from "../../supabase/functions/_shared/whatsapp-core.ts";
import { asUser, canConnect, createUser, resetDatabase } from "../helpers/db.ts";
import { makePdf } from "../helpers/files.ts";
import { MockOllama } from "../helpers/mock-ollama.ts";
import { pgRpc } from "../helpers/pg-rpc.ts";
import { PgWorkerRepository } from "../helpers/pg-worker-repo.ts";

const available = await canConnect();
const silent = { info() {}, warn() {}, error() {}, debug() {} };
const APP_SECRET = "segredo-do-app-meta";
const PN = "109876543210";
const COLAB_PHONE = "5511987654321";

describe.skipIf(!available)("Ponta a ponta: bot oficial do WhatsApp (webhook → fila → worker → Cloud API simulada)", () => {
  let pool: pg.Pool;
  let ollama: MockOllama;
  let repo: PgWorkerRepository;
  let worker: LocalWorker;
  let deps: CoreDeps;
  let admin: string, colab: string;
  const graph = { sent: [] as Array<{ to: string; body: string }>, fail: false, seq: 0 };
  let ts = Math.floor(Date.now() / 1000);
  let msgSeq = 0;

  const textEvent = (from: string, body: string, opts: { id?: string; timestamp?: number; phoneNumberId?: string } = {}) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { display_phone_number: "551130000000", phone_number_id: opts.phoneNumberId ?? PN },
      contacts: [{ profile: { name: "Fulano" }, wa_id: from }],
      messages: [{ from, id: opts.id ?? `wamid.IN${++msgSeq}`, timestamp: String(opts.timestamp ?? ++ts), type: "text", text: { body } }],
    } }] }],
  });
  async function deliver(payload: unknown, secret = APP_SECRET) {
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    return handleWebhook(raw, await computeSignature(raw, secret), deps);
  }
  const lastSent = () => graph.sent.at(-1)!;
  const outMessages = async (kind?: string) =>
    (await pool.query(`select kind, status, error_code from public.whatsapp_messages where direction = 'out' ${kind ? "and kind = $1" : ""} order by created_at`, kind ? [kind] : [])).rows;
  const usage = async () => (await pool.query("select coalesce(sum(reserved),0)::int reserved, coalesce(sum(sent),0)::int sent, coalesce(sum(delivered),0)::int delivered, coalesce(sum(failed),0)::int failed, coalesce(sum(blocked),0)::int blocked from public.whatsapp_usage where phone_number_id = $1", [PN])).rows[0];

  beforeAll(async () => {
    pool = await resetDatabase(`${process.env.TEST_DB_NAME ?? "especialista_test"}_wa`);
    await pool.query(`update public.system_settings set value = value || '{"enabled": true, "monthly_cap": 900, "daily_cap": 500}' where key = 'whatsapp'`);
    await pool.query(`update public.system_settings set value = value || '{"min_vector_similarity": 0.2}' where key = 'ai'`);
    await pool.query(`update public.system_settings set value = value || '{"rate_limit_per_minute": 1000}' where key = 'security'`);
    admin = await createUser(pool, "admin@wa.test", "admin");
    colab = await createUser(pool, "colab@wa.test", "colaborador");
    await createUser(pool, "colab2@wa.test", "colaborador");
    const editor = await createUser(pool, "editor@wa.test", "editor");
    const workerUser = await createUser(pool, "worker@wa.test", "worker");
    // Número aprovado (com nono dígito); a Meta pode entregar o wa_id sem ele.
    await asUser(pool, admin, (db) => db.query("update public.profiles set whatsapp_phone = $1, whatsapp_approved = true, full_name = 'Colaboradora' where id = $2", [COLAB_PHONE, colab]));
    await asUser(pool, admin, (db) => db.query("update public.profiles set full_name = 'Ana Responsável' where id = $1", [admin]));

    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (graph.fail) return new Response(JSON.stringify({ error: { code: 131000, message: "Something went wrong" } }), { status: 500 });
      graph.sent.push({ to: body.to, body: body.text.body });
      return new Response(JSON.stringify({ messaging_product: "whatsapp", contacts: [{ wa_id: body.to }], messages: [{ id: `wamid.OUT${++graph.seq}` }] }), { status: 200 });
    }) as unknown as typeof fetch;
    deps = {
      db: createRpcWhatsAppDb(pgRpc(pool)),
      meta: new MetaCloudApi({ accessToken: "TOKEN", phoneNumberId: PN, fetchImpl, sleep: async () => {} }),
      config: { verifyToken: "verif", appSecret: APP_SECRET, phoneNumberId: PN },
    };

    ollama = await new MockOllama().start();
    repo = new PgWorkerRepository(pool, workerUser, "w-wa");
    // O worker chama a Edge Function whatsapp-send; aqui, a mesma lógica é chamada diretamente.
    repo.notifyWhatsapp = async (p) => {
      if (p.action === "flush") return { ok: true, status: JSON.stringify(await flushPendingAnswers(deps)) };
      const r = await sendAnswer(deps, p.question_id!);
      return { ok: true, status: r.status };
    };
    const cfg: WorkerConfig = {
      supabaseUrl: "http://127.0.0.1", supabaseAnonKey: "x", workerEmail: "w", workerPassword: "w", workerId: "w-wa", machineName: "t",
      ollamaUrl: ollama.url, chatModel: "qwen3:4b", embeddingModel: "bge-m3", embeddingDimensions: 1024, answerConcurrency: 1,
      indexConcurrency: 1, pollSeconds: 60, ocrEnabled: false, ocrLanguage: "por", logDir: "", logLevel: "error", whatsappFunctionName: "x",
    };
    worker = new LocalWorker(cfg, repo, silent);

    // Base de conhecimento: um manual indexado pelo próprio worker
    const bradesco = (await pool.query("select id from public.operators where slug = 'bradesco-saude'")).rows[0].id;
    const pdf = makePdf(["A Bradesco aceita empresas PME a partir de 3 vidas, com ao menos 1 titular socio."]);
    await asUser(pool, editor, async (db) => {
      const d = await db.query("insert into public.knowledge_documents (title, operator_id, category, is_national, valid_until) values ('Manual PME Bradesco', $1, 'regras_elegibilidade', true, '2027-12-31') returning id", [bradesco]);
      repo.storage.set("docs/b.pdf", pdf);
      await db.query("insert into public.document_versions (document_id, version_number, storage_path, file_name, mime_type, file_size, sha256) values ($1, 1, 'docs/b.pdf', 'b.pdf', 'application/pdf', $2, $3)",
        [d.rows[0].id, pdf.byteLength, createHash("sha256").update(pdf).digest("hex")]);
    });
    await worker.runOnce();
    await pool.query("delete from public.worker_heartbeats"); // começa "offline"
  });
  afterAll(async () => {
    await ollama?.stop();
    await pool?.end();
  });
  beforeEach(() => {
    graph.fail = false;
  });

  it("assinatura inválida é recusada sem gravar mensagem", async () => {
    const r = await deliver(textEvent(COLAB_PHONE, "teste"), "segredo-errado");
    expect(r.status).toBe(401);
    expect((await pool.query("select count(*)::int n from public.whatsapp_messages")).rows[0].n).toBe(0);
    const ev = await pool.query("select signature_valid, outcome from public.whatsapp_webhook_events");
    expect(ev.rows[0]).toEqual({ signature_valid: false, outcome: "assinatura_invalida" });
  });

  it("número não autorizado: nada é respondido nem armazenado", async () => {
    const r = await deliver(textEvent("5511911112222", "A Amil aceita 2 vidas?"));
    expect(r.status).toBe(200);
    expect(r.summary!.unauthorized).toBe(1);
    const m = await pool.query("select status, body_redacted, profile_id from public.whatsapp_messages where direction = 'in'");
    expect(m.rows[0]).toEqual({ status: "nao_autorizada", body_redacted: null, profile_id: null });
    expect((await pool.query("select count(*)::int n from public.questions")).rows[0].n).toBe(0);
    expect(graph.sent).toHaveLength(0);
  });

  it("colaborador autorizado (wa_id sem o nono dígito): pergunta minimizada vai para a fila; aviso de offline enviado", async () => {
    const r = await deliver(textEvent("551187654321", "Cliente CPF 529.982.247-25: a Bradesco aceita empresa PME com 3 vidas?"));
    expect(r.summary).toMatchObject({ queued: 1, messages: 1 });
    const q = await pool.query("select q.text_redacted, q.channel, q.status, j.expires_at > now() + interval '23 hours' as window_ok from public.questions q join public.processing_jobs j on j.question_id = q.id");
    expect(q.rows[0]).toMatchObject({ channel: "whatsapp", status: "pendente", window_ok: true });
    expect(q.rows[0].text_redacted).not.toContain("529.982");
    expect(graph.sent).toHaveLength(1);
    expect(lastSent()).toEqual({ to: "551187654321", body: MESSAGES.offline });
  });

  it("reentrega do mesmo evento não duplica a pergunta", async () => {
    const id = "wamid.REENTREGA";
    await deliver(textEvent(COLAB_PHONE, "Qual a carência para consultas na Bradesco?", { id }));
    const again = await deliver(textEvent(COLAB_PHONE, "Qual a carência para consultas na Bradesco?", { id }));
    expect(again.summary!.duplicates).toBe(1);
    const n = await pool.query("select count(*)::int n from public.whatsapp_messages where wa_message_id = $1", [id]);
    expect(n.rows[0].n).toBe(1);
  });

  it("worker responde e a resposta sai pela Cloud API com fontes, uma única vez", async () => {
    graph.sent = [];
    await worker.runOnce();
    const answered = graph.sent.find((s) => s.body.includes("3 vidas"));
    expect(answered).toBeTruthy();
    expect(answered!.body).toContain("*Fontes*");
    expect(answered!.body).toContain("[1] Manual PME Bradesco");
    expect(answered!.body).toContain("falar com responsável");
    const out = await outMessages("resposta");
    expect(out.every((m) => m.status === "enviada")).toBe(true);
    // Reprocessar não reenvia (idempotência por pergunta)
    const qid = (await pool.query("select id from public.questions where text_redacted like '%3 vidas%'")).rows[0].id;
    expect((await sendAnswer(deps, qid)).status).toBe("duplicada");
  });

  it("status de entrega da Meta atualiza a mensagem e o consumo", async () => {
    const wamid = (await pool.query("select wa_message_id from public.whatsapp_messages where direction = 'out' and kind = 'resposta' and wa_message_id is not null limit 1")).rows[0].wa_message_id;
    const statusEvent = { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: PN }, statuses: [{ id: wamid, status: "delivered", timestamp: String(ts), recipient_id: COLAB_PHONE,
        pricing: { billable: false, pricing_model: "PMP", category: "service" } }] } }] }] };
    const r = await deliver(statusEvent);
    expect(r.summary!.statuses).toBe(1);
    const m = await pool.query("select status, billable, pricing_category from public.whatsapp_messages where wa_message_id = $1", [wamid]);
    expect(m.rows[0]).toEqual({ status: "entregue", billable: false, pricing_category: "service" });
    expect((await usage()).delivered).toBe(1);
  });

  it("'falar com responsável' cria atendimento humano visível no painel; resposta humana é enviada", async () => {
    graph.sent = [];
    await deliver(textEvent(COLAB_PHONE, "Falar com responsável"));
    expect(lastSent().body).toBe(MESSAGES.handoff);
    await deliver(textEvent(COLAB_PHONE, "falar com responsavel"));
    expect(lastSent().body).toBe(MESSAGES.handoffExisting);
    const h = await asUser(pool, admin, (db) => db.query("select id, status, channel, profile_id from public.handoff_requests"));
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ status: "aberto", channel: "whatsapp", profile_id: colab });
    const r = await sendHumanReply(deps, h.rows[0].id, "Olá! Pode me ligar no ramal 200.", "Ana Responsável");
    expect(r.status).toBe("enviada");
    expect(lastSent().body).toBe("*Resposta de Ana Responsável*\nOlá! Pode me ligar no ramal 200.");
  });

  it("'oi' envia o menu de ajuda no máximo uma vez a cada 10 minutos", async () => {
    graph.sent = [];
    await deliver(textEvent(COLAB_PHONE, "Oi"));
    await deliver(textEvent(COLAB_PHONE, "oi!"));
    expect(graph.sent.filter((s) => s.body === MESSAGES.help)).toHaveLength(1);
  });

  it("mensagem que não é texto recebe orientação", async () => {
    graph.sent = [];
    const ev = textEvent(COLAB_PHONE, "");
    const msg = ev.entry[0].changes[0].value.messages[0] as Record<string, unknown>;
    msg.type = "image";
    delete msg.text;
    msg.image = { id: "MEDIA", mime_type: "image/jpeg" };
    await deliver(ev);
    expect(lastSent().body).toBe(MESSAGES.unsupported);
  });

  it("pedido de complemento: a próxima mensagem completa a pergunta original", async () => {
    await deliver(textEvent(COLAB_PHONE, "Qual o mínimo de vidas para contratar?"));
    graph.sent = [];
    await worker.runOnce();
    expect(lastSent().body).toContain("Qual operadora");
    await deliver(textEvent(COLAB_PHONE, "Bradesco"));
    const q = await pool.query("select parent_question_id from public.questions where text_redacted = 'Bradesco'");
    expect(q.rows[0].parent_question_id).toBeTruthy();
    await worker.runOnce();
    expect(lastSent().body).toContain("3 vidas");
  });

  it("falha na Cloud API devolve a reserva; reenvio automático (flush) entrega depois", async () => {
    await deliver(textEvent(COLAB_PHONE, "A Bradesco aceita PME com 3 vidas e 1 titular socio?"));
    const before = await usage();
    graph.fail = true;
    await worker.runOnce();
    const failed = await outMessages("resposta");
    expect(failed.at(-1)).toMatchObject({ status: "falhou", error_code: "131000" });
    const mid = await usage();
    expect(mid.reserved).toBe(before.reserved);
    expect(mid.failed).toBe(before.failed + 1);
    graph.fail = false;
    const r = await flushPendingAnswers(deps);
    expect(r.results.enviada).toBe(1);
    expect((await outMessages("resposta")).at(-1)!.status).toBe("enviada");
  });

  it("janela de 24 h expirada: a pergunta não é processada nem respondida", async () => {
    graph.sent = [];
    const old = Math.floor(Date.now() / 1000) - 25 * 3600;
    await pool.query("update public.whatsapp_contacts set window_expires_at = null, last_inbound_at = null");
    await deliver(textEvent(COLAB_PHONE, "A Bradesco aceita PME com 3 vidas?", { timestamp: old }));
    await worker.runOnce();
    const q = await pool.query("select status from public.questions order by created_at desc limit 1");
    expect(q.rows[0].status).toBe("expirada");
    expect(graph.sent.filter((s) => s.body.includes("3 vidas"))).toHaveLength(0);
  });

  it("teto mensal atingido: bloqueio preventivo sem chamar a Meta + alertas de consumo", async () => {
    const u = await usage();
    await pool.query(`update public.system_settings set value = value || jsonb_build_object('monthly_cap', ${u.reserved}) where key = 'whatsapp'`);
    graph.sent = [];
    await deliver(textEvent(COLAB_PHONE, "A Bradesco aceita PME com 3 vidas, mesmo assim?"));
    await worker.runOnce();
    expect(graph.sent).toHaveLength(0);
    expect((await outMessages("resposta")).at(-1)!.status).toBe("bloqueada_limite");
    expect((await usage()).blocked).toBeGreaterThan(0);
    const alerts = await asUser(pool, admin, (db) => db.query("select threshold from public.usage_alerts order by threshold"));
    expect(alerts.rows.map((a) => Number(a.threshold))).toEqual([0.5, 0.8, 0.95, 1]);
    const summary = await asUser(pool, admin, (db) => db.query("select public.whatsapp_usage_summary() as s"));
    expect(summary.rows[0].s.reserved).toBe(u.reserved);
    await pool.query(`update public.system_settings set value = value || '{"monthly_cap": 900}' where key = 'whatsapp'`);
  });

  it("envio desativado no painel: nada é enviado", async () => {
    await pool.query(`update public.system_settings set value = value || '{"enabled": false}' where key = 'whatsapp'`);
    graph.sent = [];
    await deliver(textEvent(COLAB_PHONE, "Falar com responsável"));
    expect(graph.sent).toHaveLength(0);
    expect((await outMessages("encaminhamento")).at(-1)!.status).toBe("desativado");
    await pool.query(`update public.system_settings set value = value || '{"enabled": true}' where key = 'whatsapp'`);
  });

  it("evento de outro número da mesma conta é ignorado", async () => {
    const r = await deliver(textEvent(COLAB_PHONE, "x", { phoneNumberId: "999" }));
    expect(r.summary).toMatchObject({ ignored: 1, messages: 0 });
  });

  it("colaborador não acessa as funções internas do WhatsApp", async () => {
    await expect(pgRpc(pool, colab)("wa_context", {})).rejects.toThrow(/permission denied/);
    const r = await asUser(pool, colab, (db) => db.query("select * from public.whatsapp_messages"));
    expect(r.rowCount).toBe(0);
  });
});
