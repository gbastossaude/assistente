/** Variáveis dinâmicas {{chave}} da biblioteca de mensagens: extração e preenchimento. */

const VAR_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export function extractVariables(...texts: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").matchAll(VAR_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

/** Substitui as variáveis informadas; as vazias permanecem como {{chave}} e são listadas em `missing`. */
export function fillVariables(text: string, values: Record<string, string | null | undefined>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(VAR_RE, (whole, key: string) => {
    const v = values[key.toLowerCase()];
    if (v === null || v === undefined || String(v).trim() === "") {
      missing.add(key.toLowerCase());
      return whole;
    }
    return String(v).trim();
  });
  return { text: out, missing: [...missing] };
}

/** Normaliza para busca sem acento/caixa. */
export function normalizeSearch(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
