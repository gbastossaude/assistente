import type { PoolConfig } from "pg";

/**
 * Configuração de conexão PostgreSQL (usada pela aplicação e pelos scripts).
 * - Remove `sslmode` da URL: no pg 8, `sslmode=require` vira verificação completa e anula o objeto `ssl`.
 * - Supabase (ou DATABASE_SSL=true) → conexão criptografada. Com DATABASE_CA_CERT (PEM do Supabase:
 *   Project Settings → Database → SSL Configuration) o certificado também é verificado.
 */
export function pgConfig(rawUrl: string | undefined, extra: PoolConfig = {}): PoolConfig {
  if (!rawUrl) throw new Error("DATABASE_URL não configurada (veja .env.example)");
  const url = new URL(rawUrl);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");
  const wantsSsl = process.env.DATABASE_SSL === "true" || (sslmode !== null && sslmode !== "disable") || /supabase\.(co|com)$/.test(url.hostname);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  return {
    connectionString: url.toString(),
    ssl: wantsSsl ? (ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false }) : undefined,
    ...extra,
  };
}
