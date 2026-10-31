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
    answer: {
        outcome: string;
        content: string;
        warnings: string[];
    } | null;
    sources: Array<{
        rank: number;
        title: string;
        operator_name: string | null;
        page_from: number | null;
        page_to: number | null;
        valid_until: string | null;
    }>;
}
export interface Reservation {
    allowed: boolean;
    reason?: string;
    usage_date?: string;
    month_count?: number;
    cap?: number;
}
export interface WhatsAppDb {
    registerInbound(a: {
        waMessageId: string;
        phoneNumberId: string;
        waId: string;
        variants: string[];
        type: string;
        body: string | null;
        sentAt: string;
    }): Promise<InboundRegistration>;
    updateInbound(messageId: string, status: string, error?: string | null): Promise<void>;
    createQuestion(a: {
        profileId: string;
        contactId: string;
        text: string;
        parentQuestionId: string | null;
        messageId: string;
    }): Promise<string>;
    createHandoff(a: {
        profileId: string;
        contactId: string;
        messageId: string;
    }): Promise<{
        handoff_id: string;
        existing: boolean;
    }>;
    context(): Promise<{
        settings: WhatsAppSettings;
        security: Record<string, unknown>;
        worker_online: boolean;
    }>;
    touchContact(contactId: string, field: "help" | "offline"): Promise<void>;
    prepareOutbound(a: {
        contactId: string;
        profileId: string | null;
        kind: string;
        body: string;
        questionId: string | null;
        handoffId: string | null;
        phoneNumberId: string;
    }): Promise<{
        duplicate: boolean;
        id?: string;
    }>;
    finishOutbound(a: {
        id: string;
        status: string;
        waMessageId?: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
        usageDate?: string | null;
        attempts: number;
    }): Promise<void>;
    reserveSend(phoneNumberId: string): Promise<Reservation>;
    recordSend(phoneNumberId: string, usageDate: string, success: boolean): Promise<void>;
    recordStatus(a: {
        waMessageId: string;
        status: string;
        at: string;
        pricingCategory: string | null;
        billable: boolean | null;
        errorCode: string | null;
        errorMessage: string | null;
    }): Promise<boolean>;
    answerPayload(questionId: string): Promise<AnswerPayload | null>;
    pendingAnswers(limit: number): Promise<string[]>;
    handoffTarget(handoffId: string): Promise<{
        handoff_id: string;
        status: string;
        profile_id: string | null;
        contact: WaContact | null;
    } | null>;
    logEvent(a: {
        signatureValid: boolean;
        kind: string;
        messages: number;
        statuses: number;
        outcome: string;
        error?: string | null;
    }): Promise<void>;
}
export declare function createRpcWhatsAppDb(rpc: RpcFn): WhatsAppDb;
