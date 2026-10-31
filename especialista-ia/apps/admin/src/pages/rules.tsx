import { BookOpenCheck, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { REQUIRED_FIELD_LABELS, REQUIRED_FIELDS, TOPICS, topicLabel, type RequiredField } from "@especialista/shared";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, Select, Spinner, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
  errorMessage, formatDateTime,
} from "@especialista/ui";
import { FaqDialog, emptyFaq, type FaqRow } from "../components/faq-dialog.tsx";
import { PageHeader, Table, Td } from "../components/layout.tsx";
import { useAuth } from "../lib/auth.tsx";
import { useCatalog } from "../lib/catalog.ts";
import { useSetting } from "../lib/settings.ts";
import { sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

export function RulesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("aba") ?? "faq";
  return (
    <>
      <PageHeader title="Regras e FAQ" description="Respostas oficiais, informações obrigatórias, prioridade de fontes e conflitos entre regras." />
      <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="faq">FAQ oficial</TabsTrigger>
          <TabsTrigger value="obrigatorias">Informações obrigatórias</TabsTrigger>
          <TabsTrigger value="prioridade">Prioridade de fontes</TabsTrigger>
          <TabsTrigger value="conflitos">Conflitos</TabsTrigger>
        </TabsList>
        <TabsContent value="faq"><FaqTab /></TabsContent>
        <TabsContent value="obrigatorias"><RequiredTab /></TabsContent>
        <TabsContent value="prioridade"><PriorityTab /></TabsContent>
        <TabsContent value="conflitos"><ConflictsTab /></TabsContent>
      </Tabs>
    </>
  );
}

function FaqTab() {
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<FaqRow | null>(null);
  const list = useData(async () => {
    let q = sb.from("knowledge_faq").select("id, question, answer, operator_id, topic, contract_types, states, valid_until, status, rule_nature, source_note, source_document_id, embedding_model, updated_at, operator:operators(name)").order("updated_at", { ascending: false });
    if (status) q = q.eq("status", status);
    return unwrap(await q) as unknown as Array<FaqRow & { operator: { name: string } | null }>;
  }, [status]);
  return (
    <Card>
      <CardHeader title="Perguntas e respostas oficiais" description="Publicadas, têm prioridade sobre trechos de documentos e podem responder sem gerar texto."
        actions={<><Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Todas</option><option value="publicado">Publicadas</option><option value="rascunho">Rascunhos</option><option value="arquivado">Arquivadas</option></Select>
          <Button onClick={() => setEditing(emptyFaq())}><Plus className="h-4 w-4" /> Nova FAQ</Button></>} />
      {!list.data ? <div className="p-6"><Spinner /></div> : (
        <Table head={["Pergunta", "Operadora", "Tema", "Status", "Atualizada", ""]} empty={list.data.length === 0 && <EmptyState icon={<BookOpenCheck className="h-5 w-5" />} title="Nenhuma FAQ cadastrada" />}>
          {list.data.map((f) => (
            <tr key={f.id}>
              <Td className="max-w-md"><span className="font-medium">{f.question}</span><span className="line-clamp-1 block text-xs text-ink-500">{f.answer}</span></Td>
              <Td className="text-xs">{f.operator?.name ?? "Geral"}</Td>
              <Td className="text-xs">{f.topic ? topicLabel(f.topic) : "—"}</Td>
              <Td><Badge tone={f.status === "publicado" ? "success" : f.status === "rascunho" ? "neutral" : "warning"}>{f.status}</Badge>
                {f.status === "publicado" && !f.embedding_model && <Badge tone="info" className="ml-1">indexando</Badge>}</Td>
              <Td className="text-xs text-ink-500">{formatDateTime(f.updated_at)}</Td>
              <Td><Button size="sm" variant="ghost" onClick={() => setEditing(f)}><Pencil className="h-3.5 w-3.5" /></Button></Td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <FaqDialog initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />}
    </Card>
  );
}

type Rule = { id?: string; name: string; topic: string | null; operator_id: string | null; required_fields: RequiredField[]; message: string | null; active: boolean };

function RequiredTab() {
  const catalog = useCatalog();
  const [editing, setEditing] = useState<Rule | null>(null);
  const list = useData(async () => unwrap(await sb.from("required_info_rules").select("*").order("name")) as Rule[], []);
  const remove = async (id: string) => {
    if (!confirm("Excluir esta regra?")) return;
    try { unwrap(await sb.from("required_info_rules").delete().eq("id", id).select("id")); void list.reload(); } catch (err) { toast.error(errorMessage(err)); }
  };
  const save = async (r: Rule) => {
    if (!r.name.trim() || r.required_fields.length === 0) return toast.error("Informe o nome e ao menos um campo obrigatório.");
    try {
      const row = { name: r.name.trim(), topic: r.topic, operator_id: r.operator_id, required_fields: r.required_fields, message: r.message?.trim() || null, active: r.active };
      if (r.id) unwrap(await sb.from("required_info_rules").update(row).eq("id", r.id).select("id"));
      else unwrap(await sb.from("required_info_rules").insert(row).select("id"));
      toast.success("Regra salva.");
      setEditing(null);
      void list.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <Card>
      <CardHeader title="Informações obrigatórias" description="Antes de responder, o especialista pede os dados indispensáveis para escolher a regra correta."
        actions={<Button onClick={() => setEditing({ name: "", topic: null, operator_id: null, required_fields: [], message: null, active: true })}><Plus className="h-4 w-4" /> Nova regra</Button>} />
      {!list.data ? <div className="p-6"><Spinner /></div> : (
        <Table head={["Regra", "Quando", "Exige", "Ativa", ""]} empty={list.data.length === 0 && <EmptyState title="Nenhuma regra" />}>
          {list.data.map((r) => (
            <tr key={r.id}>
              <Td className="font-medium">{r.name}</Td>
              <Td className="text-xs">{r.topic ? topicLabel(r.topic) : "Qualquer tema"}{r.operator_id ? ` · ${catalog.data?.operators.find((o) => o.id === r.operator_id)?.name}` : ""}</Td>
              <Td className="text-xs">{r.required_fields.map((f) => REQUIRED_FIELD_LABELS[f].split(" (")[0]).join(", ")}</Td>
              <Td>{r.active ? <Badge tone="success">Sim</Badge> : <Badge>Não</Badge>}</Td>
              <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => remove(r.id!)}><Trash2 className="h-3.5 w-3.5" /></Button></div></Td>
            </tr>
          ))}
        </Table>
      )}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)} title={editing.id ? "Editar regra" : "Nova regra"}
          footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => save(editing)}>Salvar</Button></>}>
          <div className="flex flex-col gap-4">
            <Field label="Nome"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Tema da pergunta"><Select value={editing.topic ?? ""} onChange={(e) => setEditing({ ...editing, topic: e.target.value || null })}><option value="">Qualquer tema</option>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
            <Field label="Somente para a operadora"><Select value={editing.operator_id ?? ""} onChange={(e) => setEditing({ ...editing, operator_id: e.target.value || null })}><option value="">Todas</option>{catalog.data?.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
            <div><p className="mb-1.5 text-xs font-medium text-ink-700">Exigir</p>
              <div className="grid grid-cols-2 gap-1.5">{REQUIRED_FIELDS.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.required_fields.includes(f)}
                  onChange={(e) => setEditing({ ...editing, required_fields: e.target.checked ? [...editing.required_fields, f] : editing.required_fields.filter((x) => x !== f) })} />{REQUIRED_FIELD_LABELS[f].split(" (")[0]}</label>
              ))}</div></div>
            <Field label="Mensagem ao colaborador (opcional)"><Textarea value={editing.message ?? ""} onChange={(e) => setEditing({ ...editing, message: e.target.value })} className="min-h-[60px]" /></Field>
            <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} label="Regra ativa" />
          </div>
        </Dialog>
      )}
    </Card>
  );
}

const WEIGHTS: Array<[string, string, string]> = [
  ["operator_match", "Mesma operadora", "Bônus quando o documento é da operadora citada"],
  ["product_match", "Mesmo produto", "Bônus quando o produto citado coincide"],
  ["region_match", "Mesma região (UF/cidade)", "Documentos de outra UF são sempre excluídos"],
  ["contract_type_match", "Mesma modalidade", "PME, adesão, individual etc."],
  ["lives_match", "Faixa de vidas compatível", ""],
  ["recency", "Atualização recente", "Documentos publicados há menos tempo"],
  ["document_priority", "Prioridade manual do documento", "Campo prioridade (-10 a 10)"],
  ["official_faq", "FAQ oficial", "Respostas aprovadas por editores"],
  ["negotiated_penalty", "Penalidade: condição negociada", "Exceções nunca viram regra geral"],
];

function PriorityTab() {
  const { can } = useAuth();
  const s = useSetting<Record<string, number>>("source_priority");
  if (!s.value) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Prioridade de fontes" description="Vigência é eliminatória: documentos vencidos ou futuros nunca são usados como regra atual. Os pesos abaixo desempatam as fontes válidas." />
      <CardBody className="flex flex-col gap-4">
        {!can("admin") && <Alert tone="info">Somente administradores alteram estes pesos.</Alert>}
        <div className="grid gap-4 md:grid-cols-3">
          {WEIGHTS.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <Input type="number" step="0.05" min={0} max={2} value={s.value![k] ?? 0} disabled={!can("admin")} onChange={(e) => s.set({ [k]: Number(e.target.value) })} />
            </Field>
          ))}
        </div>
        {can("admin") && <Button className="self-end" onClick={() => s.save()} loading={s.busy} disabled={!s.dirty}>Salvar pesos</Button>}
      </CardBody>
    </Card>
  );
}

type Conflict = { id: string; description: string; status: string; source: string; resolution: string | null; created_at: string; a: { id: string; title: string } | null; b: { id: string; title: string } | null };

function ConflictsTab() {
  const [status, setStatus] = useState("aberto");
  const [resolving, setResolving] = useState<Conflict | null>(null);
  const [resolution, setResolution] = useState("");
  const list = useData(async () => {
    let q = sb.from("knowledge_conflicts").select("id, description, status, source, resolution, created_at, a:knowledge_documents!knowledge_conflicts_document_a_id_fkey(id, title), b:knowledge_documents!knowledge_conflicts_document_b_id_fkey(id, title)").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    return unwrap(await q) as unknown as Conflict[];
  }, [status]);
  const resolve = async (s: "resolvido" | "descartado") => {
    if (!resolving) return;
    try {
      unwrap(await sb.from("knowledge_conflicts").update({ status: s, resolution: resolution || null, resolved_at: new Date().toISOString() }).eq("id", resolving.id).select("id"));
      toast.success("Conflito atualizado.");
      setResolving(null);
      setResolution("");
      void list.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <Card>
      <CardHeader title="Conflitos entre regras" description="O especialista não escolhe entre regras divergentes: ele informa o conflito e registra aqui para decisão humana."
        actions={<Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="aberto">Abertos</option><option value="resolvido">Resolvidos</option><option value="descartado">Descartados</option><option value="">Todos</option></Select>} />
      {!list.data ? <div className="p-6"><Spinner /></div> : (
        <Table head={["Data", "Documentos", "Descrição", "Origem", ""]} empty={list.data.length === 0 && <EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="Nenhum conflito" />}>
          {list.data.map((c) => (
            <tr key={c.id}>
              <Td className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(c.created_at)}</Td>
              <Td className="text-xs">{c.a?.title ?? "—"}<span className="block text-ink-500">× {c.b?.title ?? "—"}</span></Td>
              <Td className="max-w-md whitespace-pre-line text-xs">{c.description}{c.resolution && <span className="mt-1 block text-success-600">Resolução: {c.resolution}</span>}</Td>
              <Td><Badge tone={c.source === "resposta" ? "danger" : "warning"}>{c.source === "resposta" ? "Em resposta" : c.source === "cadastro" ? "No cadastro" : "Manual"}</Badge></Td>
              <Td>{c.status === "aberto" && <Button size="sm" variant="outline" onClick={() => setResolving(c)}>Resolver</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {resolving && (
        <Dialog open onOpenChange={(o) => !o && setResolving(null)} title="Resolver conflito" description="Corrija a base (desative a regra antiga, ajuste a vigência ou a abrangência) e registre a decisão."
          footer={<><Button variant="outline" onClick={() => resolve("descartado")}>Não é conflito</Button><Button onClick={() => resolve("resolvido")}>Marcar resolvido</Button></>}>
          <Field label="Decisão / ação tomada"><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Ex.: comunicado de 08/2026 substitui o guia; guia desativado." /></Field>
        </Dialog>
      )}
    </Card>
  );
}
