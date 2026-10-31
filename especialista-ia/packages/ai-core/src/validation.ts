/** Validação da saída do modelo: estrutura, citações e números presentes nas fontes. */

export interface ModelAnswer {
  status: "respondida" | "sem_fonte" | "precisa_info" | "conflito";
  resposta: string;
  fontes: number[];
  informacoes_faltantes: string[];
  conflito: string;
}

const STATUSES = new Set(["respondida", "sem_fonte", "precisa_info", "conflito"]);

export function parseModelAnswer(raw: string): ModelAnswer | null {
  let text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) text = fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const status = String(obj.status ?? "");
    if (!STATUSES.has(status)) return null;
    const fontes = Array.isArray(obj.fontes) ? obj.fontes.map((n) => Number(n)).filter((n) => Number.isInteger(n)) : [];
    return {
      status: status as ModelAnswer["status"],
      resposta: typeof obj.resposta === "string" ? obj.resposta.trim() : "",
      fontes: [...new Set(fontes)],
      informacoes_faltantes: Array.isArray(obj.informacoes_faltantes) ? obj.informacoes_faltantes.map(String).filter(Boolean) : [],
      conflito: typeof obj.conflito === "string" ? obj.conflito.trim() : "",
    };
  } catch {
    return null;
  }
}

/** Índices citados no texto ([1], [2, 3]). */
export function citedIndices(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g)) {
    for (const n of m[1].split(/[,;]/)) out.add(Number(n.trim()));
  }
  return [...out];
}

function canonicalNumber(token: string): string {
  return token.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
}

/** Números presentes em um texto, em forma canônica (sem separadores). */
export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  const cleaned = text.replace(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, " ");
  for (const m of cleaned.matchAll(/\d+(?:[.,]\d+)*/g)) out.add(canonicalNumber(m[0]));
  return out;
}

/**
 * Todo número afirmado na resposta precisa aparecer nas fontes citadas ou na própria pergunta.
 * Evita que o modelo "invente" prazos, valores, percentuais ou quantidades.
 */
export function ungroundedNumbers(answer: string, groundingTexts: string[]): string[] {
  const allowed = new Set<string>();
  for (const t of groundingTexts) for (const n of numberTokens(t)) allowed.add(n);
  // Numeração de listas ("1." / "2)") no início da linha não é afirmação factual.
  const body = answer.replace(/^\s*\d+[.)]\s+/gm, "");
  return [...numberTokens(body)].filter((n) => !allowed.has(n));
}

export interface ValidationIssue {
  code: "sem_citacao" | "citacao_invalida" | "numero_sem_fonte" | "resposta_vazia";
  detail: string;
}

export function validateAnswer(ans: ModelAnswer, contextTexts: string[], question: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (ans.status === "sem_fonte") return issues;
  if (!ans.resposta) return [{ code: "resposta_vazia", detail: "Resposta vazia." }];
  if (ans.status === "precisa_info") return issues;
  const inline = citedIndices(ans.resposta);
  const all = [...new Set([...ans.fontes, ...inline])];
  if (all.length === 0) issues.push({ code: "sem_citacao", detail: "A resposta não cita nenhum trecho." });
  const invalid = all.filter((n) => n < 1 || n > contextTexts.length);
  if (invalid.length) issues.push({ code: "citacao_invalida", detail: `Trechos inexistentes citados: ${invalid.join(", ")}.` });
  const valid = all.filter((n) => n >= 1 && n <= contextTexts.length);
  const grounding = [question, ...valid.map((n) => contextTexts[n - 1])];
  const loose = ungroundedNumbers(ans.resposta, grounding);
  if (loose.length) issues.push({ code: "numero_sem_fonte", detail: `Números sem respaldo nos trechos citados: ${loose.join(", ")}.` });
  return issues;
}
