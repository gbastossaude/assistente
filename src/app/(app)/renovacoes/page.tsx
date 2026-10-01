import { RenewalsBoard } from "@/components/renewals/renewals-board";
import { Input, Select } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { taskOptions } from "@/server/services/options";
import { listRenewals, renewalSuggestions } from "@/server/services/renewals";

export const metadata = { title: "Renovações" };

export default async function RenewalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const [rows, sugg, opts] = await Promise.all([
    listRenewals({ q: sp(s.q), includeClosed: s.encerradas === "1", ownerId: s.resp === "eu" ? user.id : null, month: sp(s.mes) }),
    renewalSuggestions(),
    taskOptions(),
  ]);
  return (
    <>
      <PageHeader title="Renovações" description="Visão 30/60/90/120 dias com marcos automáticos: 120 preparar · 90 documentação · 60 no mercado · 30 negociação final" />
      <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-5" role="search">
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Empresa ou operadora" className="sm:col-span-2" />
        <Input name="mes" type="month" defaultValue={s.mes ?? ""} aria-label="Mês de aniversário" />
        <Select name="encerradas" defaultValue={s.encerradas ?? ""}>
          <option value="">Em andamento</option>
          <option value="1">Incluir encerradas</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      <RenewalsBoard
        rows={rows.map((r) => ({ ...r.r, companyName: r.companyName, ownerName: r.ownerName, quotationCode: r.quotationCode }))}
        suggestions={sugg.map((x) => ({ companyId: x.c.companyId, companyName: x.companyName, contractId: x.c.id, insurerId: x.c.insurerId, insurerName: x.c.insurerName, next: x.next, lives: null }))}
        companies={opts.companies}
        insurers={opts.insurers}
        users={opts.users}
        quotations={opts.quotations}
        canWrite={can(user.role, "renewal:write")}
        openId={sp(s.id)}
        initialWindow={sp(s.janela)}
        newFor={s.nova === "1" ? sp(s.empresa) : null}
      />
    </>
  );
}
