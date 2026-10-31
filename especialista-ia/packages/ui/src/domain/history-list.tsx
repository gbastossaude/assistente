import { Star } from "lucide-react";
import { OUTCOME_LABELS, type AnswerOutcome } from "@especialista/shared";
import { Badge } from "../components/primitives.tsx";
import { timeAgo } from "../lib.ts";
import { answerOf, type QuestionWithAnswer } from "./api.ts";

const TONE: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = {
  respondida: "success", sem_fonte: "warning", precisa_info: "info", conflito: "danger", erro: "danger", recusada: "neutral",
  pendente: "neutral", processando: "info", expirada: "neutral",
};

export function HistoryList({ items, onOpen }: { items: QuestionWithAnswer[]; onOpen: (q: QuestionWithAnswer) => void }) {
  return (
    <ul className="divide-y divide-ink-100">
      {items.map((q) => {
        const status = answerOf(q)?.outcome ?? q.status;
        return (
          <li key={q.id}>
            <button type="button" onClick={() => onOpen(q)} className="flex w-full flex-col gap-1 px-1 py-2.5 text-left hover:bg-ink-50 cursor-pointer">
              <span className="line-clamp-2 text-sm text-ink-900">{q.text_redacted}</span>
              <span className="flex items-center gap-2 text-[11px] text-ink-500">
                <Badge tone={TONE[status] ?? "neutral"}>{OUTCOME_LABELS[status as AnswerOutcome] ?? status}</Badge>
                {q.is_favorite && <Star className="h-3 w-3 fill-warning-600 text-warning-600" aria-label="Favorito" />}
                {timeAgo(q.created_at)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
