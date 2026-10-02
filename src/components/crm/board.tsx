"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FollowupBadge, ProductBadge, StageBadge } from "@/components/commercial/badges";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useAction } from "@/components/ui/use-action";
import { LEAD_SOURCE_LABELS, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS, type LeadSource, type OpportunityStage, type Product } from "@/lib/domain/commercial";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import { changeOpportunityStageAction } from "@/server/actions/crm";
import { blankOpportunity, OpportunityDialog, type CrmOptions, type OpportunityFormValue } from "./opportunity-dialog";
import { StageDialog } from "./stage-dialog";

export interface OpportunityView {
  id: string;
  clientName: string;
  companyId: string | null;
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  product: Product;
  lives: number | null;
  estimatedValue: number | null;
  currentInsurer: string | null;
  quotedInsurers: string[];
  brokerId: string | null;
  brokerName: string | null;
  advisorName: string | null;
  salesRepName: string | null;
  source: string;
  campaignId: string | null;
  campaignName: string | null;
  stage: OpportunityStage;
  nextStep: string | null;
  nextFollowupAt: string | null;
  lostReason: string | null;
  quotationId: string | null;
  quotationCode: string | null;
  notes: string | null;
  updatedAt: string;
}

export function toForm(o: OpportunityView): OpportunityFormValue {
  return {
    id: o.id,
    clientName: o.clientName,
    companyId: o.companyId ?? "",
    document: o.document ?? "",
    contactName: o.contactName ?? "",
    phone: o.phone ?? "",
    email: o.email ?? "",
    product: o.product,
    lives: o.lives?.toString() ?? "",
    estimatedValue: o.estimatedValue?.toString().replace(".", ",") ?? "",
    currentInsurer: o.currentInsurer ?? "",
    quotedInsurers: o.quotedInsurers.join(", "),
    brokerId: o.brokerId ?? "",
    advisorName: o.advisorName ?? "",
    salesRepName: o.salesRepName ?? "",
    source: o.source,
    campaignId: o.campaignId ?? "",
    stage: o.stage,
    nextStep: o.nextStep ?? "",
    nextFollowupAt: o.nextFollowupAt ?? "",
    lostReason: o.lostReason ?? "",
    quotationId: o.quotationId ?? "",
    notes: o.notes ?? "",
  };
}

function OppCard({ o, today, onDragStart, onEdit, canWrite }: { o: OpportunityView; today: string; onDragStart: (e: React.DragEvent) => void; onEdit: () => void; canWrite: boolean }) {
  return (
    <div draggable={canWrite} onDragStart={onDragStart} className={cn("rounded-md border border-border bg-surface p-2.5 shadow-xs hover:border-primary/40", canWrite && "cursor-grab active:cursor-grabbing")}>
      <div className="flex items-start justify-between gap-1">
        <Link href={`/crm/${o.id}`} className="text-sm font-medium leading-tight hover:underline">
          {o.clientName}
        </Link>
        {canWrite && (
          <button type="button" onClick={onEdit} className="text-muted hover:text-foreground" aria-label={`Editar ${o.clientName}`}>
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {o.lives ? `${formatNumber(o.lives)} vidas · ` : ""}
        {o.estimatedValue ? formatMoney(o.estimatedValue) : "valor a definir"}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <ProductBadge value={o.product} />
        <FollowupBadge date={o.nextFollowupAt} today={today} stage={o.stage} />
      </div>
      {o.nextStep && <p className="mt-1.5 line-clamp-2 text-[11px]">→ {o.nextStep}</p>}
      <p className="mt-1 text-[11px] text-muted">{o.brokerName ?? "Sem corretor"}</p>
    </div>
  );
}

export function OpportunityBoard({ rows, options, canWrite, autoNew }: { rows: OpportunityView[]; options: CrmOptions; canWrite: boolean; autoNew?: boolean }) {
  const today = todayISO();
  const { run } = useAction();
  const [over, setOver] = useState<OpportunityStage | null>(null);
  const [lost, setLost] = useState<OpportunityView | null>(null);
  const [edit, setEdit] = useState<OpportunityFormValue | null>(null);
  useEffect(() => {
    if (autoNew && canWrite) setEdit(blankOpportunity());
  }, [autoNew, canWrite]);
  const drop = async (id: string, stage: OpportunityStage) => {
    const o = rows.find((r) => r.id === id);
    if (!o || o.stage === stage) return;
    if (stage === "perdido") return setLost(o);
    await run(() => changeOpportunityStageAction({ id, stage }));
  };
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Arraste os cartões entre as etapas (também para trás). Mover para “Perdido” pede o motivo.</p>
        {canWrite && (
          <Button size="sm" onClick={() => setEdit(blankOpportunity())}>
            <Plus /> Nova oportunidade
          </Button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-3">
        {OPPORTUNITY_STAGES.map((s) => {
          const items = rows.filter((r) => r.stage === s);
          const total = items.reduce((a, r) => a + (r.estimatedValue ?? 0), 0);
          return (
            <section
              key={s}
              aria-label={OPPORTUNITY_STAGE_LABELS[s]}
              onDragOver={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                void drop(e.dataTransfer.getData("text/plain"), s);
              }}
              className={cn("flex w-60 shrink-0 flex-col rounded-lg bg-surface-2/70 p-2", over === s && "ring-2 ring-primary")}
            >
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{OPPORTUNITY_STAGE_LABELS[s]}</span>
                  <span className="rounded-full bg-surface px-1.5 text-[10px] font-semibold text-muted">{items.length}</span>
                </div>
                {total > 0 && <span className="text-[10px] text-muted">{formatMoney(total)}/mês</span>}
              </div>
              <div className="flex min-h-16 flex-col gap-2">
                {items.map((o) => (
                  <OppCard key={o.id} o={o} today={today} canWrite={canWrite} onEdit={() => setEdit(toForm(o))} onDragStart={(e) => e.dataTransfer.setData("text/plain", o.id)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {lost && <StageDialog open onOpenChange={(o) => !o && setLost(null)} opportunityId={lost.id} clientName={lost.clientName} current={lost.stage} initialTarget="perdido" />}
      <OpportunityDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} value={edit} options={options} />
    </>
  );
}

export function OpportunityTable({ rows }: { rows: OpportunityView[] }) {
  const today = todayISO();
  const columns: ColumnDef<OpportunityView, unknown>[] = [
    {
      accessorKey: "clientName",
      header: "Cliente",
      cell: ({ row: { original: o } }) => (
        <div>
          <Link href={`/crm/${o.id}`} className="font-medium hover:underline">
            {o.clientName}
          </Link>
          {o.contactName && <p className="text-xs text-muted">{o.contactName}</p>}
        </div>
      ),
      filterFn: (row, _id, v: string) => `${row.original.clientName} ${row.original.contactName ?? ""} ${row.original.brokerName ?? ""} ${row.original.currentInsurer ?? ""}`.toLowerCase().includes(v.toLowerCase()),
    },
    { accessorKey: "product", header: "Produto", cell: ({ getValue }) => <ProductBadge value={getValue() as Product} /> },
    { accessorKey: "stage", header: "Etapa", cell: ({ getValue }) => <StageBadge value={getValue() as OpportunityStage} />, sortingFn: (a, b) => OPPORTUNITY_STAGES.indexOf(a.original.stage) - OPPORTUNITY_STAGES.indexOf(b.original.stage) },
    { accessorKey: "lives", header: "Vidas", cell: ({ getValue }) => <span className="tabular-nums">{formatNumber(getValue() as number | null)}</span> },
    { accessorKey: "estimatedValue", header: "Valor/mês", cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue() as number | null)}</span> },
    { accessorKey: "currentInsurer", header: "Operadora atual", cell: ({ getValue }) => (getValue() as string) ?? "—" },
    { accessorKey: "source", header: "Origem", cell: ({ getValue }) => LEAD_SOURCE_LABELS[getValue() as LeadSource] ?? (getValue() as string) },
    { accessorKey: "brokerName", header: "Corretor", cell: ({ getValue }) => (getValue() as string) ?? "—" },
    {
      accessorKey: "nextFollowupAt",
      header: "Follow-up",
      cell: ({ row: { original: o } }) => (
        <div className="space-y-0.5">
          <FollowupBadge date={o.nextFollowupAt} today={today} stage={o.stage} />
          {o.nextFollowupAt && <p className="text-[11px] text-muted">{formatDateBR(o.nextFollowupAt)}</p>}
        </div>
      ),
    },
    { accessorKey: "nextStep", header: "Próximo passo", cell: ({ getValue }) => <span className="line-clamp-2 text-xs">{(getValue() as string) ?? "—"}</span> },
  ];
  return <DataTable data={rows} columns={columns} filterPlaceholder="Filtrar por cliente, contato, corretor ou operadora" initialSort={[{ id: "nextFollowupAt", desc: false }]} />;
}

/** Botão "Nova oportunidade" independente do Kanban (usado na visão tabela e em outras telas). */
export function OpportunityCreate({ options, defaults, autoOpen }: { options: CrmOptions; defaults?: Partial<OpportunityFormValue>; autoOpen?: boolean }) {
  const [edit, setEdit] = useState<OpportunityFormValue | null>(null);
  useEffect(() => {
    if (autoOpen) setEdit(blankOpportunity(defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);
  return (
    <>
      <Button size="sm" onClick={() => setEdit(blankOpportunity(defaults))}>
        <Plus /> Nova oportunidade
      </Button>
      <OpportunityDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} value={edit} options={options} />
    </>
  );
}
