import {
  CHECKLIST_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  INSURER_QUOTE_STATUS_LABELS,
  PENDENCY_STATUS_LABELS,
  PRIORITY_LABELS,
  QUOTATION_STATUS_LABELS,
  RENEWAL_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type ChecklistStatus,
  type DocumentStatus,
  type InsurerQuoteStatus,
  type PendencyStatus,
  type Priority,
  type QuotationStatus,
  type RenewalStatus,
  type TaskStatus,
} from "@/lib/domain/constants";
import { STATUS_TONE } from "@/lib/domain/pipeline";
import { Badge } from "./badge";

const P_TONE: Record<Priority, string> = { baixa: "slate", media: "sky", alta: "amber", critica: "red" };
export function PriorityBadge({ value }: { value: Priority }) {
  return <Badge tone={P_TONE[value]}>{PRIORITY_LABELS[value]}</Badge>;
}

export function QuotationStatusBadge({ value }: { value: QuotationStatus }) {
  return <Badge tone={STATUS_TONE[value]}>{QUOTATION_STATUS_LABELS[value]}</Badge>;
}

const IQ_TONE: Record<InsurerQuoteStatus, string> = {
  nao_enviada: "slate",
  enviada: "sky",
  recebida_operadora: "sky",
  em_analise: "indigo",
  pendencia: "red",
  declinada: "zinc",
  cotacao_recebida: "violet",
  em_negociacao: "fuchsia",
  finalista: "emerald",
  encerrada: "zinc",
};
export function InsurerStatusBadge({ value }: { value: InsurerQuoteStatus }) {
  return <Badge tone={IQ_TONE[value]}>{INSURER_QUOTE_STATUS_LABELS[value]}</Badge>;
}

const C_TONE: Record<ChecklistStatus, string> = { pendente: "red", recebido: "sky", em_validacao: "amber", validado: "emerald", dispensado: "zinc" };
export function ChecklistStatusBadge({ value }: { value: ChecklistStatus }) {
  return <Badge tone={C_TONE[value]}>{CHECKLIST_STATUS_LABELS[value]}</Badge>;
}

const D_TONE: Record<DocumentStatus, string> = { recebido: "sky", pendente: "amber", invalido: "red", desatualizado: "amber", validado: "emerald" };
export function DocumentStatusBadge({ value }: { value: DocumentStatus }) {
  return <Badge tone={D_TONE[value]}>{DOCUMENT_STATUS_LABELS[value]}</Badge>;
}

const T_TONE: Record<TaskStatus, string> = { a_fazer: "slate", em_andamento: "sky", aguardando_terceiro: "amber", concluida: "emerald", cancelada: "zinc" };
export function TaskStatusBadge({ value }: { value: TaskStatus }) {
  return <Badge tone={T_TONE[value]}>{TASK_STATUS_LABELS[value]}</Badge>;
}

const PS_TONE: Record<PendencyStatus, string> = { aberta: "red", em_andamento: "amber", resolvida: "emerald", cancelada: "zinc" };
export function PendencyStatusBadge({ value }: { value: PendencyStatus }) {
  return <Badge tone={PS_TONE[value]}>{PENDENCY_STATUS_LABELS[value]}</Badge>;
}

const R_TONE: Record<RenewalStatus, string> = {
  a_iniciar: "slate",
  em_preparacao: "sky",
  documentacao: "amber",
  em_mercado: "indigo",
  negociacao: "fuchsia",
  renovada: "emerald",
  migrada: "teal",
  perdida: "zinc",
  cancelada: "zinc",
};
export function RenewalStatusBadge({ value }: { value: RenewalStatus }) {
  return <Badge tone={R_TONE[value]}>{RENEWAL_STATUS_LABELS[value]}</Badge>;
}

export function CompletenessBar({ pct, compact }: { pct: number; compact?: boolean }) {
  const tone = pct >= 100 ? "bg-emerald-600" : pct >= 80 ? "bg-blue-600" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2" title={`${pct}% dos itens obrigatórios resolvidos`}>
      <div className={compact ? "h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" : "h-2 w-24 overflow-hidden rounded-full bg-surface-2"}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted">{pct}%</span>
    </div>
  );
}
