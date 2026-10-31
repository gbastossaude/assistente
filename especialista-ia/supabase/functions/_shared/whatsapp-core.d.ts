import type { MetaSender } from "./meta-api.ts";
import type { WaContact, WhatsAppDb } from "./whatsapp-db.ts";
export interface CoreConfig {
    verifyToken: string;
    appSecret: string;
    phoneNumberId: string;
}
export interface CoreDeps {
    db: WhatsAppDb;
    meta: MetaSender | null;
    config: CoreConfig;
    now?: () => Date;
    log?: (msg: string, meta?: Record<string, unknown>) => void;
}
export interface HttpResult {
    status: number;
    body: string;
    headers?: Record<string, string>;
}
export declare const MESSAGES: {
    readonly help: string;
    readonly handoff: "Certo! Registrei seu pedido de atendimento humano. Um responsável vai falar com você pelo painel assim que possível.";
    readonly handoffExisting: "Seu pedido de atendimento humano já está registrado e será respondido assim que possível.";
    readonly unsupported: "Por enquanto consigo responder apenas mensagens de *texto*. Escreva sua dúvida, por favor.";
    readonly offline: string;
    readonly unauthorized: "Este número não está autorizado a usar o assistente. Procure o administrador da corretora.";
};
/** GET de verificação exigido pela Meta ao cadastrar o webhook. */
export declare function handleVerify(url: URL, verifyToken: string): HttpResult;
export declare function isHandoffCommand(text: string): boolean;
export declare function isHelpCommand(text: string): boolean;
export interface SendRequest {
    contact: WaContact;
    profileId: string | null;
    kind: "resposta" | "ajuda" | "confirmacao" | "encaminhamento" | "humano" | "aviso_offline" | "nao_suportado";
    text: string;
    questionId?: string | null;
    handoffId?: string | null;
}
export type SendStatus = "enviada" | "falhou" | "bloqueada_limite" | "janela_expirada" | "desativado" | "duplicada" | "sem_credenciais";
/**
 * Envio com todos os controles: liga/desliga, janela de 24 h, idempotência, teto de consumo
 * (reserva atômica no banco) e registro do resultado. Nunca envia templates pagos.
 */
export declare function sendControlled(deps: CoreDeps, req: SendRequest): Promise<{
    status: SendStatus;
    error?: string;
}>;
export interface WebhookSummary {
    messages: number;
    statuses: number;
    duplicates: number;
    unauthorized: number;
    queued: number;
    commands: number;
    ignored: number;
}
/** POST do webhook: valida a assinatura sobre o corpo bruto, registra e responde rápido. */
export declare function handleWebhook(rawBody: Uint8Array, signature: string | null, deps: CoreDeps): Promise<HttpResult & {
    summary?: WebhookSummary;
}>;
/** Envia a resposta gerada pelo worker para a pergunta (chamado pelo worker após salvar). */
export declare function sendAnswer(deps: CoreDeps, questionId: string): Promise<{
    status: SendStatus | "sem_resposta" | "nao_whatsapp";
    error?: string;
}>;
/** Reenvia respostas que falharam por erro transitório, ainda dentro da janela. */
export declare function flushPendingAnswers(deps: CoreDeps, limit?: number): Promise<{
    processed: number;
    results: Record<string, number>;
}>;
/** Resposta humana do painel ("Falar com responsável"). */
export declare function sendHumanReply(deps: CoreDeps, handoffId: string, text: string, responderName: string): Promise<{
    status: SendStatus;
    error?: string;
} | {
    status: "sem_contato";
}>;
