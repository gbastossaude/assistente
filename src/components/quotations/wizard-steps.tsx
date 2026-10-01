import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const WIZARD_STEPS = ["Identificação", "Contrato atual", "Contribuição e coparticipação", "Situações especiais", "Documentos"];

export function WizardSteps({ current, quotationId, reached = current }: { current: number; quotationId?: string; reached?: number }) {
  return (
    <ol className="mb-5 grid grid-cols-5 gap-1 sm:gap-2" aria-label="Etapas do wizard">
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current || (quotationId && n === 1);
        const clickable = quotationId && n > 1 && n <= Math.max(reached, current);
        const inner = (
          <div className={cn("flex h-full flex-col gap-1 rounded-md border px-2 py-2 sm:flex-row sm:items-center sm:px-3", n === current ? "border-primary bg-primary/5" : "border-border bg-surface")}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-emerald-600 text-white" : n === current ? "bg-primary text-white" : "bg-surface-2 text-muted")}>
              {done ? <Check className="size-3.5" /> : n}
            </span>
            <span className={cn("text-[11px] leading-tight sm:text-xs", n === current ? "font-medium" : "text-muted")}>{label}</span>
          </div>
        );
        return (
          <li key={label} aria-current={n === current ? "step" : undefined}>
            {clickable ? <Link href={`/cotacoes/${quotationId}/wizard?step=${n}`}>{inner}</Link> : inner}
          </li>
        );
      })}
    </ol>
  );
}
