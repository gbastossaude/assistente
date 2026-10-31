import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { adminUsersHandler, webhookHandler, whatsappSendHandler } from "../../supabase/functions/_shared/handlers.ts";
import { DB_SCHEMA, EDGE_FUNCTIONS } from "../../packages/shared/src/index.ts";
import { startGateway } from "./gateway.ts";
import { signJwt } from "./jwt.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const JWT_SECRET = "segredo-local-de-testes-com-mais-de-32-caracteres";
export const GOTRUE_IMAGE = "supabase/gotrue:v2.177.0";
export const POSTGREST_IMAGE = "postgrest/postgrest:v12.2.12";
const AUTH_PORT = 9999;
const REST_PORT = 3301;
export const GATEWAY_PORT = 54329;
export const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;
const PG_ADMIN = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const DB = "especialista_stack";

export const ANON_KEY = signJwt({ role: "anon", iss: "supabase", iat: 1700000000, exp: 2000000000 }, JWT_SECRET);
export const SERVICE_KEY = signJwt({ role: "service_role", iss: "supabase", iat: 1700000000, exp: 2000000000 }, JWT_SECRET);

export function dockerAvailable(): boolean {
  const r = spawnSync("docker", ["image", "inspect", GOTRUE_IMAGE, POSTGREST_IMAGE], { stdio: "ignore" });
  return r.status === 0;
}

async function waitFor(url: string, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Tempo esgotado aguardando ${url}`);
}

function docker(args: string[]) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

export interface Stack {
  pool: pg.Pool;
  gateway: Server;
  graphSent: Array<{ to: string; body: string }>;
  createUser(email: string, password: string, role: string, fullName: string): Promise<string>;
  stop(): Promise<void>;
}

export async function startStack(): Promise<Stack> {
  for (const n of ["esp-gotrue", "esp-postgrest"]) spawnSync("docker", ["rm", "-f", n], { stdio: "ignore" });
  const admin = new pg.Client({ connectionString: PG_ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  const dbUrl = new URL(PG_ADMIN);
  dbUrl.pathname = `/${DB}`;
  const pool = new pg.Pool({ connectionString: dbUrl.toString(), max: 10 });
  pool.on("error", () => {});
  await pool.query(readFileSync(path.join(import.meta.dirname, "bootstrap.sql"), "utf8").replace("current_database_placeholder", DB));

  docker(["run", "-d", "--name", "esp-gotrue", "--network", "host",
    "-e", "GOTRUE_API_HOST=127.0.0.1", "-e", `PORT=${AUTH_PORT}`, "-e", "GOTRUE_DB_DRIVER=postgres",
    "-e", `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:stack-pass@127.0.0.1:5432/${DB}`, "-e", "DB_NAMESPACE=auth",
    "-e", "GOTRUE_SITE_URL=http://127.0.0.1:5180", "-e", `API_EXTERNAL_URL=${GATEWAY_URL}/auth/v1`,
    "-e", `GOTRUE_JWT_SECRET=${JWT_SECRET}`, "-e", "GOTRUE_JWT_EXP=3600", "-e", "GOTRUE_JWT_AUD=authenticated",
    "-e", "GOTRUE_JWT_ADMIN_ROLES=service_role", "-e", "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated",
    "-e", "GOTRUE_DISABLE_SIGNUP=true", "-e", "GOTRUE_MAILER_AUTOCONFIRM=true", "-e", "GOTRUE_EXTERNAL_EMAIL_ENABLED=true",
    "-e", "GOTRUE_RATE_LIMIT_EMAIL_SENT=1000", GOTRUE_IMAGE]);
  await waitFor(`http://127.0.0.1:${AUTH_PORT}/health`, 90_000);

  for (const f of readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  }

  docker(["run", "-d", "--name", "esp-postgrest", "--network", "host",
    "-e", `PGRST_DB_URI=postgres://authenticator:stack-pass@127.0.0.1:5432/${DB}`, "-e", "PGRST_DB_SCHEMAS=public,especialista",
    "-e", "PGRST_DB_ANON_ROLE=anon", "-e", `PGRST_JWT_SECRET=${JWT_SECRET}`, "-e", "PGRST_DB_EXTRA_SEARCH_PATH=public,extensions",
    "-e", `PGRST_SERVER_PORT=${REST_PORT}`, "-e", "PGRST_SERVER_HOST=127.0.0.1", POSTGREST_IMAGE]);
  await waitFor(`http://127.0.0.1:${REST_PORT}/`, 60_000);

  // Cliente "do servidor" (service role) usado pelos handlers das Edge Functions.
  const service = createClient(GATEWAY_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: DB_SCHEMA } });
  const graphSent: Stack["graphSent"] = [];
  const graphFetch = (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    graphSent.push({ to: b.to, body: b.text.body });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.STACK${graphSent.length}` }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const envMap: Record<string, string> = {
    WHATSAPP_ACCESS_TOKEN: "token-teste", WHATSAPP_PHONE_NUMBER_ID: "PN-STACK", WHATSAPP_APP_SECRET: "app-secret", WHATSAPP_VERIFY_TOKEN: "verify",
  };
  const env = (k: string) => envMap[k] ?? "";
  const storageDir = path.join(ROOT, "node_modules/.cache/stack-storage");
  rmSync(storageDir, { recursive: true, force: true });
  const gateway = await startGateway({
    port: GATEWAY_PORT, jwtSecret: JWT_SECRET, authPort: AUTH_PORT, restPort: REST_PORT, pool, storageDir,
    functions: {
      [EDGE_FUNCTIONS.webhook]: (req) => webhookHandler(req, env, service, graphFetch),
      [EDGE_FUNCTIONS.send]: (req) => whatsappSendHandler(req, env, service, graphFetch),
      [EDGE_FUNCTIONS.adminUsers]: (req) => adminUsersHandler(req, env, service),
    },
  });
  await waitFor(`${GATEWAY_URL}/rest/v1/`, 30_000);

  return {
    pool,
    gateway,
    graphSent,
    async createUser(email, password, role, fullName) {
      const { data, error } = await service.auth.admin.createUser({
        email, password, email_confirm: true, app_metadata: { especialista_role: role, especialista_active: true }, user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      return data.user!.id;
    },
    async stop() {
      await new Promise<void>((r) => gateway.close(() => r()));
      for (const n of ["esp-gotrue", "esp-postgrest"]) spawnSync("docker", ["rm", "-f", n], { stdio: "ignore" });
      await pool.end();
    },
  };
}
