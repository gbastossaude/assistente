import { createHash } from "node:crypto";
import { assessExtractionQuality, chunkPages, type EmbeddingProvider } from "@especialista/ai-core";
import type { ProcessingJobRow } from "@especialista/shared";
import { extractDocument, ocrAvailable, ocrPdf, UnsupportedFileError } from "../extractors/index.ts";
import type { WorkerRepository } from "../repository.ts";

export interface IndexJobContext {
  repo: WorkerRepository;
  embedder: EmbeddingProvider;
  chunkSize: number;
  chunkOverlap: number;
  minCharsPerPage: number;
  ocrEnabled: boolean;
  ocrLanguage: string;
  lockSeconds: number;
  logger: { info: (m: string, meta?: Record<string, unknown>) => void; warn: (m: string, meta?: Record<string, unknown>) => void };
}

const EMBED_BATCH = 16;
const INSERT_BATCH = 50;

export class PermanentJobError extends Error {}

export async function processIndexJob(job: ProcessingJobRow, ctx: IndexJobContext): Promise<{ status: string; chunks: number }> {
  const version = await ctx.repo.getVersion(job.document_version_id!);
  const data = await ctx.repo.downloadFile(version.storage_path);
  const hash = createHash("sha256").update(data).digest("hex");
  if (hash !== version.sha256) {
    throw new PermanentJobError("O arquivo armazenado não corresponde ao hash registrado no envio (integridade).");
  }

  let extraction;
  try {
    extraction = await extractDocument(version.file_name, version.mime_type, data);
  } catch (err) {
    if (err instanceof UnsupportedFileError) throw new PermanentJobError(err.message);
    throw new PermanentJobError(`Não foi possível ler o arquivo: ${(err as Error).message}`);
  }
  let quality = assessExtractionQuality(extraction.pages, ctx.minCharsPerPage);
  const reasons = [...quality.reasons];
  let ocrUsed = false;

  const wantsOcr = extraction.format === "pdf" && quality.needsReview && (version.ocr_requested || job.payload?.ocr === true || ctx.ocrEnabled);
  if (wantsOcr) {
    const avail = await ocrAvailable();
    if (avail.ok) {
      ctx.logger.info("executando OCR local", { job: job.id });
      await ctx.repo.extendLock(job.id, Math.max(ctx.lockSeconds, 1800));
      extraction = { ...extraction, pages: await ocrPdf(data, ctx.ocrLanguage), ocrUsed: true };
      ocrUsed = true;
      quality = assessExtractionQuality(extraction.pages, ctx.minCharsPerPage);
      reasons.length = 0;
      reasons.push("Texto obtido por OCR: confira com o original antes de aprovar (o reconhecimento pode conter erros).", ...quality.reasons);
    } else {
      reasons.push(`OCR solicitado, mas indisponível neste computador (faltando: ${avail.missing.join(", ")}).`);
    }
  }

  const chunks = chunkPages(extraction.pages, { chunkSize: ctx.chunkSize, overlap: ctx.chunkOverlap });
  await ctx.repo.clearChunks(job.id);

  let lastExtend = Date.now();
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vectors = await ctx.embedder.embed(batch.map((c) => (c.section ? `${c.section}\n${c.content}` : c.content)), "document");
    const rows = batch.map((c, k) => ({
      document_id: version.document_id,
      version_id: version.id,
      chunk_index: c.index,
      page_from: c.pageFrom,
      page_to: c.pageTo,
      section: c.section,
      content: c.content,
      embedding: vectors[k],
      embedding_model: ctx.embedder.model,
      token_estimate: c.tokenEstimate,
    }));
    for (let j = 0; j < rows.length; j += INSERT_BATCH) await ctx.repo.insertChunks(rows.slice(j, j + INSERT_BATCH));
    if (Date.now() - lastExtend > 60_000) {
      await ctx.repo.extendLock(job.id, ctx.lockSeconds);
      lastExtend = Date.now();
    }
  }

  const needsReview = ocrUsed || quality.needsReview || chunks.length === 0;
  const status = needsReview ? "revisao" : "indexado";
  await ctx.repo.finalizeVersion(job.id, {
    status,
    page_count: quality.pages,
    char_count: quality.chars,
    embedding_model: ctx.embedder.model,
    ocr_used: ocrUsed,
    review_reason: needsReview ? reasons.join(" ") || "Nenhum texto extraído." : null,
    quality: { ...quality, notes: extraction.notes, format: extraction.format },
  });
  return { status, chunks: chunks.length };
}

export async function processFaqJob(job: ProcessingJobRow, ctx: { repo: WorkerRepository; embedder: EmbeddingProvider }) {
  const faq = await ctx.repo.getFaq(job.faq_id!);
  const [embedding] = await ctx.embedder.embed([`${faq.question}\n${faq.answer}`], "document");
  await ctx.repo.saveFaqEmbedding(job.id, embedding, ctx.embedder.model);
  return { status: "indexado" };
}
