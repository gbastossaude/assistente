import { AlertTriangle, BookOpen, Check, Copy, FileText, Headset, ShieldAlert, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { formatDateBR, formatSourceLine, OUTCOME_LABELS, RULE_NATURE_LABELS, type AnswerOutcome, type AnswerRow, type AnswerSourceRow, type RuleNature } from "@especialista/shared";
import { Badge, Button, Textarea } from "../components/primitives.tsx";
import { cn } from "../lib.ts";

const OUTCOME_TONE: Record<AnswerOutcome, "success" | "warning" | "danger" | "info" | "neutral"> = {
  respondida: "success",
  sem_fonte: "warning",
  precisa_info: "info",
  conflito: "danger",
  recusada: "neutral",
  erro: "danger",
};

/** Converte o texto da resposta em parágrafos/listas com as citações [n] destacadas (sem HTML arbitrário). */
export function renderAnswerText(text: string): ReactNode {
  const blocks = text.split(/\n{2,}/);
  const inline = (line: string, key: string) =>
    line.split(/(\[\d+(?:,\s*\d+)*\])/g).map((part, i) =>
      /^\[\d+(?:,\s*\d+)*\]$/.test(part) ? (
        <sup key={`${key}-${i}`} className="ml-0.5 rounded bg-accent-50 px-1 text-[10px] font-semibold text-accent-600">{part.slice(1, -1)}</sup>
      ) : (
        <Fragment key={`${key}-${i}`}>{part.replace(/\*(.+?)\*/g, "$1")}</Fragment>
      ),
    );
  return blocks.map((b, bi) => {
    const lines = b.split("\n");
    const isList = lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l));
    if (isList) {
      return (
        <ul key={bi} className="my-2 list-disc space-y-1 pl-5">
          {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ""), `${bi}-${li}`)}</li>)}
        </ul>
      );
    }
    return (
      <p key={bi} className="my-2 first:mt-0 last:mb-0">
        {lines.map((l, li) => (
          <Fragment key={li}>
            {li > 0 && <br />}
            {inline(l, `${bi}-${li}`)}
          </Fragment>
        ))}
      </p>
    );
  });
}

export function answerToClipboardText(answer: { content: string; warnings?: string[] | null }, sources: AnswerSourceRow[]): string {
  const parts = [answer.content.replace(/\*(.+?)\*/g, "$1")];
  if (answer.warnings?.length) parts.push(answer.warnings.map((w) => `Atenção: ${w}`).join("\n"));
  if (sources.length) parts.push("Fontes:\n" + sources.map(formatSourceLine).join("\n"));
  return parts.join("\n\n");
}

export interface AnswerCardProps {
  answer: AnswerRow & { answer_sources: AnswerSourceRow[] };
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onFeedback?: (rating: "util" | "incorreta", comment?: string) => Promise<void>;
  onHandoff?: () => Promise<void>;
  compact?: boolean;
}

export function AnswerCard({ answer, isFavorite, onToggleFavorite, onFeedback, onHandoff, compact }: AnswerCardProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"util" | "incorreta" | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [handoffDone, setHandoffDone] = useState(false);
  const sources = answer.answer_sources ?? [];
  const showSources = sources.length > 0;

  const copy = async () => {
    await navigator.clipboard.writeText(answerToClipboardText(answer, sources));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const giveFeedback = async (rating: "util" | "incorreta", text?: string) => {
    if (!onFeedback) return;
    setBusy(true);
    try {
      await onFeedback(rating, text);
      setFeedback(rating);
      setShowComment(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-3" aria-live="polite">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={OUTCOME_TONE[answer.outcome]}>
          {answer.outcome === "conflito" ? <ShieldAlert className="h-3 w-3" /> : null}
          {OUTCOME_LABELS[answer.outcome]}
        </Badge>
        <div className="flex items-center gap-1">
          {onToggleFavorite && (
            <Button variant="ghost" size="icon" onClick={onToggleFavorite} aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} aria-pressed={isFavorite}>
              <Star className={cn("h-4 w-4", isFavorite && "fill-warning-600 text-warning-600")} />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={copy} aria-label="Copiar resposta">
            {copied ? <Check className="h-4 w-4 text-success-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className={cn("text-sm leading-relaxed text-ink-900", compact && "text-[13px]")}>{renderAnswerText(answer.content)}</div>

      {answer.warnings?.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {answer.warnings.map((w, i) => (
            <li key={i} className="flex gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {showSources && (
        <section aria-label="Fontes consultadas" className="rounded-lg border border-ink-200 bg-ink-50">
          <h3 className="flex items-center gap-1.5 border-b border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700">
            <BookOpen className="h-3.5 w-3.5" /> Fontes
          </h3>
          <ol className="divide-y divide-ink-200">
            {sources.map((s) => (
              <li key={s.id} className="px-3 py-2">
                <details>
                  <summary className="flex cursor-pointer list-none items-start gap-2 text-xs">
                    <span className="mt-0.5 rounded bg-brand-900 px-1.5 text-[10px] font-semibold text-white">{s.rank}</span>
                    <span className="flex-1">
                      <span className="font-medium text-ink-900">{s.title}</span>
                      <span className="block text-[11px] text-ink-500">
                        {[s.operator_name, s.page_from ? `p. ${s.page_from}${s.page_to && s.page_to !== s.page_from ? `–${s.page_to}` : ""}` : null,
                          s.valid_until ? `vigente até ${formatDateBR(s.valid_until)}` : null,
                          s.rule_nature ? RULE_NATURE_LABELS[s.rule_nature as RuleNature] : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <FileText className="h-3.5 w-3.5 text-ink-500" aria-hidden />
                  </summary>
                  {s.excerpt && <blockquote className="mt-2 border-l-2 border-accent-500 pl-2 text-[11px] leading-relaxed text-ink-700">{s.excerpt}</blockquote>}
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(onFeedback || onHandoff) && (
        <footer className="flex flex-col gap-2 border-t border-ink-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {onFeedback && (
              <>
                <span className="text-xs text-ink-500">Esta resposta ajudou?</span>
                <Button size="sm" variant={feedback === "util" ? "accent" : "outline"} onClick={() => giveFeedback("util")} disabled={busy} aria-pressed={feedback === "util"}>
                  <ThumbsUp className="h-3.5 w-3.5" /> Útil
                </Button>
                <Button size="sm" variant={feedback === "incorreta" ? "danger" : "outline"} onClick={() => setShowComment((v) => !v)} disabled={busy} aria-pressed={feedback === "incorreta"}>
                  <ThumbsDown className="h-3.5 w-3.5" /> Incorreta
                </Button>
              </>
            )}
            {onHandoff && (
              <Button size="sm" variant="ghost" className="ml-auto" disabled={handoffDone} onClick={async () => { await onHandoff(); setHandoffDone(true); }}>
                <Headset className="h-3.5 w-3.5" /> {handoffDone ? "Responsável acionado" : "Falar com responsável"}
              </Button>
            )}
          </div>
          {showComment && (
            <div className="flex flex-col gap-2">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="O que está incorreto? (opcional — não inclua dados de clientes)" maxLength={1000} className="min-h-[64px]" />
              <div className="flex justify-end">
                <Button size="sm" variant="danger" loading={busy} onClick={() => giveFeedback("incorreta", comment)}>Enviar avaliação</Button>
              </div>
            </div>
          )}
          {feedback && <p className="text-xs text-success-600">Obrigado! Sua avaliação ajuda a melhorar a base de conhecimento.</p>}
        </footer>
      )}
    </article>
  );
}
