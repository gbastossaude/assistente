/** Cliente mínimo da WhatsApp Business Cloud API (Graph API oficial da Meta). */
export interface MetaSendResult {
    ok: boolean;
    messageId?: string;
    status?: number;
    errorCode?: string;
    errorMessage?: string;
    attempts: number;
    /** Erro 131047: fora da janela de 24 h (exigiria template pago). */
    windowExpired?: boolean;
}
export interface MetaSender {
    sendText(to: string, body: string): Promise<MetaSendResult>;
}
export interface MetaApiOptions {
    accessToken: string;
    phoneNumberId: string;
    apiVersion?: string;
    fetchImpl?: typeof fetch;
    maxAttempts?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    baseUrl?: string;
}
export declare class MetaCloudApi implements MetaSender {
    private readonly opts;
    private readonly fetchImpl;
    private readonly sleep;
    constructor(opts: MetaApiOptions);
    get endpoint(): string;
    sendText(to: string, body: string): Promise<MetaSendResult>;
}
