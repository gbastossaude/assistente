import { afterEach, describe, expect, it } from "vitest";
import { pgConfig } from "@/server/db/pg-config";

describe("configuração de conexão PostgreSQL", () => {
  afterEach(() => {
    delete process.env.DATABASE_CA_CERT;
    delete process.env.DATABASE_SSL;
    delete process.env.DATABASE_HOST;
  });
  it("DATABASE_HOST substitui o host da URL e mantém usuário/senha", () => {
    process.env.DATABASE_HOST = "aws-1-sa-east-1.pooler.supabase.com";
    const c = pgConfig("postgresql://besmart_app.abc:s3nha@aws-X-sa-east-1.pooler.supabase.com:5432/postgres");
    expect(c.connectionString).toBe("postgresql://besmart_app.abc:s3nha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres");
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
  });
  it("rejeita DATABASE_HOST com URL ou porta", () => {
    process.env.DATABASE_HOST = "https://x.com:5432";
    expect(() => pgConfig("postgres://u:p@localhost:5432/db")).toThrow(/DATABASE_HOST/);
  });
  it("Supabase: remove sslmode da URL e ativa SSL criptografado", () => {
    const c = pgConfig("postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require");
    expect(c.connectionString).not.toContain("sslmode");
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
  });
  it("verifica o certificado quando DATABASE_CA_CERT é informado", () => {
    process.env.DATABASE_CA_CERT = "-----BEGIN CERTIFICATE-----\\nX\\n-----END CERTIFICATE-----";
    const c = pgConfig("postgresql://u:p@db.abc.supabase.co:5432/postgres");
    expect(c.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----", rejectUnauthorized: true });
  });
  it("PostgreSQL local sem SSL", () => {
    expect(pgConfig("postgres://u:p@localhost:5432/db").ssl).toBeUndefined();
  });
  it("exige DATABASE_URL", () => {
    expect(() => pgConfig(undefined)).toThrow(/DATABASE_URL/);
  });
});

describe("DATABASE_SCHEMA (instalação no banco de outro sistema)", () => {
  it("padrão public: sem search_path e sem hook de conexão", async () => {
    const { dbSchema, searchPathSql, pgConfig } = await import("@/server/db/pg-config");
    const prev = process.env.DATABASE_SCHEMA;
    delete process.env.DATABASE_SCHEMA;
    try {
      expect(dbSchema()).toBe("public");
      expect(searchPathSql()).toBeNull();
      expect((pgConfig("postgres://u:p@localhost/db") as { onConnect?: unknown }).onConnect).toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.DATABASE_SCHEMA = prev;
    }
  });
  it("schema próprio: search_path sem public e aplicado em toda conexão", async () => {
    const { searchPathSql, pgConfig } = await import("@/server/db/pg-config");
    const prev = process.env.DATABASE_SCHEMA;
    process.env.DATABASE_SCHEMA = "besmart";
    try {
      expect(searchPathSql()).toBe('set search_path to "besmart", extensions');
      const cfg = pgConfig("postgres://u:p@localhost/db") as { onConnect?: (c: { query: (s: string) => Promise<unknown> }) => Promise<void> };
      const calls: string[] = [];
      await cfg.onConnect!({ query: async (q: string) => void calls.push(q) });
      expect(calls).toEqual(['set search_path to "besmart", extensions']);
      process.env.DATABASE_SCHEMA = 'x"; drop table users; --';
      expect(() => searchPathSql()).toThrow(/DATABASE_SCHEMA inválido/);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = prev;
    }
  });
});
