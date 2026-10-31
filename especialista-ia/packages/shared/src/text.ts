/** Utilidades de texto independentes de plataforma. */

/** Minúsculas, sem acentos e com espaços normalizados — usado em comparações e detecção de termos. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Escapa um termo para uso em RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Verifica se `term` aparece como palavra/expressão inteira em `normalizedText` (ambos normalizados). */
export function containsTerm(normalizedText: string, term: string): boolean {
  const t = normalizeText(term);
  if (!t) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(t)}([^a-z0-9]|$)`).test(normalizedText);
}

export function truncate(text: string, max: number, suffix = "…"): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - suffix.length)).trimEnd() + suffix;
}

/** Formata AAAA-MM-DD como DD/MM/AAAA sem depender de fuso horário. */
export function formatDateBR(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}

/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function todayISO(timeZone = "America/Sao_Paulo", now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}
