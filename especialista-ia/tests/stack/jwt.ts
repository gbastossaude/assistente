import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}
