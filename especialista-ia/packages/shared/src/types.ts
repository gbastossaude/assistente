/** Tipos das linhas do banco usados pelos clientes (painel, extensão e worker). */
import type { AnswerOutcome, Channel, DocumentStatus, QuestionStatus, Role } from "./constants.ts";

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string;
  role: Role;
  active: boolean;
  whatsapp_phone: string | null;
  whatsapp_approved: boolean;
  whatsapp_approved_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface OperatorRow {
  id: string;
  name: string;
  slug: string;
  kind: "operadora" | "seguradora" | "administradora";
  ans_registry: string | null;
  aliases: string[];
  website: string | null;
  notes: string | null;
  active: boolean;
}

export interface ProductRow {
  id: string;
  operator_id: string;
  name: string;
  aliases: string[];
  contract_types: string[];
  notes: string | null;
  active: boolean;
}

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  operator_id: string | null;
  product_id: string | null;
  administrator_id: string | null;
  category: string;
  rule_nature: string;
  contract_types: string[];
  is_national: boolean;
  states: string[];
  cities: string[];
  lives_min: number | null;
  lives_max: number | null;
  published_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  version_label: string | null;
  priority: number;
  status: DocumentStatus;
  current_version_id: string | null;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_number: number;
  version_label: string | null;
  change_notes: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  status: "enviado" | "processando" | "indexado" | "revisao" | "erro" | "substituido" | "descartado";
  page_count: number | null;
  char_count: number | null;
  chunk_count: number | null;
  quality: Record<string, unknown>;
  needs_review: boolean;
  review_reason: string | null;
  ocr_used: boolean;
  ocr_requested: boolean;
  error_message: string | null;
  embedding_model: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface QuestionRow {
  id: string;
  profile_id: string | null;
  channel: Channel;
  text_redacted: string;
  context: Record<string, unknown>;
  detected: Record<string, unknown>;
  topic: string | null;
  operator_id: string | null;
  status: QuestionStatus;
  pii_redacted: boolean;
  injection_flag: boolean;
  is_favorite: boolean;
  parent_question_id: string | null;
  created_at: string;
  answered_at: string | null;
  latency_ms: number | null;
}

export interface AnswerRow {
  id: string;
  question_id: string;
  outcome: AnswerOutcome;
  content: string;
  confidence: number | null;
  warnings: string[];
  missing_fields: string[];
  provider: string | null;
  model: string | null;
  total_ms: number | null;
  created_at: string;
}

export interface AnswerSourceRow {
  id: string;
  answer_id: string;
  rank: number;
  document_id: string | null;
  faq_id: string | null;
  title: string;
  operator_name: string | null;
  page_from: number | null;
  page_to: number | null;
  excerpt: string | null;
  score: number | null;
  valid_until: string | null;
  rule_nature: string | null;
}

export interface ProcessingJobRow {
  id: string;
  type: "answer_question" | "index_document" | "index_faq";
  status: "pendente" | "processando" | "concluido" | "falhou" | "cancelado" | "expirado";
  priority: number;
  question_id: string | null;
  document_version_id: string | null;
  faq_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  available_at: string;
  expires_at: string | null;
  locked_by: string | null;
  lock_expires_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ServiceStatus {
  worker_online: boolean;
  worker_last_seen_at: string | null;
  ai_ok: boolean;
  chat_model: string | null;
  pending_jobs: number;
  server_time: string;
}
