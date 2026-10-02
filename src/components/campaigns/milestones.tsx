import { BellRing, CheckCircle2 } from "lucide-react";
import { CAMPAIGN_MILESTONE_LABELS, type CampaignMilestoneKey } from "@/lib/domain/campaigns";
import { formatDateBR } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";

/** Linha do tempo visual dos lembretes automáticos (início, meio, últimos dias, encerramento). */
export function MilestoneStrip({ milestones, today, enabled }: { milestones: { key: CampaignMilestoneKey; date: string }[]; today: string; enabled: boolean }) {
  const next = milestones.find((m) => m.date >= today);
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Lembretes da campanha">
      {milestones.map((m) => {
        const done = m.date < today;
        const isNext = next?.key === m.key;
        return (
          <li key={m.key} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]", done ? "border-border text-muted" : isNext ? "border-primary bg-primary/10 font-medium" : "border-border")}>
            {done ? <CheckCircle2 className="size-3 text-emerald-600" /> : <BellRing className={cn("size-3", isNext && "text-primary")} />}
            {CAMPAIGN_MILESTONE_LABELS[m.key]} · {formatDateBR(m.date)}
          </li>
        );
      })}
      {!enabled && <li className="text-[11px] text-muted">(lembretes desativados)</li>}
    </ol>
  );
}
