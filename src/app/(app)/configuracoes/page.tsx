import { eq } from "drizzle-orm";
import Link from "next/link";
import { ChecklistTemplatesAdmin, GeneralSettingsForm, RulesAdmin, TemplatesAdmin, UsersAdmin } from "@/components/settings/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader, TabLinks } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { formatDateTimeBR } from "@/lib/domain/dates";
import { sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { settings } from "@/server/db/schema";
import { listAudit, listChecklistTemplates, listMessageTemplates, listRules } from "@/server/services/admin";
import { listUsers } from "@/server/services/users";
import { getAllSettings } from "@/server/settings";

export const metadata = { title: "Configurações" };

const AUDIT_ACTIONS = ["create", "update", "delete", "restore", "status_change", "upload", "download", "import", "deadline_change", "checklist_change", "batch", "login", "login_failed", "override", "assistant_action", "settings_change", "retention_purge"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const canSettings = can(user.role, "settings:manage");
  const tabs = [
    can(user.role, "users:manage") && { key: "usuarios", label: "Usuários" },
    canSettings && { key: "parametros", label: "Parâmetros" },
    canSettings && { key: "checklists", label: "Checklists" },
    canSettings && { key: "automacoes", label: "Automações" },
    canSettings && { key: "templates", label: "Templates" },
    can(user.role, "audit:read") && { key: "auditoria", label: "Auditoria" },
    { key: "sobre", label: "Sobre / integrações" },
  ].filter(Boolean) as { key: string; label: string }[];
  const tab = tabs.find((t) => t.key === s.tab)?.key ?? tabs[0].key;

  return (
    <>
      <PageHeader title="Configurações" description="Usuários, parâmetros, modelos de checklist, automações, templates e auditoria" />
      <TabLinks baseHref="/configuracoes" active={tab} tabs={tabs} />
      {tab === "usuarios" && <UsersAdmin users={await listUsers()} currentUserId={user.id} />}
      {tab === "parametros" && <GeneralSettingsForm settings={await getAllSettings()} />}
      {tab === "checklists" && <ChecklistTemplatesAdmin items={await listChecklistTemplates()} />}
      {tab === "automacoes" && (
        <RulesAdmin
          rules={await listRules()}
          lastSweep={await db
            .select()
            .from(settings)
            .where(eq(settings.key, "last_sweep_at"))
            .then((r) => (r[0] ? String(r[0].value) : null))}
        />
      )}
      {tab === "templates" && <TemplatesAdmin templates={await listMessageTemplates()} />}
      {tab === "auditoria" && <AuditTab s={s} />}
      {tab === "sobre" && (
        <Card className="space-y-3 p-4 text-sm">
          <p>
            <strong>Integrações externas.</strong> A agenda funciona integralmente sem integração. A sincronização com Google Calendar via OAuth está preparada no modelo de dados (<code>calendar_events.external_provider/external_id</code>) e documentada em{" "}
            <code>docs/DEPLOY.md</code> como próxima etapa.
          </p>
          <p>
            <strong>Assistente IA.</strong> {process.env.ANTHROPIC_API_KEY ? <Badge tone="emerald">Claude conectado</Badge> : <Badge tone="slate">Modo local (sem chave de API)</Badge>} — configure <code>ANTHROPIC_API_KEY</code> para respostas em linguagem natural com Claude; sem chave, o
            assistente usa o roteador local de intenções.
          </p>
          <p>
            <strong>Armazenamento.</strong> Driver: <code>{process.env.STORAGE_DRIVER || "local"}</code>. Documentos ficam em área privada; downloads passam por rota autenticada e auditada.
          </p>
        </Card>
      )}
    </>
  );
}

async function AuditTab({ s }: { s: Record<string, string | undefined> }) {
  const page = Math.max(1, Number(s.p ?? 1));
  const rows = await listAudit({ q: sp(s.q), action: sp(s.acao), entityType: sp(s.entidade), from: sp(s.de), to: sp(s.ate), sensitive: s.sensivel === "1", page });
  const link = (p: number) => `/configuracoes?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(s).filter(([, v]) => v)) as Record<string, string>), tab: "auditoria", p: String(p) })}`;
  return (
    <>
      <form className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-7">
        <input type="hidden" name="tab" value="auditoria" />
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Buscar no resumo" className="col-span-2" />
        <Select name="acao" defaultValue={s.acao ?? ""}>
          <option value="">Todas as ações</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
        <Input name="de" type="date" defaultValue={s.de ?? ""} aria-label="De" />
        <Input name="ate" type="date" defaultValue={s.ate ?? ""} aria-label="Até" />
        <Select name="sensivel" defaultValue={s.sensivel ?? ""}>
          <option value="">Todos</option>
          <option value="1">Somente sensíveis</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Nenhum registro" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Data/hora</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Entidade</th>
                <th className="px-3 py-2">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, userName }) => (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs">{formatDateTimeBR(l.createdAt)}</td>
                  <td className="px-3 py-1.5 text-xs">{userName ?? "sistema"}</td>
                  <td className="px-3 py-1.5">
                    <Badge tone={l.action.includes("delete") || l.action === "login_failed" ? "red" : l.action === "override" ? "amber" : "slate"}>{l.action}</Badge> {l.sensitive && <Badge tone="amber">sensível</Badge>}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{l.entityType}</td>
                  <td className="px-3 py-1.5">
                    {l.summary}
                    {l.changes && Object.keys(l.changes).length > 0 && (
                      <details className="text-xs text-muted">
                        <summary className="cursor-pointer">alterações</summary>
                        <pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap">{JSON.stringify(l.changes, null, 1)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="mt-2 flex justify-end gap-3 text-xs">
        {page > 1 && <Link href={link(page - 1)}>← Anterior</Link>}
        <span className="text-muted">Página {page}</span>
        {rows.length === 100 && <Link href={link(page + 1)}>Próxima →</Link>}
      </div>
    </>
  );
}
