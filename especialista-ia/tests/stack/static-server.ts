import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };

/** Servidor estático com fallback de SPA (equivalente ao redirect da Netlify). */
export function serveStatic(dir: string, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = path.join(dir, p);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dir, "index.html");
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}
