/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados, schema "especialista" */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RequiredInfoRule, RetrievedChunk, RetrievedFaq, Retriever, SearchParams, SourceRef } from "@especialista/ai-core";
import { DB_SCHEMA, KNOWLEDGE_BUCKET, type EntityCatalog, type ProcessingJobRow, type QuestionContext } from "@especialista/shared";
import type { WorkerConfig } from "./config.ts";

export interface QuestionForAnswer {
  id: string;
  channel: "extension" | "whatsapp" | "admin";
  text: string;
  context: QuestionContext;
  parentText: string | null;
}

export interface VersionForIndex {
  id: string;
  document_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  sha256: string;
  ocr_requested: boolean;
}

export interface ChunkInsert {
  document_id: string;
  version_id: string;
  chunk_index: number;
  page_from: number;
  page_to: number;
  section: string | null;
  content: string;
  embedding: number[];
  embedding_model: string;
  token_estimate: number;
}

export interface ServerConfig {
  ai?: Record<string, unknown>;
  worker?: Record<string, unknown>;
  documents?: Record<string, unknown>;
  source_priority?: Record<string, unknown>;
  security?: Record<string, unknown>;
}

/** Tudo o que o worker faz no banco — implementado com supabase-js e simulado nos testes. */
export interface WorkerRepository extends Retriever {
  heartbeat(info: Record<string, unknown>): Promise<ServerConfig>;
  claimJobs(types: string[], limit: number, lockSeconds: number): Promise<ProcessingJobRow[]>;
  extendLock(jobId: string, seconds: number): Promise<void>;
  failJob(jobId: string, error: string, retryable: boolean): Promise<string>;
  releaseJobs(): Promise<number>;
  getQuestion(questionId: string): Promise<QuestionForAnswer>;
  getCatalog(): Promise<EntityCatalog>;
  getRules(): Promise<RequiredInfoRule[]>;
  saveAnswer(jobId: string, answer: Record<string, unknown>, sources: SourceRef[]): Promise<string>;
  notifyWhatsapp(payload: { question_id?: string; action?: "flush" }): Promise<{ ok: boolean; status?: string; error?: string }>;
  getVersion(versionId: string): Promise<VersionForIndex>;
  downloadFile(storagePath: string): Promise<Uint8Array>;
  clearChunks(jobId: string): Promise<void>;
  insertChunks(rows: ChunkInsert[]): Promise<void>;
  finalizeVersion(jobId: string, result: Record<string, unknown>): Promise<string>;
  getFaq(faqId: string): Promise<{ id: string; question: string; answer: string }>;
  saveFaqEmbedding(jobId: string, embedding: number[], model: string): Promise<void>;
  purgeExpired(): Promise<unknown>;
  onNewJob(cb: () => void): () => void;
}

const toVector = (v: number[]) => `[${v.join(",")}]`;

export class SupabaseWorkerRepository implements WorkerRepository {
  readonly client: SupabaseClient<any, any, any>;

  constructor(private readonly cfg: WorkerConfig) {
    this.client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
      db: { schema: DB_SCHEMA },
      global: { headers: { "x-client-info": "especialista-worker" } },
    });
  }

  /** Autentica com a conta de máquina (papel "worker"). Nenhuma chave administrativa fica no computador. */
  async signIn(): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email: this.cfg.workerEmail, password: this.cfg.workerPassword });
    if (error) throw new Error(`Falha ao autenticar o worker: ${error.message}`);
    const { data, error: pErr } = await this.client.from("profiles").select("role, active").single();
    if (pErr) throw new Error(`Não foi possível ler o perfil do worker: ${pErr.message}`);
    if (data.role !== "worker" || !data.active) {
      throw new Error(`A conta ${this.cfg.workerEmail} precisa ter papel "worker" e estar ativa (atual: ${data.role}, ativo=${data.active}).`);
    }
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  }

  heartbeat(info: Record<string, unknown>) {
    return this.rpc<ServerConfig>("worker_heartbeat", { p_worker_id: this.cfg.workerId, p_info: info });
  }
  claimJobs(types: string[], limit: number, lockSeconds: number) {
    return this.rpc<ProcessingJobRow[]>("claim_jobs", { p_worker_id: this.cfg.workerId, p_types: types, p_limit: limit, p_lock_seconds: lockSeconds });
  }
  async extendLock(jobId: string, seconds: number) {
    await this.rpc("extend_job_lock", { p_job_id: jobId, p_worker_id: this.cfg.workerId, p_seconds: seconds });
  }
  failJob(jobId: string, error: string, retryable: boolean) {
    return this.rpc<string>("fail_job", { p_job_id: jobId, p_worker_id: this.cfg.workerId, p_error: error, p_retryable: retryable });
  }
  releaseJobs() {
    return this.rpc<number>("release_jobs", { p_worker_id: this.cfg.workerId });
  }

  async getQuestion(questionId: string): Promise<QuestionForAnswer> {
    const { data, error } = await this.client
      .from("questions")
      .select("id, channel, text_redacted, context, parent_question_id")
      .eq("id", questionId)
      .single();
    if (error) throw new Error(`questions: ${error.message}`);
    let parentText: string | null = null;
    if (data.parent_question_id) {
      const p = await this.client.from("questions").select("text_redacted").eq("id", data.parent_question_id).maybeSingle();
      parentText = p.data?.text_redacted ?? null;
    }
    return { id: data.id, channel: data.channel, text: data.text_redacted, context: data.context ?? {}, parentText };
  }

  async getCatalog(): Promise<EntityCatalog> {
    const [ops, prods, docs] = await Promise.all([
      this.client.from("operators").select("id, name, aliases").eq("active", true),
      this.client.from("products").select("id, operator_id, name, aliases").eq("active", true),
      this.client.from("knowledge_documents").select("cities").eq("status", "ativo"),
    ]);
    if (ops.error) throw new Error(`operators: ${ops.error.message}`);
    const cities = [...new Set((docs.data ?? []).flatMap((d: { cities: string[] }) => d.cities ?? []))];
    return { operators: ops.data ?? [], products: prods.data ?? [], cities };
  }

  async getRules(): Promise<RequiredInfoRule[]> {
    const { data, error } = await this.client.from("required_info_rules").select("*").eq("active", true);
    if (error) throw new Error(`required_info_rules: ${error.message}`);
    return data as RequiredInfoRule[];
  }

  async searchChunks(p: SearchParams): Promise<RetrievedChunk[]> {
    return this.rpc<RetrievedChunk[]>("search_chunks", {
      p_query_embedding: p.embedding ? toVector(p.embedding) : null,
      p_query_text: p.text,
      p_embedding_model: p.embeddingModel,
      p_operator_ids: p.operatorIds,
      p_include_general: p.includeGeneral,
      p_match_count: p.limit,
    });
  }

  async searchFaq(p: SearchParams): Promise<RetrievedFaq[]> {
    return this.rpc<RetrievedFaq[]>("search_faq", {
      p_query_embedding: p.embedding ? toVector(p.embedding) : null,
      p_query_text: p.text,
      p_embedding_model: p.embeddingModel,
      p_operator_ids: p.operatorIds,
      p_match_count: p.limit,
    });
  }

  saveAnswer(jobId: string, answer: Record<string, unknown>, sources: SourceRef[]) {
    return this.rpc<string>("save_answer", {
      p_job_id: jobId,
      p_worker_id: this.cfg.workerId,
      p_answer: answer,
      p_sources: sources.map((s) => ({
        rank: s.rank, document_id: s.document_id, version_id: s.version_id, chunk_id: s.chunk_id, faq_id: s.faq_id,
        title: s.title, operator_name: s.operator_name, page_from: s.page_from, page_to: s.page_to,
        excerpt: s.excerpt, score: s.score, valid_until: s.valid_until, rule_nature: s.rule_nature,
      })),
    });
  }

  async notifyWhatsapp(payload: { question_id?: string; action?: "flush" }) {
    const { data, error } = await this.client.functions.invoke(this.cfg.whatsappFunctionName, { body: payload });
    if (error) return { ok: false, error: error.message };
    return { ok: true, status: (data as { status?: string })?.status };
  }

  async getVersion(versionId: string): Promise<VersionForIndex> {
    const { data, error } = await this.client
      .from("document_versions")
      .select("id, document_id, storage_path, file_name, mime_type, sha256, ocr_requested")
      .eq("id", versionId)
      .single();
    if (error) throw new Error(`document_versions: ${error.message}`);
    return data as VersionForIndex;
  }

  async downloadFile(storagePath: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(KNOWLEDGE_BUCKET).download(storagePath);
    if (error || !data) throw new Error(`Falha ao baixar o arquivo: ${error?.message ?? "vazio"}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  async clearChunks(jobId: string) {
    await this.rpc("clear_version_chunks", { p_job_id: jobId, p_worker_id: this.cfg.workerId });
  }

  async insertChunks(rows: ChunkInsert[]) {
    const { error } = await this.client.from("document_chunks").insert(rows.map((r) => ({ ...r, embedding: toVector(r.embedding) })));
    if (error) throw new Error(`document_chunks: ${error.message}`);
  }

  finalizeVersion(jobId: string, result: Record<string, unknown>) {
    return this.rpc<string>("finalize_document_version", { p_job_id: jobId, p_worker_id: this.cfg.workerId, p_result: result });
  }

  async getFaq(faqId: string) {
    const { data, error } = await this.client.from("knowledge_faq").select("id, question, answer").eq("id", faqId).single();
    if (error) throw new Error(`knowledge_faq: ${error.message}`);
    return data;
  }

  async saveFaqEmbedding(jobId: string, embedding: number[], model: string) {
    await this.rpc("save_faq_embedding", { p_job_id: jobId, p_worker_id: this.cfg.workerId, p_embedding: toVector(embedding), p_model: model });
  }

  purgeExpired() {
    return this.rpc("purge_expired_data", {});
  }

  /** Realtime: acorda o worker assim que uma tarefa é criada (a consulta periódica continua como garantia). */
  onNewJob(cb: () => void): () => void {
    const channel = this.client
      .channel("processing-jobs")
      .on("postgres_changes", { event: "INSERT", schema: DB_SCHEMA, table: "processing_jobs" }, () => cb())
      .subscribe();
    return () => void this.client.removeChannel(channel);
  }
}
