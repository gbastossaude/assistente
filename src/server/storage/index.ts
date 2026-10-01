import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { BusinessError } from "../errors";

/** Armazenamento privado de arquivos. Nunca servido estaticamente; acesso sempre via rota autenticada. */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** URL temporária (segundos). Drivers sem suporte retornam null e o arquivo é transmitido pela rota. */
  signedUrl(key: string, seconds: number, downloadName: string): Promise<string | null>;
}

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("Chave de storage inválida");
  return key;
}

class LocalDriver implements StorageDriver {
  constructor(private base: string) {}
  private full(key: string) {
    return path.join(this.base, safeKey(key));
  }
  async put(key: string, data: Buffer) {
    const file = this.full(key);
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, data, { mode: 0o600, flag: "wx" }); // wx: nunca sobrescreve
  }
  async get(key: string) {
    return fs.readFile(this.full(key));
  }
  async remove(key: string) {
    await fs.rm(this.full(key), { force: true });
  }
  async signedUrl() {
    return null;
  }
}

class SupabaseDriver implements StorageDriver {
  constructor(
    private url: string,
    private key: string,
    private bucket: string,
  ) {}
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }
  private objectUrl(key: string) {
    return `${this.url}/storage/v1/object/${this.bucket}/${safeKey(key)}`;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.objectUrl(key), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "false" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Falha no upload (storage ${res.status})`);
  }
  async get(key: string) {
    const res = await fetch(`${this.url}/storage/v1/object/authenticated/${this.bucket}/${safeKey(key)}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Falha ao ler arquivo (storage ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [safeKey(key)] }),
    });
  }
  async signedUrl(key: string, seconds: number, downloadName: string) {
    const res = await fetch(`${this.url}/storage/v1/object/sign/${this.bucket}/${safeKey(key)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: seconds }),
    });
    if (!res.ok) return null;
    const { signedURL } = (await res.json()) as { signedURL?: string };
    if (!signedURL) return null;
    return `${this.url}/storage/v1${signedURL}&download=${encodeURIComponent(downloadName)}`;
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  if (process.env.STORAGE_DRIVER === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados");
    driver = new SupabaseDriver(url.replace(/\/$/, ""), key, process.env.SUPABASE_STORAGE_BUCKET || "documentos");
  } else {
    driver = new LocalDriver(path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage/private"));
  }
  return driver;
}

// ─── Validação de upload ───

export const ALLOWED_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  zip: "application/zip",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
};

export function maxUploadBytes() {
  return Math.max(1, Number(process.env.UPLOAD_MAX_MB ?? 25)) * 1024 * 1024;
}

/** Remove caminho, acentos e caracteres especiais; preserva a extensão. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "arquivo";
  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  const ext = cleaned.includes(".") ? cleaned.slice(cleaned.lastIndexOf(".")) : "";
  const stem = cleaned.slice(0, cleaned.length - ext.length).slice(0, 120) || "arquivo";
  return `${stem}${ext.toLowerCase()}`;
}

function magicOk(ext: string, buf: Buffer) {
  const head = buf.subarray(0, 8);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isOle = head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  switch (ext) {
    case "pdf":
      return buf.subarray(0, 5).toString() === "%PDF-";
    case "xlsx":
    case "xlsm":
    case "docx":
    case "zip":
      return isZip;
    case "xls":
    case "doc":
    case "msg":
      return isOle;
    case "png":
      return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case "jpg":
    case "jpeg":
      return head[0] === 0xff && head[1] === 0xd8;
    default:
      return !buf.subarray(0, 4096).includes(0); // texto: sem bytes nulos
  }
}

export interface ValidatedUpload {
  fileName: string;
  ext: string;
  mimeType: string;
  size: number;
  sha256: string;
}

export function validateUpload(originalName: string, buf: Buffer, allowed: string[] = Object.keys(ALLOWED_EXTENSIONS)): ValidatedUpload {
  const fileName = sanitizeFileName(originalName);
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!allowed.includes(ext)) throw new BusinessError(`Tipo de arquivo não permitido (.${ext || "?"}). Permitidos: ${allowed.join(", ")}`);
  if (buf.length === 0) throw new BusinessError("Arquivo vazio.");
  if (buf.length > maxUploadBytes()) throw new BusinessError(`Arquivo excede o limite de ${process.env.UPLOAD_MAX_MB ?? 25} MB.`);
  if (!magicOk(ext, buf)) throw new BusinessError("O conteúdo do arquivo não corresponde à extensão informada.");
  return { fileName, ext, mimeType: ALLOWED_EXTENSIONS[ext], size: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

export function newStorageKey(prefix: string, ext: string) {
  const d = new Date();
  return `${prefix}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}
