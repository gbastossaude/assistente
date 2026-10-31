import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, canConnect, createUser, resetDatabase, vec } from "../helpers/db.ts";

const available = await canConnect();
const sha = (c: string) => c.repeat(64).slice(0, 64);

describe.skipIf(!available)("Banco de dados (migrations + RLS + RPC)", () => {
  let pool: pg.Pool;
  let admin: string, editor: string, colab: string, colab2: string, worker: string, worker2: string, inactive: string;
  let amil: string, bradesco: string;

  beforeAll(async () => {
    pool = await resetDatabase();
    admin = await createUser(pool, "admin@corretora.test", "admin");
    editor = await createUser(pool, "editor@corretora.test", "editor");
    colab = await createUser(pool, "colab@corretora.test", "colaborador");
    colab2 = await createUser(pool, "colab2@corretora.test", "colaborador");
    worker = await createUser(pool, "worker@corretora.test", "worker");
    worker2 = await createUser(pool, "worker2@corretora.test", "worker");
    inactive = await createUser(pool, "cadastro-publico@x.test", null);
    const ops = await pool.query("select id, slug from public.operators");
    amil = ops.rows.find((r) => r.slug === "amil").id;
    bradesco = ops.rows.find((r) => r.slug === "bradesco-saude").id;
  });
  afterAll(async () => pool?.end());

  describe("autenticação e perfis", () => {
    it("cadastro sem app_metadata nasce inativo e sem privilégio", async () => {
      const p = await pool.query("select role, active from public.profiles where id = $1", [inactive]);
      expect(p.rows[0]).toEqual({ role: "colaborador", active: false });
      await expect(asUser(pool, inactive, (db) => db.query("select public.submit_question('Carência da Amil?')"))).rejects.toThrow(/Acesso negado/);
    });

    it("anon não lê nada nem chama RPC", async () => {
      await expect(asUser(pool, null, (db) => db.query("select * from public.profiles"))).rejects.toThrow(/permission denied/);
      await expect(asUser(pool, null, (db) => db.query("select public.submit_question('x y z')"))).rejects.toThrow(/permission denied/);
    });

    it("colaborador não consegue se promover a administrador", async () => {
      const r = await asUser(pool, colab, (db) => db.query("update public.profiles set role = 'admin' where id = $1", [colab]));
      expect(r.rowCount).toBe(0);
      const p = await pool.query("select role from public.profiles where id = $1", [colab]);
      expect(p.rows[0].role).toBe("colaborador");
    });

    it("não permite remover o último administrador", async () => {
      await expect(asUser(pool, admin, (db) => db.query("update public.profiles set role = 'editor' where id = $1", [admin])))
        .rejects.toThrow(/último administrador/);
    });

    it("trocar o número de WhatsApp revoga a aprovação", async () => {
      await asUser(pool, admin, (db) => db.query("update public.profiles set whatsapp_phone = '5511987654321', whatsapp_approved = true where id = $1", [colab]));
      let p = await pool.query("select whatsapp_approved, whatsapp_approved_by from public.profiles where id = $1", [colab]);
      expect(p.rows[0]).toEqual({ whatsapp_approved: true, whatsapp_approved_by: admin });
      await asUser(pool, admin, (db) => db.query("update public.profiles set whatsapp_phone = '5511911112222' where id = $1", [colab]));
      p = await pool.query("select whatsapp_approved from public.profiles where id = $1", [colab]);
      expect(p.rows[0].whatsapp_approved).toBe(false);
    });

    it("promote_first_admin não pode ser chamado pela API e recusa quando já há admin", async () => {
      await expect(asUser(pool, colab, (db) => db.query("select public.promote_first_admin('colab@corretora.test')"))).rejects.toThrow(/permission denied/);
      await expect(pool.query("select public.promote_first_admin('colab@corretora.test')")).rejects.toThrow(/Já existe um administrador/);
    });
  });

  describe("perguntas e permissões", () => {
    it("colaborador envia pergunta: texto minimizado, contexto saneado e tarefa criada", async () => {
      const id = await asUser(pool, colab, async (db) =>
        (await db.query("select public.submit_question($1, $2) as id", [
          "Cliente CPF 529.982.247-25 tel 11 98765-4321 pode contratar Amil?",
          { uf: "sp", lives: "3", operator_id: amil, hack: "x", contract_type: "invalido" },
        ])).rows[0].id);
      const q = await pool.query("select text_redacted, context, pii_redacted, status from public.questions where id = $1", [id]);
      expect(q.rows[0].text_redacted).not.toMatch(/529|98765/);
      expect(q.rows[0].pii_redacted).toBe(true);
      expect(q.rows[0].context).toEqual({ uf: "SP", lives: 3, operator_id: amil });
      const j = await pool.query("select type, status, priority from public.processing_jobs where question_id = $1", [id]);
      expect(j.rows[0]).toEqual({ type: "answer_question", status: "pendente", priority: 10 });
    });

    it("cada um vê apenas as próprias perguntas", async () => {
      const own = await asUser(pool, colab, (db) => db.query("select id from public.questions"));
      const other = await asUser(pool, colab2, (db) => db.query("select id from public.questions"));
      const staff = await asUser(pool, editor, (db) => db.query("select id from public.questions"));
      expect(own.rowCount).toBeGreaterThan(0);
      expect(other.rowCount).toBe(0);
      expect(staff.rowCount).toBe(own.rowCount);
    });

    it("colaborador não lê documentos, trechos, WhatsApp, auditoria nem configurações privadas", async () => {
      for (const t of ["knowledge_documents", "document_chunks", "whatsapp_messages", "whatsapp_usage", "audit_logs", "processing_jobs"]) {
        const r = await asUser(pool, colab, (db) => db.query(`select * from public.${t}`));
        expect(r.rowCount, t).toBe(0);
      }
      const s = await asUser(pool, colab, (db) => db.query("select key from public.system_settings"));
      expect(s.rows.map((r) => r.key)).toEqual(["branding"]);
      await expect(asUser(pool, colab, (db) => db.query("insert into public.knowledge_documents (title) values ('x y z')"))).rejects.toThrow(/row-level security/);
    });

    it("colaborador não acessa funções do worker nem do WhatsApp", async () => {
      await expect(asUser(pool, colab, (db) => db.query("select * from public.claim_jobs('w-1')"))).rejects.toThrow(/somente a conta do worker/);
      await expect(asUser(pool, colab, (db) => db.query("select public.whatsapp_reserve_send('123')"))).rejects.toThrow(/permission denied/);
      await expect(asUser(pool, colab, (db) => db.query(`select * from public.search_chunks('${vec(1)}', 'x', 'bge-m3')`))).rejects.toThrow(/Acesso negado/);
      await expect(asUser(pool, colab, (db) => db.query("select public.get_dashboard(30)"))).rejects.toThrow(/Acesso negado/);
    });

    it("limite de perguntas por minuto", async () => {
      await expect(asUser(pool, colab2, async (db) => {
        for (let i = 0; i < 7; i++) await db.query("select public.submit_question($1)", [`Pergunta número ${i} sobre carência`]);
      })).rejects.toThrow(/Muitas perguntas/);
    });

    it("estado do serviço disponível para colaboradores (indicador de conexão)", async () => {
      const r = await asUser(pool, colab, (db) => db.query("select public.get_service_status() as s"));
      expect(r.rows[0].s.worker_online).toBe(false);
    });
  });

  describe("fila do worker", () => {
    beforeAll(async () => {
      await pool.query(`update public.system_settings set value = value || '{"rate_limit_per_minute": 1000}' where key = 'security'`);
    });
    async function newQuestion(user = colab, text = "Qual a carência da Amil para parto?") {
      return asUser(pool, user, async (db) => (await db.query("select public.submit_question($1) as id", [text])).rows[0].id as string);
    }

    it("SKIP LOCKED: dois workers simultâneos nunca pegam a mesma tarefa", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status = 'pendente'");
      await newQuestion(editor, "Pergunta A sobre carência");
      await newQuestion(editor, "Pergunta B sobre carência");
      const [a, b] = await Promise.all([
        asUser(pool, worker, (db) => db.query("select * from public.claim_jobs('w-a', null, 5)")),
        asUser(pool, worker2, (db) => db.query("select * from public.claim_jobs('w-b', null, 5)")),
      ]);
      const ids = [...a.rows, ...b.rows].map((r) => r.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
      const qs = await pool.query("select status from public.questions where text_redacted like 'Pergunta % sobre carência'");
      expect(qs.rows.every((r) => r.status === "processando")).toBe(true);
    });

    it("salva resposta com fontes; dono lê, outro colaborador não", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      const qid = await newQuestion();
      const job = await asUser(pool, worker, async (db) => (await db.query("select * from public.claim_jobs('w-a')")).rows[0]);
      expect(job.question_id).toBe(qid);
      await asUser(pool, worker, (db) => db.query("select public.save_answer($1, 'w-a', $2, $3)", [job.id,
        { outcome: "respondida", content: "Resposta [1]", confidence: 0.8, warnings: ["aviso"], provider: "ollama", model: "qwen3:4b",
          detected: { topic: "carencias", operator_id: amil }, total_ms: 1200 },
        JSON.stringify([{ rank: 1, title: "Manual Amil", operator_name: "Amil", page_from: 2, excerpt: "trecho", score: 0.9 }])]));
      const mine = await asUser(pool, colab, (db) => db.query(
        "select a.outcome, s.title from public.answers a join public.answer_sources s on s.answer_id = a.id where a.question_id = $1", [qid]));
      expect(mine.rows).toEqual([{ outcome: "respondida", title: "Manual Amil" }]);
      const notMine = await asUser(pool, colab2, (db) => db.query("select * from public.answers where question_id = $1", [qid]));
      expect(notMine.rowCount).toBe(0);
      const q = await pool.query("select status, topic, operator_id from public.questions where id = $1", [qid]);
      expect(q.rows[0]).toEqual({ status: "respondida", topic: "carencias", operator_id: amil });
      const j = await pool.query("select status from public.processing_jobs where id = $1", [job.id]);
      expect(j.rows[0].status).toBe("concluido");
      // Feedback do dono
      const ans = await pool.query("select id from public.answers where question_id = $1", [qid]);
      await asUser(pool, colab, (db) => db.query("select public.submit_feedback($1, 'incorreta', 'faltou a regra de SP')", [ans.rows[0].id]));
      await expect(asUser(pool, colab2, (db) => db.query("select public.submit_feedback($1, 'util')", [ans.rows[0].id]))).rejects.toThrow(/não encontrada/);
    });

    it("worker não conclui tarefa bloqueada por outro worker", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      await newQuestion();
      const job = await asUser(pool, worker, async (db) => (await db.query("select * from public.claim_jobs('w-a')")).rows[0]);
      await expect(asUser(pool, worker2, (db) => db.query("select public.complete_job($1, 'w-b')", [job.id]))).rejects.toThrow(/não está bloqueada por este worker/);
    });

    it("falha com nova tentativa e, esgotadas, marca erro", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      const qid = await newQuestion();
      for (let attempt = 1; attempt <= 3; attempt++) {
        await pool.query("update public.processing_jobs set available_at = now() where question_id = $1", [qid]);
        const job = await asUser(pool, worker, async (db) => (await db.query("select * from public.claim_jobs('w-a')")).rows[0]);
        expect(job.attempts).toBe(attempt);
        const r = await asUser(pool, worker, (db) => db.query("select public.fail_job($1, 'w-a', 'Ollama indisponível', true) as r", [job.id]));
        expect(r.rows[0].r).toBe(attempt < 3 ? "reagendada" : "falhou");
      }
      const q = await pool.query("select status from public.questions where id = $1", [qid]);
      expect(q.rows[0].status).toBe("erro");
    });

    it("recupera tarefa com bloqueio vencido (worker reiniciado)", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      await newQuestion();
      const job = await asUser(pool, worker, async (db) => (await db.query("select * from public.claim_jobs('w-a')")).rows[0]);
      await pool.query("update public.processing_jobs set lock_expires_at = now() - interval '1 second' where id = $1", [job.id]);
      const again = await asUser(pool, worker2, async (db) => (await db.query("select * from public.claim_jobs('w-b')")).rows[0]);
      expect(again.id).toBe(job.id);
      expect(again.attempts).toBe(2);
      expect(again.locked_by).toBe("w-b");
    });

    it("encerramento gracioso devolve a tarefa sem consumir tentativa", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      const qid = await newQuestion();
      await asUser(pool, worker, (db) => db.query("select * from public.claim_jobs('w-a')"));
      await asUser(pool, worker, (db) => db.query("select public.release_jobs('w-a')"));
      const j = await pool.query("select status, attempts from public.processing_jobs where question_id = $1", [qid]);
      expect(j.rows[0]).toEqual({ status: "pendente", attempts: 0 });
    });

    it("pergunta do WhatsApp com janela de 24 h vencida expira e não é processada", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      const contact = await pool.query(
        "insert into public.whatsapp_contacts (wa_id, profile_id, last_inbound_at, window_expires_at) values ('5511900000001', $1, now() - interval '25 hours', now() - interval '1 hour') returning id", [colab]);
      const q = await pool.query(
        "insert into public.questions (profile_id, channel, text_redacted, whatsapp_contact_id) values ($1, 'whatsapp', 'Carência Amil?', $2) returning id", [colab, contact.rows[0].id]);
      const claimed = await asUser(pool, worker, (db) => db.query("select * from public.claim_jobs('w-a')"));
      expect(claimed.rowCount).toBe(0);
      const st = await pool.query("select q.status qs, j.status js from public.questions q join public.processing_jobs j on j.question_id = q.id where q.id = $1", [q.rows[0].id]);
      expect(st.rows[0]).toEqual({ qs: "expirada", js: "expirado" });
    });

    it("conflito na resposta é registrado para o administrador", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      const d1 = await pool.query("insert into public.knowledge_documents (title, operator_id) values ('Doc conflito A', $1) returning id", [amil]);
      const d2 = await pool.query("insert into public.knowledge_documents (title, operator_id) values ('Doc conflito B', $1) returning id", [amil]);
      await newQuestion();
      const job = await asUser(pool, worker, async (db) => (await db.query("select * from public.claim_jobs('w-a')")).rows[0]);
      await asUser(pool, worker, (db) => db.query("select public.save_answer($1, 'w-a', $2)", [job.id,
        { outcome: "conflito", content: "Divergência", conflict_document_ids: [d1.rows[0].id, d2.rows[0].id], conflict_description: "6 x 12 meses" }]));
      const c = await pool.query("select source, status, description from public.knowledge_conflicts where question_id = $1", [job.question_id]);
      expect(c.rows[0]).toEqual({ source: "resposta", status: "aberto", description: "6 x 12 meses" });
    });
  });

  describe("documentos, versões e busca híbrida", () => {
    let docId: string;

    async function uploadVersion(documentId: string, hash: string) {
      return asUser(pool, editor, async (db) => (await db.query(
        `insert into public.document_versions (document_id, version_number, storage_path, file_name, mime_type, file_size, sha256)
         values ($1, 99, $2, 'manual.pdf', 'application/pdf', 1000, $3) returning id, version_number`,
        [documentId, `docs/${documentId}/${hash}.pdf`, sha(hash)])).rows[0]);
    }
    async function indexVersion(versionId: string, contents: Array<{ text: string; v: string }>, status = "indexado") {
      const job = await asUser(pool, worker, async (db) => (await db.query("select * from public.claim_jobs('w-a', array['index_document'])")).rows[0]);
      expect(job.document_version_id).toBe(versionId);
      const docOfVersion = (await pool.query("select document_id from public.document_versions where id = $1", [versionId])).rows[0].document_id;
      await asUser(pool, worker, async (db) => {
        for (const [i, c] of contents.entries()) {
          await db.query(
            "insert into public.document_chunks (document_id, version_id, chunk_index, page_from, page_to, content, embedding, embedding_model) values ($1,$2,$3,1,1,$4,$5,'bge-m3')",
            [docOfVersion, versionId, i, c.text, c.v]);
        }
        await db.query("select public.finalize_document_version($1, 'w-a', $2)", [job.id, { status, page_count: 1, char_count: 100, embedding_model: "bge-m3", quality: {} }]);
      });
    }

    it("editor cadastra documento; nova versão gera tarefa de indexação e número sequencial", async () => {
      await pool.query("update public.processing_jobs set status = 'cancelado' where status in ('pendente','processando')");
      docId = await asUser(pool, editor, async (db) => (await db.query(
        `insert into public.knowledge_documents (title, operator_id, category, is_national, valid_from, valid_until, contract_types)
         values ('Manual PME Amil 2026', $1, 'regras_elegibilidade', true, '2026-01-01', '2027-12-31', '{pme}') returning id`, [amil])).rows[0].id);
      const v = await uploadVersion(docId, "a");
      expect(v.version_number).toBe(1);
      const d = await pool.query("select status from public.knowledge_documents where id = $1", [docId]);
      expect(d.rows[0].status).toBe("processando");
      await indexVersion(v.id, [
        { text: "Empresas PME são aceitas a partir de 2 vidas na Amil.", v: vec(1, 2) },
        { text: "Carência para consultas de 30 dias.", v: vec(500, 501) },
      ]);
      const after = await pool.query("select status, current_version_id from public.knowledge_documents where id = $1", [docId]);
      expect(after.rows[0]).toEqual({ status: "ativo", current_version_id: v.id });
    });

    it("mesmo arquivo (hash) não é cadastrado duas vezes no documento", async () => {
      await expect(uploadVersion(docId, "a")).rejects.toThrow(/duplicate key/);
    });

    it("busca híbrida combina vetor e texto e filtra por operadora", async () => {
      const r = await asUser(pool, worker, (db) => db.query(
        "select title, content, vector_similarity, text_rank, operator_name from public.search_chunks($1, $2, 'bge-m3', $3)",
        [vec(1, 2), "quantas vidas PME", [amil]]));
      expect(r.rows[0].content).toContain("2 vidas");
      expect(r.rows[0].vector_similarity).toBeCloseTo(1, 3);
      expect(r.rows[0].text_rank).toBeGreaterThan(0);
      expect(r.rows[0].operator_name).toBe("Amil");
      const other = await asUser(pool, worker, (db) => db.query("select * from public.search_chunks($1, 'vidas', 'bge-m3', $2)", [vec(1, 2), [bradesco]]));
      expect(other.rowCount).toBe(0);
      // Busca textual sem acento encontra texto acentuado
      const fts = await asUser(pool, editor, (db) => db.query("select content from public.search_chunks(null, 'carencia consultas', 'bge-m3')"));
      expect(fts.rows[0].content).toContain("Carência");
    });

    it("nova versão substitui a anterior só depois de indexada (histórico preservado)", async () => {
      const v2 = await uploadVersion(docId, "b");
      expect(v2.version_number).toBe(2);
      // Enquanto indexa, a versão 1 continua respondendo
      const during = await asUser(pool, worker, (db) => db.query("select * from public.search_chunks($1, 'vidas', 'bge-m3')", [vec(1, 2)]));
      expect(during.rowCount).toBeGreaterThan(0);
      await indexVersion(v2.id, [{ text: "Empresas PME são aceitas a partir de 3 vidas na Amil (nova regra).", v: vec(1, 2) }]);
      const versions = await pool.query("select version_number, status from public.document_versions where document_id = $1 order by 1", [docId]);
      expect(versions.rows).toEqual([{ version_number: 1, status: "substituido" }, { version_number: 2, status: "indexado" }]);
      const r = await asUser(pool, worker, (db) => db.query("select content from public.search_chunks($1, 'vidas', 'bge-m3')", [vec(1, 2)]));
      expect(r.rows.map((x) => x.content)).toEqual(["Empresas PME são aceitas a partir de 3 vidas na Amil (nova regra)."]);
    });

    it("extração com problema fica em revisão e só entra na busca após aprovação", async () => {
      const d = await asUser(pool, editor, async (db) => (await db.query(
        "insert into public.knowledge_documents (title, operator_id, category) values ('PDF escaneado Bradesco', $1, 'carencias') returning id", [bradesco])).rows[0].id);
      const v = await uploadVersion(d, "c");
      await indexVersion(v.id, [{ text: "Texto obtido por OCR: carência 180 dias.", v: vec(700) }], "revisao");
      expect((await pool.query("select status from public.knowledge_documents where id = $1", [d])).rows[0].status).toBe("revisao");
      let r = await asUser(pool, worker, (db) => db.query("select * from public.search_chunks($1, 'carência', 'bge-m3', $2)", [vec(700), [bradesco]]));
      expect(r.rowCount).toBe(0);
      await expect(asUser(pool, colab, (db) => db.query("select public.approve_document_version($1)", [v.id]))).rejects.toThrow(/Acesso negado/);
      await asUser(pool, editor, (db) => db.query("select public.approve_document_version($1, 'conferido com o original')", [v.id]));
      r = await asUser(pool, worker, (db) => db.query("select * from public.search_chunks($1, 'carência', 'bge-m3', $2)", [vec(700), [bradesco]]));
      expect(r.rowCount).toBe(1);
    });

    it("documentos sobrepostos geram alerta de conflito potencial", async () => {
      const d = await asUser(pool, editor, async (db) => (await db.query(
        `insert into public.knowledge_documents (title, operator_id, category, is_national, valid_from, valid_until, contract_types)
         values ('Comunicado elegibilidade Amil', $1, 'regras_elegibilidade', true, '2026-06-01', '2027-06-30', '{pme}') returning id`, [amil])).rows[0].id);
      const v = await uploadVersion(d, "d");
      await indexVersion(v.id, [{ text: "PME a partir de 4 vidas.", v: vec(1, 3) }]);
      const c = await pool.query("select source, description from public.knowledge_conflicts where document_a_id = $1 and document_b_id = $2", [d, docId]);
      expect(c.rows[0].source).toBe("cadastro");
      expect(c.rows[0].description).toMatch(/Possível sobreposição/);
    });

    it("desativar exige motivo e mantém histórico; documento inativo sai da busca", async () => {
      await expect(asUser(pool, editor, (db) => db.query("select public.set_document_active($1, false, '')", [docId]))).rejects.toThrow(/motivo/);
      await asUser(pool, editor, (db) => db.query("select public.set_document_active($1, false, 'Substituído pelo manual 2027')", [docId]));
      const r = await asUser(pool, worker, (db) => db.query("select document_id from public.search_chunks($1, 'vidas', 'bge-m3')", [vec(1, 2)]));
      expect(r.rows.map((x) => x.document_id)).not.toContain(docId);
      const versions = await pool.query("select count(*)::int n from public.document_versions where document_id = $1", [docId]);
      expect(versions.rows[0].n).toBe(2);
      const audit = await pool.query("select action from public.audit_logs where entity = 'knowledge_documents' and entity_id = $1", [docId]);
      expect(audit.rowCount).toBeGreaterThan(1);
    });
  });

  describe("WhatsApp: teto de consumo e idempotência", () => {
    it("bloqueia quando o envio está desativado", async () => {
      const r = await asUser(pool, "service_role", (db) => db.query("select public.whatsapp_reserve_send('PN1') as r"));
      expect(r.rows[0].r).toMatchObject({ allowed: false, reason: "desativado" });
    });

    it("nunca ultrapassa o teto mensal, mesmo com envios concorrentes", async () => {
      await pool.query(`update public.system_settings set value = value || '{"enabled": true, "monthly_cap": 5, "daily_cap": 100}' where key = 'whatsapp'`);
      const results = await Promise.all(Array.from({ length: 12 }, () =>
        asUser(pool, "service_role", async (db) => (await db.query("select public.whatsapp_reserve_send('PN2') as r")).rows[0].r)));
      expect(results.filter((r) => r.allowed)).toHaveLength(5);
      expect(results.filter((r) => !r.allowed).every((r) => r.reason === "limite_mensal")).toBe(true);
      const u = await pool.query("select sum(reserved)::int reserved, sum(blocked)::int blocked from public.whatsapp_usage where phone_number_id = 'PN2'");
      expect(u.rows[0]).toEqual({ reserved: 5, blocked: 7 });
      const alerts = await pool.query("select threshold from public.usage_alerts where phone_number_id = 'PN2' order by threshold");
      expect(alerts.rows.map((a) => Number(a.threshold))).toEqual([0.5, 0.8, 0.95, 1]);
    });

    it("falha no envio devolve a reserva", async () => {
      await pool.query(`update public.system_settings set value = value || '{"monthly_cap": 900}' where key = 'whatsapp'`);
      const r = await asUser(pool, "service_role", async (db) => (await db.query("select public.whatsapp_reserve_send('PN3') as r")).rows[0].r);
      await asUser(pool, "service_role", (db) => db.query("select public.whatsapp_record_send('PN3', $1, false)", [r.usage_date]));
      const u = await pool.query("select reserved, failed from public.whatsapp_usage where phone_number_id = 'PN3'");
      expect(u.rows[0]).toEqual({ reserved: 0, failed: 1 });
    });

    it("wamid repetido (reentrega do webhook) é rejeitado pelo banco", async () => {
      await pool.query("insert into public.whatsapp_messages (direction, wa_message_id, status) values ('in', 'wamid.X1', 'recebida')");
      await expect(pool.query("insert into public.whatsapp_messages (direction, wa_message_id, status) values ('in', 'wamid.X1', 'recebida')"))
        .rejects.toThrow(/duplicate key/);
    });

    it("status de entrega atualiza mensagem e contagem (idempotente)", async () => {
      const r = await asUser(pool, "service_role", async (db) => (await db.query("select public.whatsapp_reserve_send('PN4') as r")).rows[0].r);
      await pool.query("insert into public.whatsapp_messages (direction, wa_message_id, phone_number_id, status, usage_date, kind) values ('out', 'wamid.OUT1', 'PN4', 'enviada', $1, 'resposta')", [r.usage_date]);
      for (let i = 0; i < 2; i++) {
        await asUser(pool, "service_role", (db) => db.query("select public.whatsapp_record_status('wamid.OUT1', 'delivered', now(), 'service', false)"));
      }
      await asUser(pool, "service_role", (db) => db.query("select public.whatsapp_record_status('wamid.OUT1', 'sent')"));
      const m = await pool.query("select status, billable, pricing_category from public.whatsapp_messages where wa_message_id = 'wamid.OUT1'");
      expect(m.rows[0]).toEqual({ status: "entregue", billable: false, pricing_category: "service" });
      const u = await pool.query("select delivered from public.whatsapp_usage where phone_number_id = 'PN4'");
      expect(u.rows[0].delivered).toBe(1);
    });
  });

  describe("painel, auditoria e retenção", () => {
    it("dashboard para administrador", async () => {
      const r = await asUser(pool, admin, (db) => db.query("select public.get_dashboard(30) as d"));
      expect(r.rows[0].d.totals.questions).toBeGreaterThan(0);
      expect(r.rows[0].d.whatsapp.cap).toBe(900);
      const e = await asUser(pool, editor, (db) => db.query("select public.get_dashboard(30) as d"));
      expect(e.rows[0].d.whatsapp).toBeNull();
    });

    it("alteração de configuração fica auditada", async () => {
      await asUser(pool, admin, (db) => db.query(`update public.system_settings set value = value || '{"questions_days": 90}' where key = 'retention'`));
      const a = await pool.query("select actor_id, actor_role from public.audit_logs where entity = 'system_settings' and entity_id = 'retention'");
      expect(a.rows[0]).toEqual({ actor_id: admin, actor_role: "admin" });
      await expect(asUser(pool, editor, (db) => db.query(`update public.system_settings set value = '{}' where key = 'whatsapp' returning key`)))
        .resolves.toMatchObject({ rowCount: 0 });
    });

    it("retenção remove perguntas antigas", async () => {
      await pool.query("update public.questions set created_at = now() - interval '400 days' where status not in ('pendente','processando')");
      const r = await asUser(pool, admin, (db) => db.query("select public.purge_expired_data() as r"));
      expect(r.rows[0].r.questions).toBeGreaterThan(0);
      await expect(asUser(pool, colab, (db) => db.query("select public.purge_expired_data()"))).rejects.toThrow(/Acesso negado/);
    });
  });
});
