import Link from "next/link";
import { Plus } from "lucide-react";
import { PipelineTable } from "@/components/quotations/pipeline";
import { toPipelineRows } from "@/components/quotations/rows";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { LARGE_ACCOUNT_MIN_LIVES, MARKET_STATUSES } from "@/lib/domain/constants";
import { formatNumber } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth";
import { listQuotations } from "@/server/services/quotations";

export const metadata = { title: "Grandes Contas +99" };

export default async function LargeAccountsPage() {
  await requirePagePermission("operations:read");
  const rows = toPipelineRows(await listQuotations({ minLives: LARGE_ACCOUNT_MIN_LIVES }));
  const ready = rows.filter((r) => r.completeness >= 100 && !MARKET_STATUSES.includes(r.status));
  const incomplete = rows.filter((r) => r.completeness < 80);
  const inMarket = rows.filter((r) => MARKET_STATUSES.includes(r.status));
  return (
    <>
      <PageHeader
        title="Grandes Contas +99 vidas"
        description="Processos acima de 99 vidas, com completude documental e situação no mercado"
        actions={
          <Button asChild>
            <Link href="/cotacoes/nova">
              <Plus /> Nova cotação +99
            </Link>
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Processos em andamento" value={rows.length} />
        <StatCard label="Vidas em cotação" value={formatNumber(rows.reduce((a, r) => a + r.lives, 0))} />
        <StatCard label="Prontas para mercado (100%)" value={ready.length} tone="green" hint="Checklist obrigatório completo" />
        <StatCard label="Incompletas (<80%)" value={incomplete.length} tone="red" />
        <StatCard label="No mercado / decisão" value={inMarket.length} tone="blue" />
      </div>
      <PipelineTable rows={rows} />
    </>
  );
}
