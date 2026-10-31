/** Validação do cabeçalho X-Hub-Signature-256 da Meta (HMAC-SHA256 do corpo bruto com o App Secret). */

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante para não vazar informação por tempo de resposta. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function computeSignature(rawBody: Uint8Array | string, appSecret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = typeof rawBody === "string" ? enc.encode(rawBody) : new Uint8Array(rawBody);
  return "sha256=" + toHex(await crypto.subtle.sign("HMAC", key, data));
}

export async function verifyMetaSignature(rawBody: Uint8Array | string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !appSecret || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const expected = await computeSignature(rawBody, appSecret);
  return timingSafeEqual(expected, header.toLowerCase());
}
