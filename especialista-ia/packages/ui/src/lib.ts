import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "nunca";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

/** Mensagem de erro amigável a partir de erros do Supabase/PostgREST. */
export function errorMessage(err: unknown): string {
  const e = err as { message?: string; details?: string; code?: string } | null;
  const msg = e?.message ?? String(err ?? "Erro desconhecido");
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return "Sem conexão com o servidor. Verifique sua internet.";
  if (/JWT expired|invalid JWT/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
  if (/row-level security|permission denied|Acesso negado/i.test(msg)) return "Você não tem permissão para esta ação.";
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha inválidos.";
  if (/duplicate key/i.test(msg)) return "Registro duplicado (já existe um igual).";
  return msg;
}
