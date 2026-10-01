/** Renovações: janelas 30/60/90/120 e marcos automáticos. */
import { addDays, diffDays } from "./dates";

export interface RenewalMilestone {
  key: string;
  label: string;
  daysBefore: number;
  date: string;
}

const MILESTONE_LABELS: Record<string, string> = {
  preparacao: "Iniciar preparação da renovação",
  documentacao: "Solicitar documentação da renovação",
  mercado: "Cotação de renovação deve estar no mercado",
  negociacao: "Fase final de negociação da renovação",
};

export function renewalMilestones(anniversaryISO: string, offsets: Record<string, number>): RenewalMilestone[] {
  return Object.entries(offsets)
    .filter(([, d]) => Number.isFinite(d) && d > 0)
    .map(([key, daysBefore]) => ({
      key,
      label: MILESTONE_LABELS[key] ?? `Marco de renovação (${daysBefore} dias)`,
      daysBefore,
      date: addDays(anniversaryISO, -daysBefore),
    }))
    .sort((a, b) => b.daysBefore - a.daysBefore);
}

export function recommendedStartDate(anniversaryISO: string, offsets: Record<string, number>): string {
  const max = Math.max(...Object.values(offsets).filter((n) => Number.isFinite(n)), 0);
  return addDays(anniversaryISO, -max);
}

export type RenewalWindow = "vencida" | "30" | "60" | "90" | "120" | "futura";

export function renewalWindow(anniversaryISO: string, todayISO: string): RenewalWindow {
  const d = diffDays(todayISO, anniversaryISO);
  if (d < 0) return "vencida";
  if (d <= 30) return "30";
  if (d <= 60) return "60";
  if (d <= 90) return "90";
  if (d <= 120) return "120";
  return "futura";
}

export const RENEWAL_WINDOW_LABELS: Record<RenewalWindow, string> = {
  vencida: "Aniversário passado",
  "30": "Até 30 dias",
  "60": "31 a 60 dias",
  "90": "61 a 90 dias",
  "120": "91 a 120 dias",
  futura: "Mais de 120 dias",
};
