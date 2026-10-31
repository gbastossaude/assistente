import { Copy, Cpu, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPES, EDGE_FUNCTIONS, OPERATOR_KIND_LABELS, OPERATOR_KINDS, type OperatorRow, type ProductRow } from "@especialista/shared";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, Select, Spinner, StatusDot, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
  errorMessage, timeAgo,
} from "@especialista/ui";
import { UsageMeter } from "../components/charts.tsx";
import { PageHeader, Table, Td } from "../components/layout.tsx";
import { applyBranding, type Branding } from "../lib/branding.ts";
import { useCatalog } from "../lib/catalog.ts";
import { useSetting } from "../lib/settings.ts";
import { SUPABASE_URL, sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

function SaveBar({ dirty, busy, onSave }: { dirty: boolean; busy: boolean; onSave: () => void }) {
  return <div className="flex justify-end border-t border-ink-100 pt-4"><Button onClick={onSave} loading={busy} disabled={!dirty}>Salvar alterações</Button></div>;
}
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <Card><CardHeader title={title} description={description} /><CardBody className="flex flex-col gap-4">{children}</CardBody></Card>;
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("aba") ?? "ia";
  return (
    <>
      <PageHeader title="Configurações" description="Modelos de IA, WhatsApp e custos, catálogo, segurança, retenção e identidade visual." />
      <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="ia">IA</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp e custos</TabsTrigger>
          <TabsTrigger value="operadoras">Operadoras e produtos</TabsTrigger>
          <TabsTrigger value="seguranca">Segurança</TabsTrigger>
          <TabsTrigger value="retencao">Retenção</TabsTrigger>
          <TabsTrigger value="marca">Identidade visual</TabsTrigger>
          <TabsTrigger value="worker">Worker</TabsTrigger>
        </TabsList>
        <TabsContent value="ia"><AiTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="operadoras"><OperatorsTab /></TabsContent>
        <TabsContent value="seguranca"><SecurityTab /></TabsContent>
        <TabsContent value="retencao"><RetentionTab /></TabsContent>
        <TabsContent value="marca"><BrandingTab /></TabsContent>
        <TabsContent value="worker"><WorkerTab /></TabsContent>
      </Tabs>
    </>
  );
}

const EMBEDDINGS: Record<string, number> = { "bge-m3": 1024, "nomic-embed-text": 768 };

function AiTab() {
  const s = useSetting<Json>("ai");
  if (!s.value) return <Spinner />;
  const v = s.value;
  const dimChanged = EMBEDDINGS[String(v.embedding_model)] && EMBEDDINGS[String(v.embedding_model)] !== num(v.embedding_dimensions);
  return (
    <Section title="Inteligência artificial (local)" description="Modelos executados pelo Ollama no computador do worker — sem custo por uso e sem envio de dados a terceiros.">
      <Alert tone="success" title="Modo gratuito ativo">Somente provedores locais são permitidos. Para habilitar um provedor pago no futuro é preciso alterar o código e a configuração explicitamente — nada é contratado automaticamente.</Alert>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Modelo de respostas" hint="qwen3:4b (recomendado, ≥ 8 GB RAM) ou llama3.2:3b (máquinas modestas)">
          <Input list="chat-models" value={String(v.chat_model)} onChange={(e) => s.set({ chat_model: e.target.value.trim() })} />
        </Field>
        <datalist id="chat-models"><option value="qwen3:4b" /><option value="llama3.2:3b" /><option value="qwen3:8b" /><option value="gemma3:4b" /></datalist>
        <Field label="Modelo de embeddings" hint="bge-m3 (1024, multilíngue) ou nomic-embed-text (768)">
          <Select value={String(v.embedding_model)} onChange={(e) => s.set({ embedding_model: e.target.value })}>
            {Object.keys(EMBEDDINGS).map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Dimensão dos vetores" hint="Deve coincidir com a coluna vector do banco">
          <Input type="number" value={num(v.embedding_dimensions)} onChange={(e) => s.set({ embedding_dimensions: Number(e.target.value) })} />
        </Field>
        <Field label="Temperatura" hint="Baixa = respostas mais fiéis às fontes"><Input type="number" step="0.05" min={0} max={1} value={num(v.temperature)} onChange={(e) => s.set({ temperature: Number(e.target.value) })} /></Field>
        <Field label="Trechos enviados ao modelo"><Input type="number" min={2} max={12} value={num(v.max_context_chunks)} onChange={(e) => s.set({ max_context_chunks: Number(e.target.value) })} /></Field>
        <Field label="Similaridade mínima" hint="Abaixo disso o trecho é considerado irrelevante"><Input type="number" step="0.01" min={0} max={1} value={num(v.min_vector_similarity)} onChange={(e) => s.set({ min_vector_similarity: Number(e.target.value) })} /></Field>
        <Field label="FAQ direta a partir de" hint="Similaridade para responder com a FAQ oficial sem gerar texto"><Input type="number" step="0.01" min={0.5} max={1} value={num(v.faq_direct_threshold)} onChange={(e) => s.set({ faq_direct_threshold: Number(e.target.value) })} /></Field>
        <Field label="Tempo limite por resposta (ms)"><Input type="number" min={10000} max={600000} step={1000} value={num(v.request_timeout_ms)} onChange={(e) => s.set({ request_timeout_ms: Number(e.target.value) })} /></Field>
        <Field label="Alertar vencimento (dias)"><Input type="number" min={1} max={180} value={num(v.near_expiry_days)} onChange={(e) => s.set({ near_expiry_days: Number(e.target.value) })} /></Field>
      </div>
      {dimChanged && <Alert tone="warning" title="Atenção à dimensão">O modelo {String(v.embedding_model)} gera {EMBEDDINGS[String(v.embedding_model)]} dimensões. Ajuste a dimensão, execute <code>scripts/sql/alterar-dimensao-embeddings.sql</code> no Supabase e reindexe os documentos.</Alert>}
      <SaveBar dirty={s.dirty} busy={s.busy} onSave={() => void s.save()} />
    </Section>
  );
}

function WhatsAppTab() {
  const s = useSetting<Json>("whatsapp");
  const usage = useData(async () => unwrap(await sb.rpc("whatsapp_usage_summary")) as { reserved: number; cap: number; sent: number; delivered: number; failed: number; blocked: number; today_reserved: number; daily_cap: number }, []);
  const webhook = `${SUPABASE_URL || "https://SEU-PROJETO.supabase.co"}/functions/v1/${EDGE_FUNCTIONS.webhook}`;
  if (!s.value) return <Spinner />;
  const v = s.value;
  const cap = num(v.monthly_cap);
  const save = () => {
    if (cap < 1 || cap > 1000) return toast.error("O teto mensal deve ficar entre 1 e 1.000 (padrão conservador: 900).");
    if (num(v.daily_cap) > cap) return toast.error("O teto diário não pode ser maior que o mensal.");
    if (num(v.max_answer_chars) > 4000) return toast.error("Respostas no WhatsApp: no máximo 4.000 caracteres.");
    void s.save();
  };
  return (
    <div className="flex flex-col gap-6">
      <Section title="Bot oficial do WhatsApp" description="Integração exclusiva com a WhatsApp Business Cloud API da Meta. Sem templates pagos e sem mensagens proativas.">
        <div className="flex flex-wrap gap-6">
          <Switch checked={Boolean(v.enabled)} onCheckedChange={(x) => s.set({ enabled: x })} label="Envio de mensagens ativo" />
          <Switch checked={Boolean(v.offline_ack)} onCheckedChange={(x) => s.set({ offline_ack: x })} label="Avisar quando o assistente estiver offline" />
          <Switch checked={Boolean(v.reply_unauthorized)} onCheckedChange={(x) => s.set({ reply_unauthorized: x })} label="Responder números não autorizados (consome franquia)" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Modo"><Select value={String(v.mode)} onChange={(e) => s.set({ mode: e.target.value })}><option value="teste">Teste (número de testes da Meta)</option><option value="producao">Produção</option></Select></Field>
          <Field label="Teto mensal de mensagens" hint="Padrão conservador: 900 (abaixo da franquia gratuita de serviço)"><Input type="number" min={1} max={1000} value={cap} onChange={(e) => s.set({ monthly_cap: Number(e.target.value) })} /></Field>
          <Field label="Teto diário"><Input type="number" min={1} max={1000} value={num(v.daily_cap)} onChange={(e) => s.set({ daily_cap: Number(e.target.value) })} /></Field>
          <Field label="Alertas de consumo (%)" hint="Separados por vírgula"><Input value={(v.alert_thresholds as number[] ?? []).map((t) => Math.round(t * 100)).join(", ")}
            onChange={(e) => s.set({ alert_thresholds: e.target.value.split(",").map((x) => Number(x.trim()) / 100).filter((x) => x > 0 && x <= 1) })} /></Field>
          <Field label="Tamanho máximo da resposta"><Input type="number" min={500} max={4000} value={num(v.max_answer_chars)} onChange={(e) => s.set({ max_answer_chars: Number(e.target.value) })} /></Field>
          <Field label="Prazo para complemento (min)" hint="Tempo para o colaborador responder um pedido de informação"><Input type="number" min={5} max={240} value={num(v.clarification_minutes)} onChange={(e) => s.set({ clarification_minutes: Number(e.target.value) })} /></Field>
        </div>
        <Alert tone="warning">Outros sistemas que usem o mesmo número também consomem a franquia gratuita da Meta. Consulte a tabela oficial de preços vigente antes de ativar em produção.</Alert>
        <SaveBar dirty={s.dirty} busy={s.busy} onSave={save} />
      </Section>
      <Section title="Consumo do mês" description="Contagem feita pelo próprio aplicativo (bloqueio preventivo antes do teto).">
        {usage.data ? <>
          <UsageMeter used={usage.data.reserved} cap={usage.data.cap} label="Mensagens no mês" />
          <UsageMeter used={usage.data.today_reserved} cap={usage.data.daily_cap} label="Mensagens hoje" />
          <p className="text-xs text-ink-500">Enviadas {usage.data.sent} · entregues {usage.data.delivered} · falhas {usage.data.failed} · bloqueadas {usage.data.blocked}</p>
        </> : <Spinner />}
      </Section>
      <Section title="Conexão com a Meta" description="Valores secretos ficam somente nas variáveis das Edge Functions do Supabase — nunca no painel ou na extensão.">
        <Field label="URL do webhook (Callback URL no painel da Meta)">
          <div className="flex gap-2"><Input readOnly value={webhook} className="font-mono text-xs" /><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(webhook); toast.success("Copiado."); }}><Copy className="h-4 w-4" /></Button></div>
        </Field>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink-700">
          <li><code>WHATSAPP_VERIFY_TOKEN</code> — o mesmo texto informado em “Verify token” na Meta</li>
          <li><code>WHATSAPP_APP_SECRET</code> — App Secret (valida o cabeçalho X-Hub-Signature-256)</li>
          <li><code>WHATSAPP_ACCESS_TOKEN</code> — token de usuário do sistema com permissão whatsapp_business_messaging</li>
          <li><code>WHATSAPP_PHONE_NUMBER_ID</code> — ID do número comercial</li>
          <li>Inscreva o campo <b>messages</b> do webhook. Guia completo: docs/GUIA_WHATSAPP.md</li>
        </ul>
      </Section>
    </div>
  );
}

function OperatorsTab() {
  const catalog = useCatalog();
  const [op, setOp] = useState<Partial<OperatorRow> | null>(null);
  const [prod, setProd] = useState<Partial<ProductRow> | null>(null);
  const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const saveOp = async () => {
    if (!op?.name?.trim()) return toast.error("Informe o nome.");
    const row = { name: op.name.trim(), slug: op.slug || slug(op.name), kind: op.kind ?? "operadora", ans_registry: op.ans_registry || null,
      aliases: (op.aliases ?? []).map((a) => a.trim()).filter(Boolean), website: op.website || null, notes: op.notes || null, active: op.active ?? true };
    try {
      if (op.id) unwrap(await sb.from("operators").update(row).eq("id", op.id).select("id"));
      else unwrap(await sb.from("operators").insert(row).select("id"));
      toast.success("Operadora salva."); setOp(null); void catalog.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };
  const saveProd = async () => {
    if (!prod?.name?.trim() || !prod.operator_id) return toast.error("Informe operadora e nome do produto.");
    const row = { operator_id: prod.operator_id, name: prod.name.trim(), aliases: (prod.aliases ?? []).map((a) => a.trim()).filter(Boolean), contract_types: prod.contract_types ?? [], notes: prod.notes || null, active: prod.active ?? true };
    try {
      if (prod.id) unwrap(await sb.from("products").update(row).eq("id", prod.id).select("id"));
      else unwrap(await sb.from("products").insert(row).select("id"));
      toast.success("Produto salvo."); setProd(null); void catalog.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };
  const removeProd = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    try { unwrap(await sb.from("products").delete().eq("id", id).select("id")); void catalog.reload(); } catch (err) { toast.error(errorMessage(err)); }
  };
  if (!catalog.data) return <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Operadoras, seguradoras e administradoras" description="Apelidos ajudam a reconhecer a operadora na pergunta (ex.: “Sul America”). Evite apelidos que sejam palavras comuns."
          actions={<Button onClick={() => setOp({ kind: "operadora", aliases: [], active: true })}><Plus className="h-4 w-4" /> Nova</Button>} />
        <Table head={["Nome", "Tipo", "Apelidos", "Registro ANS", "Ativa", ""]}>
          {catalog.data.operators.map((o) => (
            <tr key={o.id}>
              <Td className="font-medium">{o.name}</Td>
              <Td className="text-xs">{OPERATOR_KIND_LABELS[o.kind]}</Td>
              <Td className="text-xs">{o.aliases.join(", ") || "—"}</Td>
              <Td className="text-xs">{o.ans_registry || "—"}</Td>
              <Td>{o.active ? <Badge tone="success">Sim</Badge> : <Badge>Não</Badge>}</Td>
              <Td><Button size="sm" variant="ghost" onClick={() => setOp(o)}><Pencil className="h-3.5 w-3.5" /></Button></Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card>
        <CardHeader title="Produtos" actions={<Button variant="outline" onClick={() => setProd({ aliases: [], contract_types: [], active: true })}><Plus className="h-4 w-4" /> Novo produto</Button>} />
        <Table head={["Produto", "Operadora", "Modalidades", ""]} empty={catalog.data.products.length === 0 && <EmptyState title="Nenhum produto cadastrado" description="Cadastre produtos para que documentos e perguntas possam ser filtrados por plano." />}>
          {catalog.data.products.map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.name}</Td>
              <Td className="text-xs">{catalog.data!.operators.find((o) => o.id === p.operator_id)?.name}</Td>
              <Td className="text-xs">{p.contract_types.map((c) => CONTRACT_TYPE_LABELS[c as keyof typeof CONTRACT_TYPE_LABELS] ?? c).join(", ") || "—"}</Td>
              <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => setProd(p)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => removeProd(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></Td>
            </tr>
          ))}
        </Table>
      </Card>
      {op && (
        <Dialog open onOpenChange={(o) => !o && setOp(null)} title={op.id ? "Editar operadora" : "Nova operadora"} footer={<><Button variant="outline" onClick={() => setOp(null)}>Cancelar</Button><Button onClick={saveOp}>Salvar</Button></>}>
          <div className="flex flex-col gap-4">
            <Field label="Nome *"><Input value={op.name ?? ""} onChange={(e) => setOp({ ...op, name: e.target.value })} /></Field>
            <Field label="Tipo"><Select value={op.kind ?? "operadora"} onChange={(e) => setOp({ ...op, kind: e.target.value as OperatorRow["kind"] })}>{OPERATOR_KINDS.map((k) => <option key={k} value={k}>{OPERATOR_KIND_LABELS[k]}</option>)}</Select></Field>
            <Field label="Apelidos (separados por vírgula)"><Input value={(op.aliases ?? []).join(", ")} onChange={(e) => setOp({ ...op, aliases: e.target.value.split(",") })} /></Field>
            <Field label="Registro ANS"><Input value={op.ans_registry ?? ""} onChange={(e) => setOp({ ...op, ans_registry: e.target.value })} /></Field>
            <Field label="Observações internas"><Textarea value={op.notes ?? ""} onChange={(e) => setOp({ ...op, notes: e.target.value })} className="min-h-[60px]" /></Field>
            <Switch checked={op.active ?? true} onCheckedChange={(x) => setOp({ ...op, active: x })} label="Ativa" />
          </div>
        </Dialog>
      )}
      {prod && (
        <Dialog open onOpenChange={(o) => !o && setProd(null)} title={prod.id ? "Editar produto" : "Novo produto"} footer={<><Button variant="outline" onClick={() => setProd(null)}>Cancelar</Button><Button onClick={saveProd}>Salvar</Button></>}>
          <div className="flex flex-col gap-4">
            <Field label="Operadora *"><Select value={prod.operator_id ?? ""} onChange={(e) => setProd({ ...prod, operator_id: e.target.value })}><option value="">Selecione</option>{catalog.data.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
            <Field label="Nome do produto *"><Input value={prod.name ?? ""} onChange={(e) => setProd({ ...prod, name: e.target.value })} /></Field>
            <Field label="Apelidos (separados por vírgula)"><Input value={(prod.aliases ?? []).join(", ")} onChange={(e) => setProd({ ...prod, aliases: e.target.value.split(",") })} /></Field>
            <Field label="Modalidades (Ctrl/Cmd para várias)"><Select multiple className="h-28" value={prod.contract_types ?? []} onChange={(e) => setProd({ ...prod, contract_types: [...e.target.selectedOptions].map((o) => o.value) })}>
              {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{CONTRACT_TYPE_LABELS[c]}</option>)}</Select></Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SecurityTab() {
  const s = useSetting<Json>("security");
  if (!s.value) return <Spinner />;
  return (
    <Section title="Segurança e limites" description="Proteções contra abuso e uso indevido.">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Perguntas por minuto (por usuário)"><Input type="number" min={1} max={60} value={num(s.value.rate_limit_per_minute)} onChange={(e) => s.set({ rate_limit_per_minute: Number(e.target.value) })} /></Field>
        <Field label="Perguntas por dia (por usuário)"><Input type="number" min={1} max={5000} value={num(s.value.rate_limit_per_day)} onChange={(e) => s.set({ rate_limit_per_day: Number(e.target.value) })} /></Field>
        <Field label="Tamanho máximo da pergunta"><Input type="number" min={100} max={4000} value={num(s.value.max_question_length)} onChange={(e) => s.set({ max_question_length: Number(e.target.value) })} /></Field>
      </div>
      <Switch checked={s.value.block_prompt_injection !== false} onCheckedChange={(x) => s.set({ block_prompt_injection: x })} label="Bloquear tentativas explícitas de prompt injection" />
      <Alert tone="info">Dados pessoais (CPF, telefone, e-mail, cartão SUS, nomes após “cliente”) são removidos no navegador e novamente no servidor, antes de chegar ao modelo.</Alert>
      <SaveBar dirty={s.dirty} busy={s.busy} onSave={() => void s.save()} />
    </Section>
  );
}

function RetentionTab() {
  const s = useSetting<Json>("retention");
  const [running, setRunning] = useState(false);
  if (!s.value) return <Spinner />;
  const run = async () => {
    setRunning(true);
    try { const r = unwrap(await sb.rpc("purge_expired_data")) as Record<string, number>; toast.success(`Limpeza concluída: ${r.questions} pergunta(s), ${r.whatsapp_bodies} mensagem(ns) anonimizada(s).`); }
    catch (err) { toast.error(errorMessage(err)); } finally { setRunning(false); }
  };
  const fields: Array<[string, string]> = [["questions_days", "Perguntas e respostas (dias)"], ["whatsapp_body_days", "Texto das mensagens do WhatsApp (dias)"], ["webhook_events_days", "Eventos do webhook (dias)"], ["audit_days", "Auditoria (dias)"], ["jobs_days", "Tarefas concluídas (dias)"]];
  return (
    <Section title="Política de retenção (LGPD)" description="Executada diariamente (pg_cron ou worker). Dados vencidos são excluídos ou anonimizados.">
      <div className="grid gap-4 md:grid-cols-3">
        {fields.map(([k, l]) => <Field key={k} label={l}><Input type="number" min={1} max={3650} value={num(s.value![k])} onChange={(e) => s.set({ [k]: Number(e.target.value) })} /></Field>)}
      </div>
      <div className="flex justify-between border-t border-ink-100 pt-4">
        <Button variant="outline" onClick={run} loading={running}>Executar limpeza agora</Button>
        <Button onClick={() => void s.save()} loading={s.busy} disabled={!s.dirty}>Salvar alterações</Button>
      </div>
    </Section>
  );
}

function BrandingTab() {
  const s = useSetting<Branding & Json>("branding");
  if (!s.value) return <Spinner />;
  const b = s.value;
  return (
    <Section title="Identidade visual" description="Nome, logo e cores do painel. A extensão usa os ícones em apps/chrome-extension/public/icons.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome do produto"><Input value={b.product_name} onChange={(e) => s.set({ product_name: e.target.value })} /></Field>
        <Field label="Nome da corretora"><Input value={b.company_name} onChange={(e) => s.set({ company_name: e.target.value })} /></Field>
        <Field label="URL da logo (HTTPS, quadrada)"><Input value={b.logo_url} onChange={(e) => s.set({ logo_url: e.target.value })} placeholder="https://…/logo.png" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cor principal"><Input type="color" value={b.primary_color} onChange={(e) => s.set({ primary_color: e.target.value })} /></Field>
          <Field label="Cor de destaque"><Input type="color" value={b.accent_color} onChange={(e) => s.set({ accent_color: e.target.value })} /></Field>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg p-4 text-white" style={{ background: b.primary_color }}>
        <img src={b.logo_url || "/logo.png"} alt="" className="h-9 w-9 rounded-md bg-white/10 object-contain" />
        <span className="font-semibold">{b.product_name}</span>
        <span className="ml-auto rounded-md px-3 py-1 text-xs" style={{ background: b.accent_color }}>Botão</span>
      </div>
      <SaveBar dirty={s.dirty} busy={s.busy} onSave={async () => { if (b.logo_url && !/^https:\/\//.test(b.logo_url)) return toast.error("A logo deve usar HTTPS."); await s.save(); applyBranding(b); }} />
    </Section>
  );
}

function WorkerTab() {
  const s = useSetting<Json>("worker");
  const hb = useData(async () => unwrap(await sb.from("worker_heartbeats").select("*").order("last_seen_at", { ascending: false })) as Array<{ worker_id: string; machine_name: string; app_version: string; status: string; ollama_ok: boolean; chat_model: string; embedding_model: string; jobs_done: number; last_error: string | null; last_seen_at: string; started_at: string }>, []);
  if (!s.value) return <Spinner />;
  const offline = num(s.value.offline_after_seconds);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Computadores conectados" description="O Ollama fica acessível somente na própria máquina; o worker busca tarefas no Supabase." />
        {!hb.data ? <div className="p-6"><Spinner /></div> : hb.data.length === 0 ? <EmptyState icon={<Cpu className="h-5 w-5" />} title="Nenhum worker registrado" description="Siga docs/GUIA_OLLAMA_WINDOWS.md para instalar e iniciar o worker." /> : (
          <Table head={["Máquina", "Situação", "Modelos", "Tarefas", "Iniciado", "Último sinal"]}>
            {hb.data.map((w) => {
              const online = Date.now() - new Date(w.last_seen_at).getTime() < offline * 1000 && w.status !== "parando";
              return (
                <tr key={w.worker_id}>
                  <Td className="font-medium">{w.machine_name}<span className="block text-xs text-ink-500">{w.worker_id} · v{w.app_version}</span></Td>
                  <Td><StatusDot online={online} label={online ? w.status : "offline"} />{!w.ollama_ok && <span className="block text-xs text-danger-600">{w.last_error ?? "Ollama indisponível"}</span>}</Td>
                  <Td className="text-xs">{w.chat_model}<span className="block text-ink-500">{w.embedding_model}</span></Td>
                  <Td className="text-xs">{w.jobs_done}</Td>
                  <Td className="text-xs text-ink-500">{timeAgo(w.started_at)}</Td>
                  <Td className="text-xs text-ink-500">{timeAgo(w.last_seen_at)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Section title="Fila e disponibilidade">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tempo de bloqueio da tarefa (s)" hint="Após isso, outra execução pode retomá-la"><Input type="number" min={60} max={3600} value={num(s.value.lock_seconds)} onChange={(e) => s.set({ lock_seconds: Number(e.target.value) })} /></Field>
          <Field label="Tentativas por tarefa"><Input type="number" min={1} max={10} value={num(s.value.max_attempts)} onChange={(e) => s.set({ max_attempts: Number(e.target.value) })} /></Field>
          <Field label="Considerar offline após (s)"><Input type="number" min={30} max={3600} value={offline} onChange={(e) => s.set({ offline_after_seconds: Number(e.target.value) })} /></Field>
          <Field label="Intervalo do sinal de vida (s)"><Input type="number" min={10} max={300} value={num(s.value.heartbeat_seconds)} onChange={(e) => s.set({ heartbeat_seconds: Number(e.target.value) })} /></Field>
        </div>
        <SaveBar dirty={s.dirty} busy={s.busy} onSave={() => void s.save()} />
      </Section>
    </div>
  );
}
