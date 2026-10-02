import { Badge } from "@/components/ui/badge";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONE,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_TONE,
  OPPORTUNITY_STAGE_LABELS,
  OPPORTUNITY_STAGE_TONE,
  PRODUCT_LABELS,
  type CampaignStatus,
  type MeetingStatus,
  type OpportunityStage,
  type Product,
} from "@/lib/domain/commercial";
import { followupState } from "@/lib/domain/crm";
import { formatDateBR, relativeDays } from "@/lib/domain/dates";

export function StageBadge({ value }: { value: OpportunityStage }) {
  return <Badge tone={OPPORTUNITY_STAGE_TONE[value]}>{OPPORTUNITY_STAGE_LABELS[value]}</Badge>;
}
const P_TONE: Record<Product, string> = { plano_saude: "blue", dental: "teal", vida: "violet", seguro: "indigo", consorcio: "amber", beneficios: "fuchsia" };
export function ProductBadge({ value }: { value: Product }) {
  return <Badge tone={P_TONE[value]}>{PRODUCT_LABELS[value]}</Badge>;
}
export function MeetingStatusBadge({ value }: { value: MeetingStatus }) {
  return <Badge tone={MEETING_STATUS_TONE[value]}>{MEETING_STATUS_LABELS[value]}</Badge>;
}
export function CampaignStatusBadge({ value }: { value: CampaignStatus }) {
  return <Badge tone={CAMPAIGN_STATUS_TONE[value]}>{CAMPAIGN_STATUS_LABELS[value]}</Badge>;
}

/** Selo do próximo follow-up: atrasado (vermelho), hoje (âmbar), próximos dias, sem data. */
export function FollowupBadge({ date, today, stage }: { date: string | null; today: string; stage?: OpportunityStage }) {
  const st = followupState(date, today, stage);
  if (stage && (stage === "fechado" || stage === "implantado" || stage === "perdido")) return null;
  if (st === "sem_data") return <Badge tone="zinc">Sem follow-up</Badge>;
  if (st === "atrasado") return <Badge tone="red">Follow-up atrasado · {formatDateBR(date)}</Badge>;
  if (st === "hoje") return <Badge tone="amber">Follow-up hoje</Badge>;
  return <Badge tone={st === "proximo" ? "sky" : "slate"}>Follow-up {relativeDays(date, today)}</Badge>;
}
