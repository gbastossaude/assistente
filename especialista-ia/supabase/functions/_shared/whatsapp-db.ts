/**
 * Acesso ao banco das Edge Functions do WhatsApp. Cada operação é uma única função SQL
 * (atômica, somente service_role) — o mesmo adaptador roda com supabase-js no Deno e com pg nos testes.
 */
export type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface InboundRegistration {
  duplicate: boolean;
  authorized?: boolean;
  message_id?: string;
  profile_id?: string;
  contact_id?: string;
  window_expires_at?: string;
  pending_question_id?: string | null;
  last_help_sent_at?: string | null;
  last_offline_notice_at?: string | null;
  recent_questions?: number;
}

export interface WhatsAppSettings {
  enabled: boolean;
  mode: string;
  monthly_cap: number;
  daily_cap: number;
  offline_ack: boolean;
  reply_unauthorized: boolean;
  max_answer_chars: number;
  graph_api_version: string;
}

export interface WaContact {
  id: string;
  wa_id: string;
  profile_id: string | null;
  window_expires_at: string | null;
}

export interface AnswerPayload {
  question_id: string;
  channel: string;
  status: string;
  contact: WaContact | null;
  answer: { outcome: string; content: string; warnings: string[] } | null;
  sources: Array<{ rank: number; title: string; operator_name: string | null; page_from: number | null; page_to: number | null; valid_until: string | null }>;
}

export interface Reservation {
  allowed: boolean;
  reason?: string;
  usage_date?: string;
  month_count?: number;
  cap?: number;
}

export interface WhatsAppDb {
  registerInbound(a: { waMessageId: string; phoneNumberId: string; waId: string; variants: string[]; type: string; body: string | null; sentAt: string }): Promise<InboundRegistration>;
  updateInbound(messageId: string, status: string, error?: string | null): Promise<void>;
  createQuestion(a: { profileId: string; contactId: string; text: string; parentQuestionId: string | null; messageId: string }): Promise<string>;
  createHandoff(a: { profileId: string; contactId: string; messageId: string }): Promise<{ handoff_id: string; existing: boolean }>;
  context(): Promise<{ settings: WhatsAppSettings; security: Record<string, unknown>; worker_online: boolean }>;
  touchContact(contactId: string, field: "help" | "offline"): Promise<void>;
  prepareOutbound(a: { contactId: string; profileId: string | null; kind: string; body: string; questionId: string | null; handoffId: string | null; phoneNumberId: string }): Promise<{ duplicate: boolean; id?: string }>;
  finishOutbound(a: { id: string; status: string; waMessageId?: string | null; errorCode?: string | null; errorMessage?: string | null; usageDate?: string | null; attempts: number }): Promise<void>;
  reserveSend(phoneNumberId: string): Promise<Reservation>;
  recordSend(phoneNumberId: string, usageDate: string, success: boolean): Promise<void>;
  recordStatus(a: { waMessageId: string; status: string; at: string; pricingCategory: string | null; billable: boolean | null; errorCode: string | null; errorMessage: string | null }): Promise<boolean>;
  answerPayload(questionId: string): Promise<AnswerPayload | null>;
  pendingAnswers(limit: number): Promise<string[]>;
  handoffTarget(handoffId: string): Promise<{ handoff_id: string; status: string; profile_id: string | null; contact: WaContact | null } | null>;
  logEvent(a: { signatureValid: boolean; kind: string; messages: number; statuses: number; outcome: string; error?: string | null }): Promise<void>;
}

export function createRpcWhatsAppDb(rpc: RpcFn): WhatsAppDb {
  return {
    registerInbound: async (a) => (await rpc("wa_register_inbound", {
      p_wa_message_id: a.waMessageId, p_phone_number_id: a.phoneNumberId, p_wa_id: a.waId, p_variants: a.variants,
      p_msg_type: a.type, p_body: a.body, p_sent_at: a.sentAt,
    })) as InboundRegistration,
    updateInbound: async (id, status, error) => void (await rpc("wa_update_inbound", { p_message_id: id, p_status: status, p_error: error ?? null })),
    createQuestion: async (a) => (await rpc("wa_create_question", {
      p_profile_id: a.profileId, p_contact_id: a.contactId, p_text: a.text, p_parent_question_id: a.parentQuestionId, p_message_id: a.messageId,
    })) as string,
    createHandoff: async (a) => (await rpc("wa_create_handoff", { p_profile_id: a.profileId, p_contact_id: a.contactId, p_message_id: a.messageId })) as { handoff_id: string; existing: boolean },
    context: async () => (await rpc("wa_context", {})) as { settings: WhatsAppSettings; security: Record<string, unknown>; worker_online: boolean },
    touchContact: async (id, field) => void (await rpc("wa_touch_contact", { p_contact_id: id, p_field: field })),
    prepareOutbound: async (a) => (await rpc("wa_prepare_outbound", {
      p_contact_id: a.contactId, p_profile_id: a.profileId, p_kind: a.kind, p_body: a.body, p_question_id: a.questionId,
      p_handoff_id: a.handoffId, p_phone_number_id: a.phoneNumberId,
    })) as { duplicate: boolean; id?: string },
    finishOutbound: async (a) => void (await rpc("wa_finish_outbound", {
      p_id: a.id, p_status: a.status, p_wa_message_id: a.waMessageId ?? null, p_error_code: a.errorCode ?? null,
      p_error_message: a.errorMessage ?? null, p_usage_date: a.usageDate ?? null, p_attempts: a.attempts,
    })),
    reserveSend: async (pn) => (await rpc("whatsapp_reserve_send", { p_phone_number_id: pn })) as Reservation,
    recordSend: async (pn, date, ok) => void (await rpc("whatsapp_record_send", { p_phone_number_id: pn, p_usage_date: date, p_success: ok })),
    recordStatus: async (a) => (await rpc("whatsapp_record_status", {
      p_wa_message_id: a.waMessageId, p_status: a.status, p_at: a.at, p_pricing_category: a.pricingCategory,
      p_billable: a.billable, p_error_code: a.errorCode, p_error_message: a.errorMessage,
    })) as boolean,
    answerPayload: async (q) => (await rpc("wa_answer_payload", { p_question_id: q })) as AnswerPayload | null,
    pendingAnswers: async (limit) => ((await rpc("wa_pending_answers", { p_limit: limit })) as string[] | null) ?? [],
    handoffTarget: async (h) => (await rpc("wa_handoff_target", { p_handoff_id: h })) as Awaited<ReturnType<WhatsAppDb["handoffTarget"]>>,
    logEvent: async (a) => void (await rpc("wa_log_event", {
      p_signature_valid: a.signatureValid, p_kind: a.kind, p_messages: a.messages, p_statuses: a.statuses, p_outcome: a.outcome, p_error: a.error ?? null,
    })),
  };
}
