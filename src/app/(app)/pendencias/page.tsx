import { PendenciesBoard } from "@/components/pendencies/pendencies-board";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/inputs";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { PENDENCY_CATEGORIES, type PendencyCategory } from "@/lib/domain/constants";
import { sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { taskOptions } from "@/server/services/options";
import { listPendencies } from "@/server/services/pendencies";

export const metadata = { title: "Pendências" };

export default async function PendenciesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const category = PENDENCY_CATEGORIES.includes(s.categoria as PendencyCategory) ? (s.categoria as PendencyCategory) : null;
  const status = (sp(s.status) as "abertas" | "todas" | "resolvidas" | null) ?? "abertas";
  const owner = s.resp === undefined ? null : s.resp === "eu" ? user.id : sp(s.resp);
  const [rows, opts] = await Promise.all([listPendencies({ category: null, status, ownerId: owner, quotationId: sp(s.cotacao), q: sp(s.q) }), taskOptions()]);
  return (
    <>
      <PageHeader title="Central de pendências" description="Cliente, operadora, documentos, base de vidas e internas — com responsável, origem, prazo, prioridade e próxima ação" />
      <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-5" role="search">
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Buscar pendência ou empresa" className="sm:col-span-2" />
        <Select name="status" defaultValue={status}>
          <option value="abertas">Abertas</option>
          <option value="resolvidas">Resolvidas/canceladas</option>
          <option value="todas">Todas</option>
        </Select>
        <Select name="resp" defaultValue={s.resp ?? ""}>
          <option value="">Todos os responsáveis</option>
          <option value="eu">Minhas</option>
          {opts.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        {s.cotacao && <input type="hidden" name="cotacao" value={s.cotacao} />}
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      <PendenciesBoard
        rows={rows.map((r) => ({ ...r.p, companyName: r.companyName, quotationCode: r.quotationCode, ownerName: r.ownerName }))}
        users={opts.users}
        quotations={opts.quotations}
        canWrite={can(user.role, "pendency:write")}
        defaultQuotationId={sp(s.cotacao)}
        initialCategory={category}
      />
    </>
  );
}
