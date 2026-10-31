import { describe, expect, it } from "vitest";
import { MetaCloudApi } from "../../supabase/functions/_shared/meta-api.ts";
import { computeSignature, verifyMetaSignature } from "../../supabase/functions/_shared/signature.ts";
import { handleVerify, isHandoffCommand, isHelpCommand } from "../../supabase/functions/_shared/whatsapp-core.ts";
import { execFileSync } from "node:child_process";

describe("assinatura X-Hub-Signature-256", () => {
  it("aceita assinatura correta do corpo bruto e recusa alterações", async () => {
    const body = new TextEncoder().encode('{"object":"whatsapp_business_account","entry":[]}');
    const sig = await computeSignature(body, "segredo-app");
    expect(await verifyMetaSignature(body, sig, "segredo-app")).toBe(true);
    expect(await verifyMetaSignature(body, sig.toUpperCase().replace("SHA256", "sha256"), "segredo-app")).toBe(true);
    expect(await verifyMetaSignature(new TextEncoder().encode('{"object":"x"}'), sig, "segredo-app")).toBe(false);
    expect(await verifyMetaSignature(body, sig, "outro-segredo")).toBe(false);
    expect(await verifyMetaSignature(body, null, "segredo-app")).toBe(false);
    expect(await verifyMetaSignature(body, "sha256=abc", "segredo-app")).toBe(false);
    expect(await verifyMetaSignature(body, sig, "")).toBe(false);
  });
  it("confere com HMAC calculado pelo openssl (vetor externo)", async () => {
    const body = "payload de teste";
    const expected = execFileSync("sh", ["-c", `printf '%s' '${body}' | openssl dgst -sha256 -hmac 'k3y' | awk '{print $2}'`]).toString().trim();
    expect(await computeSignature(body, "k3y")).toBe(`sha256=${expected}`);
  });
});

describe("verificação GET do webhook", () => {
  const url = (q: string) => new URL(`https://x.supabase.co/functions/v1/whatsapp-webhook?${q}`);
  it("devolve o challenge com token correto", () => {
    expect(handleVerify(url("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=12345"), "tok")).toMatchObject({ status: 200, body: "12345" });
  });
  it("recusa token errado, modo errado ou token não configurado", () => {
    expect(handleVerify(url("hub.mode=subscribe&hub.verify_token=x&hub.challenge=1"), "tok").status).toBe(403);
    expect(handleVerify(url("hub.mode=unsubscribe&hub.verify_token=tok&hub.challenge=1"), "tok").status).toBe(403);
    expect(handleVerify(url("hub.mode=subscribe&hub.verify_token=&hub.challenge=1"), "").status).toBe(403);
    expect(handleVerify(url("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=<script>"), "tok").status).toBe(403);
  });
});

describe("comandos", () => {
  it("reconhece pedido de atendimento humano e ajuda", () => {
    expect(isHandoffCommand("Falar com responsável")).toBe(true);
    expect(isHandoffCommand("quero falar com um atendente")).toBe(true);
    expect(isHandoffCommand("O responsável pela Amil aprovou a carência?")).toBe(false);
    expect(isHelpCommand("Oi!")).toBe(true);
    expect(isHelpCommand("Oi, a Amil aceita 3 vidas?")).toBe(false);
  });
});

describe("cliente da Cloud API", () => {
  const okResponse = (id = "wamid.OK") => new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id }] }), { status: 200 });
  const errResponse = (status: number, code: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: { code, message: `erro ${code}` } }), { status, headers });

  it("envia texto no formato oficial", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const api = new MetaCloudApi({ accessToken: "TOKEN", phoneNumberId: "PN123", fetchImpl: async (url, init) => ((captured = { url: String(url), init: init! }), okResponse()), sleep: async () => {} });
    const r = await api.sendText("5511987654321", "Olá");
    expect(r).toMatchObject({ ok: true, messageId: "wamid.OK", attempts: 1 });
    expect(captured!.url).toBe("https://graph.facebook.com/v23.0/PN123/messages");
    expect((captured!.init.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(captured!.init.body as string)).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "5511987654321", type: "text", text: { preview_url: false, body: "Olá" },
    });
  });

  it("repete em limite de taxa/erro temporário respeitando Retry-After", async () => {
    const waits: number[] = [];
    const responses = [errResponse(429, 130429, { "retry-after": "2" }), errResponse(503, 131000), okResponse("wamid.3")];
    const api = new MetaCloudApi({ accessToken: "T", phoneNumberId: "P", fetchImpl: async () => responses.shift()!, sleep: async (ms) => void waits.push(ms) });
    const r = await api.sendText("55", "x");
    expect(r).toMatchObject({ ok: true, attempts: 3, messageId: "wamid.3" });
    expect(waits).toEqual([2000, 2000]);
  });

  it("não repete erro definitivo e identifica janela expirada (131047)", async () => {
    let calls = 0;
    const api = new MetaCloudApi({ accessToken: "T", phoneNumberId: "P", fetchImpl: async () => (calls++, errResponse(400, 131047)), sleep: async () => {} });
    const r = await api.sendText("55", "x");
    expect(calls).toBe(1);
    expect(r).toMatchObject({ ok: false, windowExpired: true, errorCode: "131047" });
  });

  it("falha de rede esgota as tentativas", async () => {
    const api = new MetaCloudApi({ accessToken: "T", phoneNumberId: "P", maxAttempts: 3, fetchImpl: async () => { throw new TypeError("fetch failed"); }, sleep: async () => {} });
    const r = await api.sendText("55", "x");
    expect(r).toMatchObject({ ok: false, attempts: 3, errorCode: "network" });
  });
});

describe("código compartilhado copiado para as Edge Functions", () => {
  it("está sincronizado com packages/shared", () => {
    expect(() => execFileSync("node", ["scripts/sync-edge-shared.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
