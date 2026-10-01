import { KanbanSquare, Plus, Table2 } from "lucide-react";
import Link from "next/link";
import { PipelineBoard, PipelineTable } from "@/components/quotations/pipeline";
import { toPipelineRows } from "@/components/quotations/rows";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/inputs";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { PRIORITIES, PRIORITY_LABELS, type Priority, type ProcessType } from "@/lib/domain/constants";
import { cn, sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { listQuotations } from "@/server/services/quotations";
import { userOptions } from "@/server/services/users";

export const metadata = { title: "Cotações" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const view = s.view === "tabela" ? "tabela" : "kanban";
  const includeClosed = s.encerradas === "1";
  const [rows, users] = await Promise.all([
    listQuotations({ q: sp(s.q), ownerId: sp(s.owner), processType: sp(s.tipo) as ProcessType | null, priority: sp(s.prioridade) as Priority | null, includeClosed, minLives: s.min ? Number(s.min) : null }),
    userOptions(),
  ]);
  const data = toPipelineRows(rows);
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(s).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/cotacoes?${p.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="Cotações"
        description="Pipeline de cotações — 20 etapas, do levantamento à implantação"
        actions={
          <>
            <div className="flex rounded-md border border-border bg-surface p-0.5">
              <Link href={qs({ view: null })} className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs", view === "kanban" ? "bg-primary text-white" : "text-muted")}>
                <KanbanSquare className="size-3.5" /> Kanban
              </Link>
              <Link href={qs({ view: "tabela" })} className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs", view === "tabela" ? "bg-primary text-white" : "text-muted")}>
                <Table2 className="size-3.5" /> Tabela
              </Link>
            </div>
            {can(user.role, "quotation:write") && (
              <Button asChild>
                <Link href="/cotacoes/nova">
                  <Plus /> Nova cotação
                </Link>
              </Button>
            )}
          </>
        }
      />
      <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7" role="search">
        <input type="hidden" name="view" value={view === "tabela" ? "tabela" : ""} />
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Empresa ou código" className="col-span-2" />
        <Select name="owner" defaultValue={s.owner ?? ""}>
          <option value="">Todos os responsáveis</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select name="tipo" defaultValue={s.tipo ?? ""}>
          <option value="">NEW e RENEW</option>
          <option value="NEW">NEW</option>
          <option value="RENEW">RENEW</option>
        </Select>
        <Select name="prioridade" defaultValue={s.prioridade ?? ""}>
          <option value="">Todas as prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
        <Select name="encerradas" defaultValue={s.encerradas ?? ""}>
          <option value="">Em andamento</option>
          <option value="1">Incluir encerradas</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {view === "kanban" ? <PipelineBoard rows={data} canOverride={can(user.role, "quotation:override_ready")} showClosed={includeClosed} /> : <PipelineTable rows={data} />}
    </>
  );
}
