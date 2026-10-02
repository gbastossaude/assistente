import type { ClientBase, PoolConfig } from "pg";

/**
 * Configuração de conexão PostgreSQL (usada pela aplicação e pelos scripts).
 * - Remove `sslmode` da URL: no pg 8, `sslmode=require` vira verificação completa e anula o objeto `ssl`.
 * - Supabase (ou DATABASE_SSL=true) → conexão criptografada. Com DATABASE_CA_CERT (PEM do Supabase:
 *   Project Settings → Database → SSL Configuration) o certificado também é verificado.
 * - DATABASE_HOST / DATABASE_USER (opcionais) substituem o servidor / o usuário da URL — ajustam a conexão
 *   (ex.: pooler do Supabase, usuário dedicado) sem reescrever a URL que contém a senha.
 */
export function pgConfig(rawUrl: string | undefined, extra: PoolConfig = {}): PoolConfig {
  if (!rawUrl) throw new Error("DATABASE_URL não configurada (veja .env.example)");
  const url = new URL(rawUrl);
  const host = process.env.DATABASE_HOST?.trim();
  if (host) {
    if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error("DATABASE_HOST inválido: informe só o nome do servidor (ex.: aws-1-sa-east-1.pooler.supabase.com)");
    url.hostname = host;
  }
  const user = process.env.DATABASE_USER?.trim();
  if (user) {
    if (!/^[a-z0-9_.-]+$/i.test(user)) throw new Error("DATABASE_USER inválido (ex.: besmart_app.<id-do-projeto>)");
    url.username = user;
  }
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");
  const wantsSsl = process.env.DATABASE_SSL === "true" || (sslmode !== null && sslmode !== "disable") || /supabase\.(co|com)$/.test(url.hostname);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const searchPath = searchPathSql();
  return {
    connectionString: url.toString(),
    ssl: wantsSsl ? (ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false }) : undefined,
    // Aguardado pelo pool antes de entregar a conexão; se falhar, a conexão é descartada (nunca usada sem o schema).
    ...(searchPath ? { onConnect: async (client: ClientBase) => void (await client.query(searchPath)) } : {}),
    ...extra,
  } as PoolConfig;
}

/**
 * Schema PostgreSQL do sistema (DATABASE_SCHEMA). Padrão "public". Use outro nome (ex.: "besmart") para
 * instalar no mesmo banco de outro sistema (ex.: um projeto Supabase já existente) sem colidir com as tabelas dele.
 */
export function dbSchema(): string {
  const s = (process.env.DATABASE_SCHEMA ?? "").trim() || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(s)) throw new Error("DATABASE_SCHEMA inválido: use letras minúsculas, números e _ (ex.: besmart)");
  return s;
}

/**
 * Com schema próprio, toda conexão usa `search_path = <schema>, extensions` — sem "public": um nome de tabela
 * não encontrado no schema do sistema gera erro em vez de cair numa tabela homônima do outro sistema.
 * Requer conexão direta ou "Session pooler" (o modo transação do pooler não preserva o search_path).
 * Aplicado em `pgConfig` via `onConnect` do pg-pool.
 */
export function searchPathSql(schema = dbSchema()): string | null {
  return schema === "public" ? null : `set search_path to "${schema}", extensions`;
}
