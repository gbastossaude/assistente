import { Download, Printer, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatDateBR } from "@/lib/domain/dates";
import { formatMoney, formatPct } from "@/lib/utils";
import type { Comparison } from "@/server/services/insurers";
import { PrintButton } from "./print-button";

/** Comparativo lado a lado. O sistema não elege a "melhor" proposta — a escolha é do usuário (destaque ★). */
export function ComparisonView({ quotationId, comparison }: { quotationId: string; comparison: Comparison }) {
  const cols = comparison.proposals.flatMap((p) => p.plans.map((pl) => ({ p, pl })));
  if (!cols.length) return <EmptyState title="Sem propostas para comparar" description="Registre as propostas recebidas na aba Propostas." />;
  const rows: { label: string; get: (c: (typeof cols)[number]) => React.ReactNode }[] = [
    { label: "Produto/plano", get: (c) => <span className="font-medium">{c.pl.productName}</span> },
    { label: "Rede", get: (c) => c.pl.network ?? "—" },
    { label: "Abrangência", get: (c) => c.pl.coverage ?? "—" },
    { label: "Acomodação", get: (c) => c.pl.accommodation ?? "—" },
    { label: "Coparticipação", get: (c) => c.pl.copay ?? "—" },
    { label: "Reembolso", get: (c) => formatMoney(c.pl.reimbursement) },
    { label: "Valor mensal estimado", get: (c) => <span className="font-semibold">{formatMoney(c.pl.monthlyValue)}</span> },
    { label: "Custo atual", get: (c) => formatMoney(c.pl.currentCost) },
    { label: "Variação vs. atual", get: (c) => (c.pl.variation === null ? "—" : `${c.pl.variation > 0 ? "+" : ""}${formatMoney(c.pl.variation)}`) },
    {
      label: "% economia/aumento",
      get: (c) => (c.pl.variationPct === null ? "—" : <span className={c.pl.variationPct > 0 ? "text-red-700" : "text-emerald-700"}>{`${c.pl.variationPct > 0 ? "+" : ""}${formatPct(c.pl.variationPct)}`}</span>),
    },
    { label: "Comissão", get: (c) => formatPct(c.p.p.commissionPct) },
    { label: "Taxa administrativa", get: (c) => formatPct(c.p.p.adminFeePct) },
    { label: "Carências", get: (c) => c.pl.waitingPeriods ?? "—" },
    { label: "Condições comerciais", get: (c) => c.pl.commercialConditions ?? c.p.p.commercialConditions ?? "—" },
    { label: "Validade", get: (c) => (c.p.expired ? <Badge tone="red">Vencida {formatDateBR(c.p.p.validUntil)}</Badge> : formatDateBR(c.p.p.validUntil)) },
    { label: "Observações", get: (c) => c.pl.notes ?? c.p.p.notes ?? "—" },
  ];
  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Custo mensal atual de referência (contratos atuais): <strong>{formatMoney(comparison.currentMonthlyCost)}</strong>. A decisão final é do usuário — use ★ na aba Propostas para destacar.
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/quotations/${quotationId}/comparativo`}>
              <Download /> Excel
            </a>
          </Button>
          <PrintButton>
            <Printer /> Imprimir / PDF
          </PrintButton>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-border bg-surface-2 px-3 py-2 text-left text-xs text-muted">Critério</th>
              {cols.map((c) => (
                <th key={c.pl.id} className={`border-b border-border px-3 py-2 text-left ${c.p.p.selectedForPresentation ? "bg-amber-50 dark:bg-amber-950" : "bg-surface-2/60"}`}>
                  <span className="flex items-center gap-1 font-semibold">
                    {c.p.p.selectedForPresentation && <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label="Destacada" />}
                    {c.p.insurerName}
                  </span>
                  <span className="text-[11px] font-normal text-muted">v{c.p.p.version}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-2 text-left text-xs font-medium text-muted">{r.label}</th>
                {cols.map((c) => (
                  <td key={c.pl.id} className={`max-w-60 border-b border-border px-3 py-2 align-top ${c.p.p.selectedForPresentation ? "bg-amber-50/50 dark:bg-amber-950/40" : ""}`}>
                    {r.get(c)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th className="sticky left-0 border-r border-border bg-surface px-3 py-2 text-left text-xs font-medium text-muted">Total mensal da proposta</th>
              {cols.map((c) => (
                <td key={c.pl.id} className="px-3 py-2 tabular-nums">
                  {formatMoney(c.p.totalMonthly)}
                  {c.p.variationPct !== null && <span className={`ml-1 text-xs ${c.p.variationPct > 0 ? "text-red-700" : "text-emerald-700"}`}>({c.p.variationPct > 0 ? "+" : ""}{formatPct(c.p.variationPct)})</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
