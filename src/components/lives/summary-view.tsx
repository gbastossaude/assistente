import type { LivesSummary } from "@/lib/lives-import/summary";
import { formatCnpj } from "@/lib/domain/cnpj";
import { formatNumber } from "@/lib/utils";
import { StatCard } from "@/components/ui/misc";
import { BucketBarChart } from "./summary-charts";

export function LivesSummaryView({ s, showCid }: { s: LivesSummary; showCid: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Total de vidas" value={formatNumber(s.total)} />
        <StatCard label="Titulares" value={formatNumber(s.titulares)} />
        <StatCard label="Dependentes" value={formatNumber(s.dependentes)} />
        <StatCard label="Agregados" value={formatNumber(s.agregados)} />
        <StatCard label="Idade média" value={s.averageAge === null ? "—" : formatNumber(s.averageAge, 1)} />
        <StatCard label="Situações especiais" value={formatNumber(s.specialSituations)} tone={s.specialSituations ? "amber" : "default"} />
        <StatCard label="Registros com CID" value={showCid ? formatNumber(s.withCid) : "•••"} hint={showCid ? undefined : "Restrito"} />
        <StatCard label="Registros incompletos" value={formatNumber(s.incomplete)} tone={s.incomplete ? "red" : "green"} hint={s.withWarnings ? `${s.withWarnings} com aviso` : undefined} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BucketBarChart title="Vidas por faixa etária (ANS)" data={s.byAgeBand} />
        <BucketBarChart title="Vidas por plano" data={s.byPlan} horizontal />
        <BucketBarChart title="Vidas por UF" data={s.byUf} />
        <BucketBarChart title="Vidas por cidade" data={s.byCity} horizontal max={10} />
        <BucketBarChart title="Vidas por CNPJ" data={s.byCnpj.map((b) => ({ ...b, key: b.key.length === 14 ? formatCnpj(b.key) : b.key }))} horizontal max={10} />
        <BucketBarChart title="Situações especiais" data={s.bySituation} horizontal />
        {s.bySex && <BucketBarChart title="Vidas por sexo" data={s.bySex} horizontal />}
      </div>
    </div>
  );
}
