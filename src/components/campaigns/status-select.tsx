"use client";
import { Select } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS } from "@/lib/domain/commercial";
import { deleteCampaignAction, setCampaignStatusAction } from "@/server/actions/campaigns";
import { ConfirmButton } from "@/components/ui/confirm";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function CampaignStatusSelect({ id, status }: { id: string; status: string }) {
  const { run } = useAction();
  return (
    <Select className="h-8 w-36 text-xs" value={status} aria-label="Status da campanha" onChange={(e) => run(() => setCampaignStatusAction(id, e.target.value))}>
      {CAMPAIGN_STATUSES.map((s) => (
        <option key={s} value={s}>
          {CAMPAIGN_STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}

export function CampaignDelete({ id }: { id: string }) {
  const { run } = useAction();
  const router = useRouter();
  return (
    <ConfirmButton
      title="Excluir campanha?"
      description="As oportunidades vinculadas são mantidas (sem campanha)."
      triggerVariant="outline"
      onConfirm={async () => {
        const r = await run(() => deleteCampaignAction(id), { refresh: false });
        if (r.ok) router.push("/campanhas");
      }}
    >
      <Trash2 /> Excluir
    </ConfirmButton>
  );
}
