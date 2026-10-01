import { afterEach, describe, expect, it } from "vitest";
import { pgConfig } from "@/server/db/pg-config";

describe("configuração de conexão PostgreSQL", () => {
  afterEach(() => {
    delete process.env.DATABASE_CA_CERT;
    delete process.env.DATABASE_SSL;
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
