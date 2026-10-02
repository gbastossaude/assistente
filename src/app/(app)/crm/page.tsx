import { Download, KanbanSquare, Table2 } from "lucide-react";
import Link from "next/link";
import { OpportunityBoard, OpportunityCreate, OpportunityTable } from "@/components/crm/board";
import { toOpportunityViews } from "@/components/crm/to-view";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/inputs";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS, NEGOTIATION_STAGES, OPEN_STAGES, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS, PRODUCTS, PRODUCT_LABELS, WON_STAGES, type OpportunityStage, type Product } from "@/lib/domain/commercial";
import { followupState } from "@/lib/domain/crm";
import { todayISO } from "@/lib/domain/dates";
import { cn, formatMoney, sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { listOpportunities, type OpportunityFilters } from "@/server/services/opportunities";
import { commercialOptions } from "@/server/services/options";

export const metadata = { title: "CRM — Oportunidades" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const scope = await getScope(user);
  const view = s.view === "tabela" ? "tabela" : "kanban";
  const filters: OpportunityFilters = {
    q: sp(s.q),
    product: (PRODUCTS as readonly string[]).includes(s.produto ?? "") ? (s.produto as Product) : null,
    brokerId: s.corretor === "eu" ? user.id : sp(s.corretor),
    source: sp(s.origem),
    campaignId: sp(s.campanha),
    stage: (OPPORTUNITY_STAGES as readonly string[]).includes(s.etapa ?? "") ? (s.etapa as OpportunityStage) : null,
    followup: s.followup === "atrasado" || s.followup === "hoje" || s.followup === "sem_data" ? s.followup : null,
    includeClosed: s.encerradas === "1",
  };
  const [rows, options] = await Promise.all([listOpportunities(filters, scope), commercialOptions(scope)]);
  const data = toOpportunityViews(rows);
  const today = todayISO();
  const open = data.filter((o) => OPEN_STAGES.includes(o.stage));
  const negotiating = data.filter((o) => NEGOTIATION_STAGES.includes(o.stage)).reduce((a, o) => a + (o.estimatedValue ?? 0), 0);
  const overdue = open.filter((o) => followupState(o.nextFollowupAt, today) === "atrasado").length;
  const wonValue = data.filter((o) => WON_STAGES.includes(o.stage)).reduce((a, o) => a + (o.estimatedValue ?? 0), 0);
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(s).filter(([k, v]) => v && k !== "nova") as [string, string][]);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/crm?${p.toString()}`;
  };
  const exportQs = new URLSearchParams(Object.entries(s).filter(([k, v]) => v && !["nova", "view"].includes(k)) as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="CRM — Oportunidades"
        description="Pipeline comercial: leads, clientes e vendas de saúde, dental, vida, seguros, consórcio e benefícios"
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
            {can(user.role, "data:export") && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export/oportunidades?${exportQs}`}>
                  <Download /> CSV
                </a>
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Oportunidades abertas" value={open.length} />
        <StatCard label="Valor em negociação (mês)" value={formatMoney(negotiating)} tone="blue" />
        <StatCard label="Follow-ups atrasados" value={overdue} tone={overdue ? "red" : "default"} href={qs({ followup: "atrasado", view: "tabela" })} />
        <StatCard label="Vendas fechadas (visíveis)" value={formatMoney(wonValue)} tone="green" hint="Fechado + implantado" />
      </div>
      <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" role="search">
        {view === "tabela" && <input type="hidden" name="view" value="tabela" />}
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Cliente, contato, CNPJ/CPF, operadora" className="sm:col-span-2 md:col-span-3 xl:col-span-2" aria-label="Buscar" />
        <Select name="produto" defaultValue={s.produto ?? ""} aria-label="Produto">
          <option value="">Todos os produtos</option>
          {PRODUCTS.map((p) => (
            <option key={p} value={p}>
              {PRODUCT_LABELS[p]}
            </option>
          ))}
        </Select>
        <Select name="etapa" defaultValue={s.etapa ?? ""} aria-label="Etapa">
          <option value="">Todas as etapas</option>
          {OPPORTUNITY_STAGES.map((st) => (
            <option key={st} value={st}>
              {OPPORTUNITY_STAGE_LABELS[st]}
            </option>
          ))}
        </Select>
        <Select name="corretor" defaultValue={s.corretor ?? ""} aria-label="Corretor">
          <option value="">Todos os corretores</option>
          <option value="eu">Minhas</option>
          {options.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select name="origem" defaultValue={s.origem ?? ""} aria-label="Origem">
          <option value="">Todas as origens</option>
          {LEAD_SOURCES.map((o) => (
            <option key={o} value={o}>
              {LEAD_SOURCE_LABELS[o]}
            </option>
          ))}
        </Select>
        <Select name="followup" defaultValue={s.followup ?? ""} aria-label="Follow-up">
          <option value="">Qualquer follow-up</option>
          <option value="atrasado">Atrasados</option>
          <option value="hoje">Para hoje</option>
          <option value="sem_data">Sem data</option>
        </Select>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" name="encerradas" value="1" defaultChecked={s.encerradas === "1"} /> Incluir encerradas
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Filtrar
          </Button>
        </div>
      </form>
      {view === "kanban" ? <OpportunityBoard rows={data} options={options} canWrite={can(user.role, "crm:write")} autoNew={s.nova === "1"} /> : (
        <>
          {can(user.role, "crm:write") && (
            <div className="mb-2 flex justify-end">
              <OpportunityCreate options={options} autoOpen={s.nova === "1"} />
            </div>
          )}
          <OpportunityTable rows={data} />
        </>
      )}
    </>
  );
}
