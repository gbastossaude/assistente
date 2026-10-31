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

const RETRYABLE_CODES = new Set(["4", "80007", "130429", "131000", "131016", "131056", "133004"]);

export class MetaCloudApi implements MetaSender {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: MetaApiOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get endpoint(): string {
    const base = this.opts.baseUrl ?? "https://graph.facebook.com";
    return `${base}/${this.opts.apiVersion ?? "v23.0"}/${this.opts.phoneNumberId}/messages`;
  }

  async sendText(to: string, body: string): Promise<MetaSendResult> {
    const max = this.opts.maxAttempts ?? 3;
    let last: MetaSendResult = { ok: false, attempts: 0 };
    for (let attempt = 1; attempt <= max; attempt++) {
      let retryAfterMs = 1000 * 2 ** (attempt - 1);
      try {
        const res = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { authorization: `Bearer ${this.opts.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
        });
        const data = (await res.json().catch(() => ({}))) as {
          messages?: Array<{ id: string }>;
          error?: { code?: number; message?: string; error_data?: { details?: string } };
        };
        if (res.ok && data.messages?.[0]?.id) return { ok: true, messageId: data.messages[0].id, status: res.status, attempts: attempt };
        const code = String(data.error?.code ?? res.status);
        last = {
          ok: false, status: res.status, errorCode: code, attempts: attempt,
          errorMessage: (data.error?.message ?? `HTTP ${res.status}`).slice(0, 300),
          windowExpired: code === "131047",
        };
        const retryAfter = Number(res.headers.get("retry-after"));
        if (retryAfter > 0) retryAfterMs = Math.min(retryAfter * 1000, 30_000);
        const retryable = res.status === 429 || res.status >= 500 || RETRYABLE_CODES.has(code);
        if (!retryable) return last;
      } catch (err) {
        last = { ok: false, attempts: attempt, errorCode: "network", errorMessage: `Falha de rede/tempo limite: ${(err as Error).message}`.slice(0, 300) };
      }
      if (attempt < max) await this.sleep(retryAfterMs);
    }
    return last;
  }
}
