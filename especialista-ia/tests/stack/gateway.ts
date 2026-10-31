/**
 * Gateway local que imita o roteamento do Supabase (Kong): /auth/v1 → GoTrue, /rest/v1 → PostgREST,
 * /storage/v1 → Storage emulado (com as MESMAS políticas RLS de storage.objects), /functions/v1 → handlers
 * das Edge Functions executados em Node. Somente para testes.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import type pg from "pg";
import { verifyJwt } from "./jwt.ts";

export interface GatewayOptions {
  port: number;
  jwtSecret: string;
  authPort: number;
  restPort: number;
  pool: pg.Pool;
  storageDir: string;
  functions: Record<string, (req: Request) => Promise<Response>>;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-upsert, cache-control, prefer, range, accept-profile, content-profile, x-supabase-api-version, x-retry-count",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-expose-headers": "content-range, x-supabase-api-version, content-type",
};

/** Extrai o arquivo de um corpo multipart/form-data (formato usado pelo storage-js no navegador). */
function parseMultipart(body: Buffer, contentType: string): { data: Buffer; mime: string } | null {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundary) return null;
  const sep = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let start = body.indexOf(sep);
  while (start >= 0) {
    const next = body.indexOf(sep, start + sep.length);
    if (next < 0) break;
    const part = body.subarray(start + sep.length + 2, next - 2);
    const headerEnd = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, headerEnd).toString("utf8");
    if (/filename=|name=""/i.test(headers) || /content-type/i.test(headers)) {
      const mime = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim() ?? "application/octet-stream";
      if (!/name="cacheControl"/i.test(headers)) return { data: Buffer.from(part.subarray(headerEnd + 4)), mime };
    }
    start = next;
  }
  return null;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function proxy(req: IncomingMessage, res: ServerResponse, port: number, pathRewrite: string, body: Buffer) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  delete headers["content-length"];
  const up = httpRequest({ host: "127.0.0.1", port, path: pathRewrite, method: req.method, headers: { ...headers, "content-length": String(body.length) } }, (r) => {
    const h = { ...r.headers, ...CORS };
    res.writeHead(r.statusCode ?? 502, h);
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502, CORS); res.end(JSON.stringify({ error: e.message })); });
  up.end(body);
}

export function startGateway(o: GatewayOptions): Promise<Server> {
  mkdirSync(o.storageDir, { recursive: true });
  const claimsOf = (req: IncomingMessage) => {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || String(req.headers.apikey ?? "");
    return token ? verifyJwt(token, o.jwtSecret) : null;
  };
  /** Executa no banco como o papel do JWT — aplica as políticas RLS de storage.objects. */
  const asRole = async <T>(claims: Record<string, unknown> | null, fn: (c: pg.PoolClient) => Promise<T>) => {
    const c = await o.pool.connect();
    try {
      await c.query("begin");
      const role = String(claims?.role ?? "anon");
      await c.query(`set local role ${["anon", "authenticated", "service_role"].includes(role) ? role : "anon"}`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? { role: "anon" })]);
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (err) {
      await c.query("rollback").catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  };
  const sign = (p: string, exp: number) => createHmac("sha256", o.jwtSecret).update(`${p}:${exp}`).digest("base64url");
  const fileOf = (bucket: string, name: string) => path.join(o.storageDir, bucket, ...name.split("/").map((s) => s.replace(/\.\./g, "_")));

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return void res.writeHead(204, CORS).end();
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${o.port}`);
      const body = await readBody(req);
      if (url.pathname.startsWith("/auth/v1")) return proxy(req, res, o.authPort, url.pathname.slice(8) + url.search, body);
      if (url.pathname.startsWith("/rest/v1")) return proxy(req, res, o.restPort, url.pathname.slice(8) + url.search, body);

      if (url.pathname.startsWith("/functions/v1/")) {
        const name = url.pathname.split("/")[3];
        const fn = o.functions[name];
        if (!fn) return void res.writeHead(404, CORS).end("{}");
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const r = await fn(new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : new Uint8Array(body) }));
        const outHeaders: Record<string, string> = {};
        r.headers.forEach((v, k) => (outHeaders[k] = v));
        res.writeHead(r.status, { ...outHeaders, ...CORS });
        return void res.end(Buffer.from(await r.arrayBuffer()));
      }

      const m = /^\/storage\/v1\/object\/(sign\/|authenticated\/|public\/)?([^/]+)\/(.+)$/.exec(url.pathname);
      if (m) {
        const [, kind, bucket, rawName] = m;
        const name = decodeURIComponent(rawName);
        const claims = claimsOf(req);
        if (kind === "sign/" && req.method === "GET") {
          const [p, exp] = String(url.searchParams.get("token") ?? "").split(".");
          if (!p || Number(exp) < Date.now() / 1000 || sign(`${bucket}/${name}`, Number(exp)) !== p || !existsSync(fileOf(bucket, name))) {
            return void res.writeHead(400, CORS).end(JSON.stringify({ error: "token inválido" }));
          }
          res.writeHead(200, { ...CORS, "content-type": "application/octet-stream" });
          return void res.end(readFileSync(fileOf(bucket, name)));
        }
        if (kind === "sign/" && req.method === "POST") {
          const visible = await asRole(claims, async (c) => (await c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name])).rowCount);
          if (!visible) return void res.writeHead(400, CORS).end(JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }));
          const { expiresIn = 60 } = JSON.parse(body.toString() || "{}");
          const exp = Math.floor(Date.now() / 1000) + Number(expiresIn);
          return void res.writeHead(200, { ...CORS, "content-type": "application/json" }).end(JSON.stringify({ signedURL: `/object/sign/${bucket}/${rawName}?token=${sign(`${bucket}/${name}`, exp)}.${exp}` }));
        }
        if (req.method === "POST" || req.method === "PUT") {
          const bucketRow = (await o.pool.query("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket])).rows[0];
          let mime = String(req.headers["content-type"] ?? "").split(";")[0];
          let fileBody = body;
          if (mime === "multipart/form-data") {
            const part = parseMultipart(body, String(req.headers["content-type"]));
            if (!part) return void res.writeHead(400, CORS).end(JSON.stringify({ error: "multipart inválido" }));
            ({ data: fileBody, mime } = part);
          }
          if (!bucketRow) return void res.writeHead(400, CORS).end(JSON.stringify({ error: "bucket inexistente" }));
          if (bucketRow.allowed_mime_types && !bucketRow.allowed_mime_types.includes(mime)) return void res.writeHead(415, CORS).end(JSON.stringify({ statusCode: "415", error: "invalid_mime_type", message: `mime type ${mime} is not supported` }));
          if (bucketRow.file_size_limit && fileBody.length > Number(bucketRow.file_size_limit)) return void res.writeHead(413, CORS).end(JSON.stringify({ error: "Payload too large" }));
          try {
            await asRole(claims, (c) => c.query("insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)", [bucket, name, claims?.sub ?? null, { size: fileBody.length, mimetype: mime }]));
          } catch (err) {
            return void res.writeHead(403, CORS).end(JSON.stringify({ statusCode: "403", error: "Unauthorized", message: (err as Error).message }));
          }
          mkdirSync(path.dirname(fileOf(bucket, name)), { recursive: true });
          writeFileSync(fileOf(bucket, name), fileBody);
          return void res.writeHead(200, { ...CORS, "content-type": "application/json" }).end(JSON.stringify({ Key: `${bucket}/${name}`, Id: name }));
        }
        if (req.method === "GET") {
          const visible = await asRole(claims, async (c) => (await c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name])).rowCount);
          if (!visible || !existsSync(fileOf(bucket, name))) return void res.writeHead(400, CORS).end(JSON.stringify({ statusCode: "404", error: "not_found", message: "Object not found" }));
          res.writeHead(200, { ...CORS, "content-type": "application/octet-stream" });
          return void res.end(readFileSync(fileOf(bucket, name)));
        }
      }
      res.writeHead(404, CORS).end(JSON.stringify({ error: "rota não emulada", path: url.pathname }));
    } catch (err) {
      res.writeHead(500, CORS).end(JSON.stringify({ error: (err as Error).message }));
    }
  });
  return new Promise((resolve) => server.listen(o.port, "127.0.0.1", () => resolve(server)));
}
