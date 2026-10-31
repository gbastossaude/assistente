import type { PageText } from "@especialista/ai-core";

export interface ExtractionResult {
  pages: PageText[];
  format: "pdf" | "docx" | "xlsx" | "csv" | "txt";
  ocrUsed: boolean;
  notes: string[];
}

export class UnsupportedFileError extends Error {}
