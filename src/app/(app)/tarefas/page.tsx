import { KanbanSquare, List, Plus } from "lucide-react";
import Link from "next/link";
import { TaskBoard } from "@/components/tasks/task-board";
import { TaskList } from "@/components/tasks/task-list";
import { toTaskViews } from "@/components/tasks/to-view";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/inputs";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { PRIORITIES, PRIORITY_LABELS, TASK_CATEGORIES, TASK_CATEGORY_LABELS } from "@/lib/domain/constants";
import { cn, sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { taskOptions } from "@/server/services/options";
import { getTask, listTasks, type TaskFilters } from "@/server/services/tasks";

export const metadata = { title: "Tarefas" };

const VIEWS = [
  ["abertas", "Abertas"],
  ["hoje", "Hoje"],
  ["atrasadas", "Atrasadas"],
  ["semana", "Próximos 7 dias"],
  ["concluidas", "Concluídas"],
  ["todas", "Todas"],
] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const mode = s.modo === "kanban" && s.nova !== "1" ? "kanban" : "lista";
  const view = (VIEWS.find(([k]) => k === s.view)?.[0] ?? "abertas") as TaskFilters["view"];
  const ownerId = s.resp === "eu" ? user.id : sp(s.resp);
  const scope = await getScope(user);
  const [rows, opts] = await Promise.all([listTasks({ view: mode === "kanban" ? "todas" : view, ownerId, ownerIds: scope.all ? null : scope.ownerIds, q: sp(s.q), priority: sp(s.prioridade), category: sp(s.categoria) }), taskOptions(scope)]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  let tasks = toTaskViews(mode === "kanban" ? rows.filter((r) => r.t.status !== "cancelada" && (r.t.status !== "concluida" || (r.t.completedAt && r.t.completedAt.getTime() >= weekAgo))) : rows);
  // Link direto (?id=) para tarefa fora do filtro atual
  if (s.id && !tasks.some((t) => t.id === s.id)) {
    const t = await getTask(s.id);
    if (t && (scope.all || (t.ownerId && scope.ownerIds.includes(t.ownerId)))) tasks = [{ ...t, companyName: null, quotationCode: null, insurerName: null, ownerName: null }, ...tasks];
  }
  const qs = (v: string) => {
    const p = new URLSearchParams(Object.entries(s).filter(([k, val]) => val && k !== "view" && k !== "nova" && k !== "id" && k !== "modo") as [string, string][]);
    p.set("view", v);
    return `/tarefas?${p}`;
  };
  const modeHref = (m: string) => {
    const p = new URLSearchParams(Object.entries(s).filter(([k, val]) => val && k !== "nova" && k !== "id" && k !== "modo") as [string, string][]);
    if (m === "kanban") p.set("modo", "kanban");
    return `/tarefas?${p}`;
  };
  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Follow-ups, documentação, reuniões e rotinas — com recorrência, lembretes e próxima ação"
        actions={
          <div className="flex rounded-md border border-border bg-surface p-0.5">
            <Link href={modeHref("lista")} className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs", mode === "lista" ? "bg-primary text-white" : "text-muted")}>
              <List className="size-3.5" /> Lista
            </Link>
            <Link href={modeHref("kanban")} className={cn("flex items-center gap-1 rounded px-2.5 py-1 text-xs", mode === "kanban" ? "bg-primary text-white" : "text-muted")}>
              <KanbanSquare className="size-3.5" /> Kanban
            </Link>
          </div>
        }
      />
      {mode === "lista" && <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map(([k, l]) => (
          <Link key={k} href={qs(k)} className={cn("rounded-full border px-3 py-1 text-xs", view === k ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:bg-surface-2")}>
            {l}
          </Link>
        ))}
      </div>}
      <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <input type="hidden" name="view" value={view ?? "abertas"} />
        {mode === "kanban" && <input type="hidden" name="modo" value="kanban" />}
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Título, empresa ou cotação" className="lg:col-span-2" />
        <Select name="resp" defaultValue={s.resp ?? ""}>
          <option value="">Todos os responsáveis</option>
          <option value="eu">Minhas</option>
          {opts.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select name="prioridade" defaultValue={s.prioridade ?? ""}>
          <option value="">Todas as prioridades</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
        <Select name="categoria" defaultValue={s.categoria ?? ""}>
          <option value="">Todas as categorias</option>
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TASK_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {mode === "kanban" && can(user.role, "task:write") && (
        <div className="mb-2 flex justify-end">
          <Button asChild size="sm">
            <Link href="/tarefas?nova=1">
              <Plus /> Nova tarefa
            </Link>
          </Button>
        </div>
      )}
      {mode === "kanban" ? <TaskBoard tasks={tasks} options={opts} canWrite={can(user.role, "task:write")} /> : <TaskList tasks={tasks} options={opts} canWrite={can(user.role, "task:write")} openId={sp(s.id)} autoNew={s.nova === "1"} />}
    </>
  );
}
