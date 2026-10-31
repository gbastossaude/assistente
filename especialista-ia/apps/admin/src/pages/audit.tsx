import { ScrollText } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Card, EmptyState, Input, Select, Spinner, errorMessage, formatDateTime } from "@especialista/ui";
import { PageHeader, Table, Td } from "../components/layout.tsx";
import { sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

const ENTITIES = ["profiles", "operators", "products", "knowledge_documents", "document_versions", "knowledge_faq", "required_info_rules", "knowledge_conflicts", "system_settings", "handoff_requests", "auth.users", "dados"];
const PAGE = 100;

export function AuditPage() {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");
  const [page, setPage] = useState(0);
  const logs = useData(async () => {
    let q = sb.from("audit_logs").select("*").order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (entity) q = q.eq("entity", entity);
    if (action) q = q.eq("action", action);
    if (entityId.trim()) q = q.eq("entity_id", entityId.trim());
    const rows = unwrap(await q) as Array<{ id: number; actor_id: string | null; actor_role: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string }>;
    const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
    const names = ids.length ? unwrap(await sb.from("profiles").select("id, full_name, email").in("id", ids)) as Array<{ id: string; full_name: string; email: string }> : [];
    return rows.map((r) => ({ ...r, actor: names.find((n) => n.id === r.actor_id) }));
  }, [entity, action, entityId, page]);

  return (
    <>
      <PageHeader title="Auditoria" description="Registro das alterações administrativas (quem, quando e o quê). Conteúdo de perguntas e documentos não é copiado." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-ink-100 p-4">
          <Select className="w-56" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} aria-label="Entidade">
            <option value="">Todas as entidades</option>{ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
          <Select className="w-44" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} aria-label="Ação">
            <option value="">Todas as ações</option>
            {["insert", "update", "delete", "criar_usuario", "bloquear_usuario", "desbloquear_usuario", "redefinir_senha", "retencao"].map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
          <Input className="max-w-xs" placeholder="ID do registro" value={entityId} onChange={(e) => setEntityId(e.target.value)} aria-label="ID do registro" />
        </div>
        {logs.error ? <div className="p-4"><Alert tone="danger">{errorMessage(logs.error)}</Alert></div> : !logs.data ? <div className="p-6"><Spinner /></div> : (
          <>
            <Table head={["Data", "Quem", "Ação", "Entidade", "Detalhes"]} empty={logs.data.length === 0 && <EmptyState icon={<ScrollText className="h-5 w-5" />} title="Nenhum registro" />}>
              {logs.data.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(l.created_at)}</Td>
                  <Td className="text-xs">{l.actor?.full_name || l.actor?.email || (l.actor_role === "sistema" ? "Sistema" : l.actor_role ?? "—")}<span className="block text-ink-500">{l.actor_role}</span></Td>
                  <Td className="text-xs font-medium">{l.action}</Td>
                  <Td className="text-xs">{l.entity}<span className="block font-mono text-[10px] text-ink-500">{l.entity_id}</span></Td>
                  <Td className="max-w-md"><details><summary className="cursor-pointer text-xs text-accent-600">ver</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-ink-50 p-2 text-[10px]">{JSON.stringify(l.details, null, 2)}</pre></details></Td>
                </tr>
              ))}
            </Table>
            <div className="flex justify-between border-t border-ink-100 p-3">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={logs.data.length < PAGE} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
