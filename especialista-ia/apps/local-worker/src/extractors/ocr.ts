import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { PageText } from "@especialista/ai-core";

const run = promisify(execFile);

async function hasCommand(cmd: string, args: string[]): Promise<boolean> {
  try {
    await run(cmd, args, { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** OCR local e gratuito via Tesseract + Poppler (pdftoppm), se instalados no computador. */
export async function ocrAvailable(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  if (!(await hasCommand("tesseract", ["--version"]))) missing.push("tesseract");
  if (!(await hasCommand("pdftoppm", ["-v"]))) missing.push("pdftoppm (Poppler)");
  return { ok: missing.length === 0, missing };
}

export async function ocrPdf(data: Uint8Array, language = "por", maxPages = 80): Promise<PageText[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "esp-ocr-"));
  try {
    const pdf = path.join(dir, "in.pdf");
    await writeFile(pdf, data);
    await run("pdftoppm", ["-r", "200", "-gray", "-png", "-l", String(maxPages), pdf, path.join(dir, "p")], { timeout: 10 * 60_000 });
    const images = (await readdir(dir)).filter((f) => f.endsWith(".png")).sort();
    const pages: PageText[] = [];
    for (const img of images) {
      const n = Number(/-(\d+)\.png$/.exec(img)?.[1] ?? pages.length + 1);
      const base = path.join(dir, `o-${n}`);
      await run("tesseract", [path.join(dir, img), base, "-l", language, "--psm", "3"], { timeout: 5 * 60_000 });
      pages.push({ page: n, text: await readFile(`${base}.txt`, "utf8") });
    }
    return pages;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
