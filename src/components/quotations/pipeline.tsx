"use client";
import Link from "next/link";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { CompletenessBar, PriorityBadge, QuotationStatusBadge } from "@/components/ui/status";
import { PRIORITY_WEIGHT, QUOTATION_STATUS_LABELS, type QuotationStatus } from "@/lib/domain/constants";
import { formatDateBR, relativeDays } from "@/lib/domain/dates";
import { PIPELINE_PHASES } from "@/lib/domain/pipeline";
import { cn, formatNumber } from "@/lib/utils";
import { StatusDialog } from "./status-dialog";

export interface PipelineRow {
  id: string;
  code: string;
  companyName: string;
  processType: "NEW" | "RENEW";
  status: QuotationStatus;
  lives: number;
  priority: "baixa" | "media" | "alta" | "critica";
  ownerName: string | null;
  targetDate: string | null;
  renewalDate: string | null;
  completeness: number;
  pendingRequired: number;
  openPendencies: number;
  insurersTotal: number;
  insurersAwaiting: number;
  proposalsReceived: number;
  lastActivityAt: string;
}

function Card({ r, onDragStart }: { r: PipelineRow; onDragStart: (e: React.DragEvent) => void }) {
  return (
    <div draggable onDragStart={onDragStart} className="cursor-grab rounded-md border border-border bg-surface p-2.5 shadow-xs hover:border-primary/40 active:cursor-grabbing">
      <div className="flex items-start justify-between gap-1">
        <Link href={`/cotacoes/${r.id}`} className="text-sm font-medium leading-tight hover:underline">
          {r.companyName}
        </Link>
        <Badge tone={r.processType === "NEW" ? "blue" : "violet"}>{r.processType}</Badge>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {r.code} · {formatNumber(r.lives)} vidas
      </p>
      <div className="mt-2">
        <CompletenessBar pct={r.completeness} compact />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {r.priority !== "media" && r.priority !== "baixa" && <PriorityBadge value={r.priority} />}
        {r.openPendencies > 0 && <Badge tone="red">{r.openPendencies} pend.</Badge>}
        {r.insurersTotal > 0 && (
          <Badge tone="indigo">
            {r.proposalsReceived}/{r.insurersTotal} prop.
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">
        {r.ownerName ?? "Sem responsável"}
        {r.targetDate && ` · alvo ${formatDateBR(r.targetDate)}`}
      </p>
    </div>
  );
}

export function PipelineBoard({ rows, canOverride, showClosed }: { rows: PipelineRow[]; canOverride: boolean; showClosed: boolean }) {
  const [drag, setDrag] = useState<{ id: string; target: QuotationStatus } | null>(null);
  const [over, setOver] = useState<QuotationStatus | null>(null);
  const dragged = drag ? rows.find((r) => r.id === drag.id) : null;
  const phases = PIPELINE_PHASES.filter((p) => showClosed || p.key !== "fechamento");
  return (
    <>
      <p className="mb-2 text-xs text-muted">Arraste os cartões entre colunas para mudar o status. Entrar em mercado com pendência obrigatória exige override justificado.</p>
      <div className="flex gap-4 overflow-x-auto pb-3">
        {phases.map((ph) => (
          <section key={ph.key} className="flex shrink-0 flex-col">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{ph.label}</h2>
            <div className="flex gap-2">
              {ph.statuses.map((s) => {
                const items = rows.filter((r) => r.status === s);
                return (
                  <div
                    key={s}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(s);
                    }}
                    onDragLeave={() => setOver(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOver(null);
                      const id = e.dataTransfer.getData("text/plain");
                      const row = rows.find((r) => r.id === id);
                      if (row && row.status !== s) setDrag({ id, target: s });
                    }}
                    className={cn("flex w-60 flex-col rounded-lg bg-surface-2/70 p-2", over === s && "ring-2 ring-primary")}
                  >
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-medium">{QUOTATION_STATUS_LABELS[s]}</span>
                      <span className="rounded-full bg-surface px-1.5 text-[10px] font-semibold text-muted">{items.length}</span>
                    </div>
                    <div className="flex min-h-16 flex-col gap-2">
                      {items.map((r) => (
                        <Card key={r.id} r={r} onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {dragged && drag && (
        <StatusDialog
          open
          onOpenChange={(o) => !o && setDrag(null)}
          quotationId={dragged.id}
          current={dragged.status}
          initialTarget={drag.target}
          pendingRequired={dragged.pendingRequired}
          canOverride={canOverride}
        />
      )}
    </>
  );
}

export function PipelineTable({ rows }: { rows: PipelineRow[] }) {
  const columns: ColumnDef<PipelineRow, unknown>[] = [
    {
      accessorKey: "code",
      header: "Cotação",
      cell: ({ row: { original: r } }) => (
        <div>
          <Link href={`/cotacoes/${r.id}`} className="font-medium hover:underline">
            {r.companyName}
          </Link>
          <p className="text-xs text-muted">{r.code}</p>
        </div>
      ),
      filterFn: (row, _id, v: string) => `${row.original.code} ${row.original.companyName} ${row.original.ownerName ?? ""}`.toLowerCase().includes(v.toLowerCase()),
    },
    { accessorKey: "processType", header: "Tipo", cell: ({ getValue }) => <Badge tone={getValue() === "NEW" ? "blue" : "violet"}>{getValue() as string}</Badge> },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <QuotationStatusBadge value={getValue() as QuotationStatus} />, sortingFn: (a, b) => a.original.status.localeCompare(b.original.status) },
    { accessorKey: "lives", header: "Vidas", cell: ({ getValue }) => <span className="tabular-nums">{formatNumber(getValue() as number)}</span> },
    { accessorKey: "completeness", header: "Completude", cell: ({ getValue }) => <CompletenessBar pct={getValue() as number} /> },
    { accessorKey: "priority", header: "Prioridade", cell: ({ getValue }) => <PriorityBadge value={getValue() as PipelineRow["priority"]} />, sortingFn: (a, b) => PRIORITY_WEIGHT[a.original.priority] - PRIORITY_WEIGHT[b.original.priority] },
    { accessorKey: "openPendencies", header: "Pendências" },
    {
      id: "insurers",
      header: "Operadoras",
      accessorFn: (r) => r.insurersTotal,
      cell: ({ row: { original: r } }) => (r.insurersTotal ? `${r.proposalsReceived} prop. / ${r.insurersAwaiting} aguard. / ${r.insurersTotal}` : "—"),
    },
    { accessorKey: "targetDate", header: "Data-alvo", cell: ({ getValue }) => formatDateBR(getValue() as string | null) },
    { accessorKey: "renewalDate", header: "Renovação", cell: ({ getValue }) => formatDateBR(getValue() as string | null) },
    { accessorKey: "ownerName", header: "Responsável", cell: ({ getValue }) => (getValue() as string) ?? "—" },
    { accessorKey: "lastActivityAt", header: "Última mov.", cell: ({ getValue }) => <span className="text-xs text-muted">{relativeDays((getValue() as string).slice(0, 10))}</span> },
  ];
  return <DataTable data={rows} columns={columns} filterPlaceholder="Filtrar por empresa, código ou responsável" initialSort={[{ id: "lastActivityAt", desc: true }]} />;
}
