/** Ordenação de "Prioridades do Dia": prazo × criticidade × impacto (vidas). */
import { PRIORITY_WEIGHT, type Priority } from "./constants";
import { diffDays } from "./dates";

export interface PriorityCandidate {
  id: string;
  kind: "tarefa" | "cotacao" | "followup" | "pendencia" | "renovacao" | "proposta";
  title: string;
  subtitle?: string;
  href: string;
  dueDate: string | null;
  priority: Priority;
  lives?: number | null;
}

export interface RankedPriority extends PriorityCandidate {
  score: number;
  overdueDays: number;
}

export function rankPriorities(items: PriorityCandidate[], today: string): RankedPriority[] {
  return items
    .map((it) => {
      const delta = it.dueDate ? diffDays(today, it.dueDate) : 30; // sem prazo = baixa urgência
      // Urgência: atrasado sempre supera "vence hoje" (18+ x 10); decai até 0 em 15 dias.
      const urgency = delta < 0 ? 18 + Math.min(-delta, 30) * 0.5 : Math.max(0, 10 - delta * (10 / 15));
      const criticality = PRIORITY_WEIGHT[it.priority] * 2.5;
      const impact = it.lives ? Math.min(Math.log10(Math.max(it.lives, 1)) * 1.5, 5) : 0;
      return { ...it, score: Math.round((urgency + criticality + impact) * 10) / 10, overdueDays: delta < 0 ? -delta : 0 };
    })
    .sort((a, b) => b.score - a.score || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}
