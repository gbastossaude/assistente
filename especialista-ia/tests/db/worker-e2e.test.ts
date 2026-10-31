import { createHash } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WorkerConfig } from "../../apps/local-worker/src/config.ts";
import { LocalWorker } from "../../apps/local-worker/src/worker.ts";
import { FALLBACK_NO_SOURCE } from "../../packages/shared/src/index.ts";
import { asUser, canConnect, createUser, resetDatabase } from "../helpers/db.ts";
import { makeDocx, makePdf, makeXlsx } from "../helpers/files.ts";
import { defaultGroundedChat, MockOllama } from "../helpers/mock-ollama.ts";
import { PgWorkerRepository } from "../helpers/pg-worker-repo.ts";

const available = await canConnect();
const silent = process.env.E2E_LOGS ? { info: console.log, warn: console.log, error: console.log, debug() {} } : { info() {}, warn() {}, error() {}, debug() {} };

describe.skipIf(!available)("Ponta a ponta: upload → indexação → pergunta → resposta (worker + Ollama simulado)", () => {
  let pool: pg.Pool;
  let ollama: MockOllama;
  let repo: PgWorkerRepository;
  let worker: LocalWorker;
  let editor: string, colab: string, workerUser: string;
  const ops: Record<string, string> = {};

  const cfg = (url: string): WorkerConfig => ({
    supabaseUrl: "http://127.0.0.1", supabaseAnonKey: "x", workerEmail: "w", workerPassword: "w", workerId: "w-e2e",
    machineName: "teste", ollamaUrl: url, chatModel: "qwen3:4b", embeddingModel: "bge-m3", embeddingDimensions: 1024,
    answerConcurrency: 1, indexConcurrency: 1, pollSeconds: 60, ocrEnabled: false, ocrLanguage: "por", logDir: "", logLevel: "error",
    whatsappFunctionName: "whatsapp-send",
  });

  async function upload(doc: Record<string, unknown>, file: Uint8Array, fileName: string, mime: string, tamper = false) {
    return asUser(pool, editor, async (db) => {
      const d = await db.query(
        `insert into especialista.knowledge_documents (title, operator_id, category, rule_nature, is_national, states, valid_from, valid_until, contract_types)
         values ($1, $2, $3, coalesce($4, 'regra_contratacao'), coalesce($5::boolean, true), coalesce($6::text[], '{}'), $7::date, $8::date, coalesce($9::text[], '{}')) returning id`,
        [doc.title, doc.operator_id ?? null, doc.category ?? "regras_elegibilidade", doc.rule_nature ?? null, doc.is_national ?? null,
          doc.states ?? null, doc.valid_from ?? "2026-01-01", doc.valid_until ?? "2027-12-31", doc.contract_types ?? null]);
      const path = `docs/${d.rows[0].id}/${fileName}`;
      const hash = createHash("sha256").update(file).digest("hex");
      repo.storage.set(path, tamper ? new Uint8Array([...file, 1]) : file);
      const v = await db.query(
        `insert into especialista.document_versions (document_id, version_number, storage_path, file_name, mime_type, file_size, sha256)
         values ($1, 1, $2, $3, $4, $5, $6) returning id`, [d.rows[0].id, path, fileName, mime, file.byteLength, hash]);
      return { documentId: d.rows[0].id as string, versionId: v.rows[0].id as string };
    });
  }
  async function ask(text: string, user = colab) {
    return asUser(pool, user, async (db) => (await db.query("select especialista.submit_question($1) as id", [text])).rows[0].id as string);
  }
  async function answerOf(qid: string, user = colab) {
    return asUser(pool, user, async (db) => {
      const a = await db.query("select a.*, q.status as q_status from especialista.answers a join especialista.questions q on q.id = a.question_id where a.question_id = $1", [qid]);
      const s = a.rows[0] ? await db.query("select * from especialista.answer_sources where answer_id = $1 order by rank", [a.rows[0].id]) : { rows: [] };
      return { answer: a.rows[0], sources: s.rows };
    });
  }

  beforeAll(async () => {
    pool = await resetDatabase(`${process.env.TEST_DB_NAME ?? "especialista_test"}_e2e`);
    await pool.query(`update especialista.system_settings set value = value || '{"rate_limit_per_minute": 1000}' where key = 'security'`);
    // Embeddings simulados (hash de palavras) têm similaridade menor que modelos reais.
    await pool.query(`update especialista.system_settings set value = value || '{"min_vector_similarity": 0.2}' where key = 'ai'`);
    await createUser(pool, "admin@t.test", "admin");
    editor = await createUser(pool, "editor@t.test", "editor");
    colab = await createUser(pool, "colab@t.test", "colaborador");
    workerUser = await createUser(pool, "worker@t.test", "worker");
    for (const r of (await pool.query("select id, slug from especialista.operators")).rows) ops[r.slug] = r.id;
    ollama = await new MockOllama().start();
    repo = new PgWorkerRepository(pool, workerUser, "w-e2e");
    worker = new LocalWorker(cfg(ollama.url), repo, silent);
  });
  afterAll(async () => {
    await ollama?.stop();
    await pool?.end();
  });
  beforeEach(() => {
    ollama.mode = "ok";
    ollama.chat = defaultGroundedChat;
  });

  it("PDF enviado é extraído, dividido, vetorizado e ativado com referência de página", async () => {
    const pdf = makePdf([
      "Manual Comercial Bradesco Saude PME 2026\nRegras gerais de contratacao.",
      "ELEGIBILIDADE\nA Bradesco aceita empresas PME a partir de 3 vidas, com pelo menos 1 titular socio.\nMEI aceito com CNPJ ativo ha 6 meses.",
    ]);
    const { documentId, versionId } = await upload({ title: "Manual PME Bradesco 2026", operator_id: ops["bradesco-saude"], contract_types: ["pme"] }, pdf, "manual.pdf", "application/pdf");
    expect(await worker.runOnce()).toBe(1);
    const d = await pool.query("select status, current_version_id from especialista.knowledge_documents where id = $1", [documentId]);
    expect(d.rows[0]).toEqual({ status: "ativo", current_version_id: versionId });
    const v = await pool.query("select status, page_count, chunk_count, embedding_model from especialista.document_versions where id = $1", [versionId]);
    expect(v.rows[0]).toMatchObject({ status: "indexado", page_count: 2, embedding_model: "bge-m3" });
    expect(v.rows[0].chunk_count).toBeGreaterThan(0);
    const c = await pool.query("select page_from, page_to, content from especialista.document_chunks where version_id = $1 and content like '%3 vidas%'", [versionId]);
    expect(c.rows[0].page_from).toBeLessThanOrEqual(2);
    expect(c.rows[0].page_to).toBe(2);
    expect(ollama.embedCalls).toBeGreaterThan(0);
  });

  it("consulta (fluxo da extensão): resposta com fonte, página e citação", async () => {
    const qid = await ask("A Bradesco aceita empresa PME com 3 vidas?");
    await worker.runOnce();
    const { answer, sources } = await answerOf(qid);
    expect(answer.outcome).toBe("respondida");
    expect(answer.content).toContain("3 vidas");
    expect(answer.content).toContain("[1]");
    expect(answer.model).toBe("qwen3:4b");
    expect(sources[0]).toMatchObject({ title: "Manual PME Bradesco 2026", operator_name: "Bradesco Saúde", page_to: 2 });
    const chat = ollama.chatCalls.at(-1)!;
    expect(chat.think).toBe(false);
    expect(chat.format).toBeTypeOf("object");
  });

  it("pergunta sem documento confiável recebe a mensagem padrão", async () => {
    const qid = await ask("Qual o percentual de reembolso da Alice para psicologia?");
    await worker.runOnce();
    const { answer } = await answerOf(qid);
    expect(answer.outcome).toBe("sem_fonte");
    expect(answer.content).toBe(FALLBACK_NO_SOURCE);
  });

  it("documento vencido não é usado como regra atual", async () => {
    await upload({ title: "Tabela Amil 2024", operator_id: ops["amil"], category: "carencias", valid_from: "2024-01-01", valid_until: "2025-01-31" },
      makePdf(["Carencia de parto na Amil: 300 dias para contratos PME."]), "amil-2024.pdf", "application/pdf");
    await worker.runOnce();
    const qid = await ask("Qual a carência de parto na Amil?");
    await worker.runOnce();
    const { answer, sources } = await answerOf(qid);
    expect(answer.outcome).toBe("sem_fonte");
    expect(answer.content).toContain("vigência encerrada em 31/01/2025");
    expect(sources[0].title).toBe("Tabela Amil 2024");
  });

  it("conflito entre documentos é sinalizado e registrado", async () => {
    await upload({ title: "Guia SulAmérica PME", operator_id: ops["sulamerica"] }, makePdf(["A SulAmerica aceita MEI com 6 meses de CNPJ."]), "g1.pdf", "application/pdf");
    await upload({ title: "Comunicado SulAmérica 08-2026", operator_id: ops["sulamerica"] }, makePdf(["A SulAmerica aceita MEI com 12 meses de CNPJ."]), "g2.pdf", "application/pdf");
    await worker.runOnce();
    let prompt = "";
    ollama.chat = (body) => {
      prompt = body.messages.at(-1)!.content;
      return JSON.stringify({ status: "conflito", resposta: "Uma fonte indica 6 meses [1] e outra 12 meses [2].", fontes: [1, 2], conflito: "Tempo de CNPJ: 6 x 12 meses." });
    };
    const qid = await ask("A SulAmérica aceita MEI com quantos meses de CNPJ?");
    await worker.runOnce();
    const { answer, sources } = await answerOf(qid);
    expect(prompt).toMatch(/são da mesma operadora e categoria/);
    expect(answer.outcome).toBe("conflito");
    expect(sources).toHaveLength(2);
    // O cadastro já havia apontado a sobreposição; a resposta confirma e vincula a pergunta ao mesmo registro.
    const c = await pool.query("select source, description from especialista.knowledge_conflicts where question_id = $1", [qid]);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].description).toContain("Confirmado ao responder pergunta: Tempo de CNPJ");
    const overlap = await pool.query("select count(*)::int n from especialista.knowledge_conflicts where source = 'cadastro'");
    expect(overlap.rows[0].n).toBeGreaterThan(0);
  });

  it("Ollama fora do ar: worker não consome tentativas e a pergunta fica pendente", async () => {
    ollama.mode = "down";
    const qid = await ask("A Bradesco aceita MEI?");
    expect(await worker.runOnce()).toBe(0);
    expect(worker.state.aiOk).toBe(false);
    const q = await pool.query("select q.status, j.attempts from especialista.questions q join especialista.processing_jobs j on j.question_id = q.id where q.id = $1", [qid]);
    expect(q.rows[0]).toEqual({ status: "pendente", attempts: 0 });
    const s = await asUser(pool, colab, (db) => db.query("select especialista.get_service_status() as s"));
    expect(s.rows[0].s).toMatchObject({ worker_online: true, ai_ok: false });
    ollama.mode = "ok";
    await worker.runOnce();
    expect((await answerOf(qid)).answer.outcome).toBe("respondida");
  });

  it("falha do Ollama durante a geração: tarefa reagendada com espera", async () => {
    const qid = await ask("A Bradesco aceita empresa com 3 vidas?");
    const before = ollama.chatCalls.length;
    ollama.chat = () => { throw new Error("falha simulada do modelo"); };
    await worker.runOnce();
    expect(ollama.chatCalls.length).toBeGreaterThan(before);
    const j = await pool.query("select status, attempts, last_error, available_at > now() as delayed from especialista.processing_jobs where question_id = $1", [qid]);
    expect(j.rows[0]).toMatchObject({ status: "pendente", attempts: 1, delayed: true });
    expect(j.rows[0].last_error).toMatch(/Ollama respondeu HTTP 500/);
    const q = await pool.query("select status from especialista.questions where id = $1", [qid]);
    expect(q.rows[0].status).toBe("pendente");
    await pool.query("update especialista.processing_jobs set status = 'cancelado' where question_id = $1", [qid]);
  });

  it("worker offline: pergunta é aceita e fica na fila; status indica offline", async () => {
    await pool.query("update especialista.worker_heartbeats set last_seen_at = now() - interval '10 minutes'");
    const qid = await ask("Qual o prazo de implantação da Bradesco?");
    const s = await asUser(pool, colab, (db) => db.query("select especialista.get_service_status() as s"));
    expect(s.rows[0].s.worker_online).toBe(false);
    const q = await pool.query("select status from especialista.questions where id = $1", [qid]);
    expect(q.rows[0].status).toBe("pendente");
    expect(Number(s.rows[0].s.pending_jobs)).toBeGreaterThan(0);
  });

  it("pergunta do WhatsApp aciona o envio após responder", async () => {
    await pool.query("update especialista.processing_jobs set status = 'cancelado' where status = 'pendente'");
    const contact = await pool.query("insert into especialista.whatsapp_contacts (wa_id, profile_id, last_inbound_at, window_expires_at) values ('5511988887777', $1, now(), now() + interval '24 hours') returning id", [colab]);
    const q = await pool.query("insert into especialista.questions (profile_id, channel, text_redacted, whatsapp_contact_id) values ($1, 'whatsapp', 'A Bradesco aceita empresa PME com 3 vidas?', $2) returning id", [colab, contact.rows[0].id]);
    repo.whatsappCalls = [];
    await worker.runOnce();
    expect(repo.whatsappCalls).toContainEqual({ question_id: q.rows[0].id });
  });

  it("DOCX, XLSX e CSV são indexados", async () => {
    await upload({ title: "Procedimento interno de implantação", category: "procedimento_interno", rule_nature: "procedimento_interno" },
      await makeDocx(["Implantacao: enviar a proposta assinada ao backoffice ate as 15h.", "Documentos: contrato social e cartao CNPJ."]),
      "procedimento.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await upload({ title: "Grade de documentos", category: "documentacao", operator_id: ops["klini-saude"] },
      await makeXlsx("Documentos", [["Modalidade", "Documento"], ["PME", "Contrato social"], ["PME", "Cartao CNPJ"], ["Adesao", "Comprovante de vinculo"]]),
      "grade.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await upload({ title: "Contatos de backoffice (CSV)", category: "procedimento_interno" },
      new TextEncoder().encode("Setor;Prazo\nImplantacao;2 dias uteis\nMovimentacao;5 dias uteis\n"), "prazos.csv", "text/csv");
    await worker.runOnce();
    const r = await pool.query(`select d.title, v.status, v.chunk_count from especialista.document_versions v join especialista.knowledge_documents d on d.id = v.document_id
      where d.title in ('Procedimento interno de implantação', 'Grade de documentos', 'Contatos de backoffice (CSV)') order by d.title`);
    expect(r.rows.map((x) => x.status)).toEqual(["indexado", "indexado", "indexado"]);
    const xlsxChunk = await pool.query("select content from especialista.document_chunks c join especialista.knowledge_documents d on d.id = c.document_id where d.title = 'Grade de documentos'");
    expect(xlsxChunk.rows[0].content).toContain("Modalidade: PME | Documento: Contrato social");
  });

  it("PDF digitalizado (sem texto) vai para revisão em vez de ser usado", async () => {
    const { documentId, versionId } = await upload({ title: "Contrato escaneado", operator_id: ops["leve-saude"] }, makePdf(["", ""]), "scan.pdf", "application/pdf");
    await worker.runOnce();
    const v = await pool.query("select status, review_reason from especialista.document_versions where id = $1", [versionId]);
    expect(v.rows[0].status).toBe("revisao");
    expect(v.rows[0].review_reason).toMatch(/digitalizado|Nenhum texto/);
    const d = await pool.query("select status from especialista.knowledge_documents where id = $1", [documentId]);
    expect(d.rows[0].status).toBe("revisao");
  });

  it("arquivo adulterado no storage falha sem novas tentativas (integridade)", async () => {
    const { versionId } = await upload({ title: "Arquivo adulterado", operator_id: ops["sami"] }, makePdf(["texto"]), "x.pdf", "application/pdf", true);
    await worker.runOnce();
    const v = await pool.query("select status, error_message from especialista.document_versions where id = $1", [versionId]);
    expect(v.rows[0].status).toBe("erro");
    expect(v.rows[0].error_message).toMatch(/integridade/);
  });

  it("FAQ oficial publicada é vetorizada e responde diretamente", async () => {
    await pool.query(`update especialista.system_settings set value = value || '{"faq_direct_threshold": 0.6}' where key = 'ai'`);
    await asUser(pool, editor, (db) => db.query(
      "insert into especialista.knowledge_faq (question, answer, operator_id, status) values ($1, $2, $3, 'publicado')",
      ["Qual o horário de corte de propostas da MedSênior?", "Propostas recebidas até as 14h entram no mesmo dia.", ops["medsenior"]]));
    await worker.runOnce();
    const f = await pool.query("select embedding_model from especialista.knowledge_faq");
    expect(f.rows[0].embedding_model).toBe("bge-m3");
    const qid = await ask("Qual o horário de corte de propostas da MedSênior?");
    const chatBefore = ollama.chatCalls.length;
    await worker.runOnce();
    const { answer, sources } = await answerOf(qid);
    expect(answer.outcome).toBe("respondida");
    expect(answer.provider).toBe("faq");
    expect(sources[0].faq_id).toBeTruthy();
    expect(ollama.chatCalls.length).toBe(chatBefore);
  });
});
