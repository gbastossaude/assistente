import { PLAYBOOK_SECTIONS } from "./content";

export interface PlaybookSearchable {
  section: string;
  key: string;
  title: string;
  subtitle?: string | null;
  objective?: string | null;
  body: string;
}

const STOPWORDS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma", "para", "por", "com", "que", "qual", "quais", "como", "sobre", "me", "fala", "diga", "mostra", "mostre", "playbook", "plano", "planos", "saude"]);

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function tokens(q: string): string[] {
  return normalizeText(q)
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Busca simples por relevância no conteúdo do Playbook (título > seção > corpo). Sem dependências externas. */
export function searchPlaybook<T extends PlaybookSearchable>(entries: T[], query: string, limit = 5): T[] {
  const terms = tokens(query);
  if (!terms.length) return [];
  const scored = entries.map((e) => {
    const section = PLAYBOOK_SECTIONS[e.section];
    const title = normalizeText(`${e.title} ${e.subtitle ?? ""}`);
    const sec = normalizeText(`${e.section} ${section?.title ?? ""} ${section?.description ?? ""}`);
    const body = normalizeText(`${e.objective ?? ""} ${e.body}`);
    let score = 0;
    let hits = 0;
    for (const t of terms) {
      const s = (title.includes(t) ? 3 : 0) + (sec.includes(t) ? 2 : 0) + (body.includes(t) ? 1 : 0);
      if (s > 0) hits++;
      score += s;
    }
    // Favorece entradas que cobrem mais termos da pergunta.
    return { e, score: score * (hits / terms.length) };
  });
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  // Descarta resultados muito menos relevantes que o melhor (menos ruído nas respostas do assistente).
  const floor = (ranked[0]?.score ?? 0) * 0.4;
  return ranked
    .filter((s) => s.score >= floor)
    .slice(0, limit)
    .map((s) => s.e);
}
