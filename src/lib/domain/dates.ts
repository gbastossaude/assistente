/**
 * Datas de negócio. Datas "de calendário" trafegam como string ISO (YYYY-MM-DD) para evitar
 * deslocamentos de fuso; instantes (timestamps) como Date. O fuso de negócio é America/Sao_Paulo.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Sao_Paulo";

export function toISODate(d: Date, timeZone = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts; // en-CA => YYYY-MM-DD
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

function parse(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

export function addMonths(iso: string, months: number): string {
  const d = parse(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d);
}

/** Diferença em dias corridos (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

export function isValidISODate(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = parse(iso);
  return fmt(d) === iso;
}

/** Próxima ocorrência (>= referência) de um aniversário anual. */
export function nextAnniversary(anniversaryISO: string, referenceISO: string): string {
  const ref = parse(referenceISO);
  const [, m, d] = anniversaryISO.split("-").map(Number);
  for (let y = ref.getUTCFullYear(); y <= ref.getUTCFullYear() + 1; y++) {
    const candidate = new Date(Date.UTC(y, m - 1, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate())));
    if (candidate.getTime() >= ref.getTime()) return fmt(candidate);
  }
  return anniversaryISO;
}

export function formatDateBR(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  if (iso instanceof Date) {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(iso);
  }
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBR(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** "há 3 dias", "em 5 dias", "hoje". */
export function relativeDays(iso: string | null | undefined, today = todayISO()): string {
  if (!iso) return "—";
  const n = diffDays(today, iso.slice(0, 10));
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}
