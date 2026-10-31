/**
 * Divisão de documentos em trechos para RAG, preservando a página de origem.
 * Estratégia: parágrafos agrupados até ~chunkSize caracteres, com sobreposição entre trechos
 * vizinhos; títulos curtos detectados viram "seção" do trecho.
 */

export interface PageText {
  page: number;
  text: string;
}

export interface TextChunk {
  index: number;
  pageFrom: number;
  pageTo: number;
  section: string | null;
  content: string;
  tokenEstimate: number;
}

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
  minChunkChars?: number;
}

interface Paragraph {
  page: number;
  text: string;
  section: string | null;
}

export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 90 || /[.;:,]$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  const upperRatio = letters.replace(/[^A-ZÀ-Ý]/g, "").length / letters.length;
  return upperRatio > 0.7 || /^(\d+(\.\d+)*[.)]?|cap[ií]tulo|se[cç][aã]o|art\.?|cl[aá]usula)\s+\S/i.test(t);
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?;])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (cur) out.push(cur), (cur = "");
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    if ((cur + " " + s).trim().length > max) {
      out.push(cur.trim());
      cur = s;
    } else cur = (cur + " " + s).trim();
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkPages(pages: PageText[], opts: ChunkOptions = {}): TextChunk[] {
  const chunkSize = opts.chunkSize ?? 1200;
  const overlap = Math.min(opts.overlap ?? 200, Math.floor(chunkSize / 2));
  const minChars = opts.minChunkChars ?? 40;

  const paragraphs: Paragraph[] = [];
  let section: string | null = null;
  for (const p of pages) {
    const cleaned = cleanExtractedText(p.text);
    if (!cleaned) continue;
    for (const block of cleaned.split(/\n\s*\n/)) {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      if (lines.length === 1 && looksLikeHeading(lines[0])) {
        section = lines[0].slice(0, 120);
        paragraphs.push({ page: p.page, text: lines[0], section });
        continue;
      }
      if (looksLikeHeading(lines[0]) && lines.length > 1) section = lines[0].slice(0, 120);
      for (const piece of splitLong(lines.join(" "), chunkSize)) paragraphs.push({ page: p.page, text: piece, section });
    }
  }

  const chunks: TextChunk[] = [];
  let buf: Paragraph[] = [];
  let len = 0;
  const flush = () => {
    if (buf.length === 0) return;
    const content = buf.map((b) => b.text).join("\n");
    if (content.trim().length >= minChars || chunks.length === 0) {
      chunks.push({
        index: chunks.length,
        pageFrom: buf[0].page,
        pageTo: buf[buf.length - 1].page,
        section: buf.find((b) => b.section)?.section ?? null,
        content,
        tokenEstimate: estimateTokens(content),
      });
    }
    // Sobreposição: mantém os últimos parágrafos até ~overlap caracteres.
    const keep: Paragraph[] = [];
    let kept = 0;
    for (let i = buf.length - 1; i >= 0 && kept < overlap; i--) {
      if (buf[i].text.length > overlap && keep.length > 0) break;
      keep.unshift(buf[i]);
      kept += buf[i].text.length;
    }
    buf = kept >= len ? [] : keep;
    len = buf.reduce((s, b) => s + b.text.length + 1, 0);
  };

  for (const para of paragraphs) {
    if (len + para.text.length + 1 > chunkSize && buf.length > 0) flush();
    buf.push(para);
    len += para.text.length + 1;
  }
  if (buf.length > 0) {
    const tail = buf.map((b) => b.text).join("\n");
    const last = chunks[chunks.length - 1];
    // Evita repetir apenas a sobreposição no fim.
    if (!last || !last.content.endsWith(tail)) flush();
  }
  return chunks.filter((c) => c.content.trim().length > 0).map((c, i) => ({ ...c, index: i }));
}

/** Métricas de qualidade da extração para decidir se o arquivo precisa de revisão humana/OCR. */
export interface ExtractionQuality {
  pages: number;
  chars: number;
  emptyPages: number[];
  lowTextPages: number[];
  garbledRatio: number;
  needsReview: boolean;
  reasons: string[];
}

export function assessExtractionQuality(pages: PageText[], minCharsPerPage = 40): ExtractionQuality {
  const emptyPages: number[] = [];
  const lowTextPages: number[] = [];
  let chars = 0;
  let weird = 0;
  for (const p of pages) {
    const t = p.text.trim();
    chars += t.length;
    if (t.length === 0) emptyPages.push(p.page);
    else if (t.length < minCharsPerPage) lowTextPages.push(p.page);
    // Caracteres de substituição, de controle ou sequências sem vogais indicam fonte mal codificada.
    weird += (t.match(/[�\u0001-\u0008\u000E-\u001F]/g) ?? []).length;
  }
  const garbledRatio = chars ? weird / chars : 0;
  const reasons: string[] = [];
  if (pages.length === 0 || chars === 0) reasons.push("Nenhum texto extraído (arquivo vazio, protegido ou digitalizado como imagem).");
  else {
    const bad = emptyPages.length + lowTextPages.length;
    if (bad / pages.length >= 0.3) {
      reasons.push(
        `${bad} de ${pages.length} página(s) com pouco ou nenhum texto — provável PDF digitalizado; considere OCR e revise o conteúdo.`,
      );
    }
    if (garbledRatio > 0.02) reasons.push("Texto com caracteres corrompidos — verifique a codificação/fonte do arquivo.");
  }
  return { pages: pages.length, chars, emptyPages, lowTextPages, garbledRatio, needsReview: reasons.length > 0, reasons };
}
