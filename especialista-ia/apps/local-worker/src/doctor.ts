import { execFile } from "node:child_process";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { promisify } from "node:util";
import { OllamaClient } from "@especialista/ai-core";
import { ocrAvailable } from "./extractors/index.ts";

const run = promisify(execFile);
const GB = 1024 ** 3;

export interface HardwareInfo {
  platform: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGb: number;
  freeRamGb: number;
  gpu: { name: string; vramGb: number } | null;
}

async function detectGpu(): Promise<HardwareInfo["gpu"]> {
  try {
    const { stdout } = await run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], { timeout: 5000 });
    const [name, mem] = stdout.trim().split("\n")[0].split(",").map((s) => s.trim());
    return { name, vramGb: Math.round((Number(mem) / 1024) * 10) / 10 };
  } catch {
    return null;
  }
}

export async function detectHardware(): Promise<HardwareInfo> {
  const c = cpus();
  return {
    platform: `${platform()} ${release()}`,
    cpuModel: c[0]?.model ?? "desconhecido",
    cpuCores: c.length,
    totalRamGb: Math.round((totalmem() / GB) * 10) / 10,
    freeRamGb: Math.round((freemem() / GB) * 10) / 10,
    gpu: await detectGpu(),
  };
}

export interface ModelRecommendation {
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
  expectedSpeed: string;
  notes: string[];
}

/**
 * Recomendação conservadora: qwen3:4b (~2,6 GB) entende melhor instruções em português e JSON;
 * llama3.2:3b (~2 GB) para máquinas com pouca memória. bge-m3 (1024 dim., multilíngue) é o
 * melhor embedding gratuito para PT-BR; nomic-embed-text (768 dim.) é mais leve, porém focado em inglês.
 */
export function recommendModels(hw: HardwareInfo): ModelRecommendation {
  const notes: string[] = [];
  const vram = hw.gpu?.vramGb ?? 0;
  if (hw.totalRamGb < 8 && vram < 4) {
    notes.push("Menos de 8 GB de RAM: use llama3.2:3b e nomic-embed-text; feche outros programas pesados durante o uso.");
    notes.push("Com nomic-embed-text, ajuste embedding_dimensions para 768 e execute scripts/sql/alterar-dimensao-embeddings.sql.");
    return { chatModel: "llama3.2:3b", embeddingModel: "nomic-embed-text", embeddingDimensions: 768, expectedSpeed: "lenta (20–60 s por resposta em CPU)", notes };
  }
  if (vram >= 6) notes.push(`GPU ${hw.gpu!.name} com ${vram} GB: respostas tendem a levar poucos segundos.`);
  else notes.push("Sem GPU dedicada: a inferência roda na CPU (espere 15–45 s por resposta com qwen3:4b).");
  if (hw.totalRamGb < 12 && vram < 6) notes.push("RAM entre 8 e 12 GB: mantenha WORKER_CONCURRENCY=1.");
  return {
    chatModel: "qwen3:4b",
    embeddingModel: "bge-m3",
    embeddingDimensions: 1024,
    expectedSpeed: vram >= 6 ? "rápida (2–8 s)" : "moderada (15–45 s em CPU)",
    notes,
  };
}

export async function runDoctor(ollamaUrl: string, models: string[]): Promise<string> {
  const hw = await detectHardware();
  const rec = recommendModels(hw);
  const lines = [
    "=== Diagnóstico do computador do worker ===",
    `Sistema: ${hw.platform}`,
    `CPU: ${hw.cpuModel} (${hw.cpuCores} núcleos)`,
    `RAM: ${hw.totalRamGb} GB (livre: ${hw.freeRamGb} GB)`,
    `GPU: ${hw.gpu ? `${hw.gpu.name} (${hw.gpu.vramGb} GB)` : "não detectada (NVIDIA)"}`,
    "",
    "=== Recomendação de modelos (gratuitos, locais) ===",
    `Chat: ${rec.chatModel}   Embeddings: ${rec.embeddingModel} (${rec.embeddingDimensions} dimensões)`,
    `Velocidade esperada: ${rec.expectedSpeed}`,
    ...rec.notes.map((n) => `- ${n}`),
    "",
    "=== Ollama (somente 127.0.0.1) ===",
  ];
  try {
    const client = new OllamaClient({ baseUrl: ollamaUrl });
    const h = await client.health(models);
    lines.push(h.version ? `Versão: ${h.version}` : `Erro: ${h.error}`);
    if (h.missing.length) lines.push(`Modelos faltando: ${h.missing.join(", ")} → execute: ${h.missing.map((m) => `ollama pull ${m}`).join(" && ")}`);
    else if (h.version) lines.push(`Modelos OK: ${models.join(", ")}`);
  } catch (err) {
    lines.push(`Ollama inacessível: ${(err as Error).message}`);
  }
  const ocr = await ocrAvailable();
  lines.push("", "=== OCR local (opcional) ===", ocr.ok ? "Tesseract e Poppler encontrados." : `Indisponível (faltando: ${ocr.missing.join(", ")}).`);
  return lines.join("\n");
}
