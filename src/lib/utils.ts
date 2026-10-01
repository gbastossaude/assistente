import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR");

export function formatMoney(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : brl.format(v);
}

export function formatNumber(v: number | null | undefined, digits?: number) {
  if (v === null || v === undefined) return "—";
  return digits === undefined ? num.format(v) : v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Lê parâmetro de busca simples (string) de searchParams do App Router. */
export function sp(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
}
