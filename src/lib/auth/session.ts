/** Sessão em JWT (HS256) — compatível com Edge (middleware) e Node. */
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@/lib/domain/constants";

export const SESSION_COOKIE = "bs_session";

export interface SessionPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres)");
  return new TextEncoder().encode(s);
}

export function sessionTtlSeconds() {
  return Math.max(1, Number(process.env.SESSION_TTL_HOURS ?? 12)) * 3600;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name, email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${sessionTtlSeconds()}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, name: String(payload.name), email: String(payload.email), role: payload.role as Role };
  } catch {
    return null;
  }
}
