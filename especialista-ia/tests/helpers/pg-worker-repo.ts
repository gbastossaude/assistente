import type pg from "pg";
import type { RequiredInfoRule, RetrievedChunk, RetrievedFaq, SearchParams, SourceRef } from "../../packages/ai-core/src/index.ts";
import type { EntityCatalog, ProcessingJobRow } from "../../packages/shared/src/index.ts";
import type { ChunkInsert, QuestionForAnswer, ServerConfig, VersionForIndex, WorkerRepository } from "../../apps/local-worker/src/repository.ts";
import { asUser } from "./db.ts";

const toVector = (v: number[]) => `[${v.join(",")}]`;

/**
 * Mesmas operações do SupabaseWorkerRepository, executadas direto no PostgreSQL como o usuário
 * "worker" (role authenticated + JWT) — exercita as mesmas funções SQL e políticas RLS.
 * O Storage é simulado por um mapa em memória.
 */
export class PgWorkerRepository implements WorkerRepository {
  storage = new Map<string, Uint8Array>();
  whatsappCalls: Array<Record<string, unknown>> = [];
  whatsappResult: { ok: boolean; status?: string; error?: string } = { ok: true, status: "enviada" };

  constructor(private readonly pool: pg.Pool, private readonly userId: string, private readonly workerId: string) {}

  private q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return asUser(this.pool, this.userId, async (db) => (await db.query(sql, params)).rows as T[]);
  }

  async heartbeat(info: Record<string, unknown>) {
    return (await this.q<{ r: ServerConfig }>("select public.worker_heartbeat($1, $2) as r", [this.workerId, info]))[0].r;
  }
  claimJobs(types: string[], limit: number, lockSeconds: number) {
    return this.q<ProcessingJobRow>("select * from public.claim_jobs($1, $2, $3, $4)", [this.workerId, types, limit, lockSeconds]);
  }
  async extendLock(jobId: string, seconds: number) {
    await this.q("select public.extend_job_lock($1, $2, $3)", [jobId, this.workerId, seconds]);
  }
  async failJob(jobId: string, error: string, retryable: boolean) {
    return (await this.q<{ r: string }>("select public.fail_job($1, $2, $3, $4) as r", [jobId, this.workerId, error, retryable]))[0].r;
  }
  async releaseJobs() {
    return (await this.q<{ r: number }>("select public.release_jobs($1) as r", [this.workerId]))[0].r;
  }
  async getQuestion(id: string): Promise<QuestionForAnswer> {
    const [row] = await this.q("select id, channel, text_redacted, context, parent_question_id from public.questions where id = $1", [id]);
    let parentText: string | null = null;
    if (row.parent_question_id) {
      parentText = (await this.q("select text_redacted from public.questions where id = $1", [row.parent_question_id]))[0]?.text_redacted ?? null;
    }
    return { id: row.id, channel: row.channel, text: row.text_redacted, context: row.context ?? {}, parentText };
  }
  async getCatalog(): Promise<EntityCatalog> {
    const operators = await this.q("select id, name, aliases from public.operators where active");
    const products = await this.q("select id, operator_id, name, aliases from public.products where active");
    const cities = (await this.q("select distinct unnest(cities) c from public.knowledge_documents where status = 'ativo'")).map((r) => r.c);
    return { operators, products, cities };
  }
  getRules() {
    return this.q<RequiredInfoRule>("select * from public.required_info_rules where active");
  }
  searchChunks(p: SearchParams) {
    return this.q<RetrievedChunk>("select * from public.search_chunks($1, $2, $3, $4, $5, $6)", [
      p.embedding ? toVector(p.embedding) : null, p.text, p.embeddingModel, p.operatorIds, p.includeGeneral, p.limit]);
  }
  searchFaq(p: SearchParams) {
    return this.q<RetrievedFaq>("select * from public.search_faq($1, $2, $3, $4, $5)", [
      p.embedding ? toVector(p.embedding) : null, p.text, p.embeddingModel, p.operatorIds, p.limit]);
  }
  async saveAnswer(jobId: string, answer: Record<string, unknown>, sources: SourceRef[]) {
    return (await this.q<{ r: string }>("select public.save_answer($1, $2, $3, $4) as r", [jobId, this.workerId, answer, JSON.stringify(sources)]))[0].r;
  }
  async notifyWhatsapp(payload: { question_id?: string; action?: "flush" }) {
    this.whatsappCalls.push(payload);
    return this.whatsappResult;
  }
  async getVersion(id: string) {
    return (await this.q<VersionForIndex>("select id, document_id, storage_path, file_name, mime_type, sha256, ocr_requested from public.document_versions where id = $1", [id]))[0];
  }
  async downloadFile(path: string) {
    const f = this.storage.get(path);
    if (!f) throw new Error("arquivo não encontrado no storage simulado");
    return f;
  }
  async clearChunks(jobId: string) {
    await this.q("select public.clear_version_chunks($1, $2)", [jobId, this.workerId]);
  }
  async insertChunks(rows: ChunkInsert[]) {
    for (const r of rows) {
      await this.q(
        `insert into public.document_chunks (document_id, version_id, chunk_index, page_from, page_to, section, content, embedding, embedding_model, token_estimate)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [r.document_id, r.version_id, r.chunk_index, r.page_from, r.page_to, r.section, r.content, toVector(r.embedding), r.embedding_model, r.token_estimate]);
    }
  }
  async finalizeVersion(jobId: string, result: Record<string, unknown>) {
    return (await this.q<{ r: string }>("select public.finalize_document_version($1, $2, $3) as r", [jobId, this.workerId, result]))[0].r;
  }
  async getFaq(id: string) {
    return (await this.q("select id, question, answer from public.knowledge_faq where id = $1", [id]))[0];
  }
  async saveFaqEmbedding(jobId: string, embedding: number[], model: string) {
    await this.q("select public.save_faq_embedding($1, $2, $3, $4)", [jobId, this.workerId, toVector(embedding), model]);
  }
  async purgeExpired() {
    return (await this.q("select public.purge_expired_data() as r"))[0].r;
  }
  onNewJob() {
    return () => {};
  }
}
