import { AlertTriangle, CheckCircle2, ClipboardPaste, Download, Eye, FilePlus2, FileUp, Power, RefreshCw, ScanText, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ACCEPTED_EXTENSIONS, CONTRACT_TYPE_LABELS, CONTRACT_TYPES, DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, DOCUMENT_STATUS_LABELS,
  KNOWLEDGE_BUCKET, RULE_NATURE_LABELS, RULE_NATURES, UFS, daysBetween, formatDateBR, todayISO,
  type DocumentRow, type DocumentStatus, type DocumentVersionRow, type OperatorRow, type ProductRow,
} from "@especialista/shared";
import {
  Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, Spinner, Textarea, cn, errorMessage, formatDateTime,
} from "@especialista/ui";
import { PageHeader, Table, Td } from "../components/layout.tsx";
import { useAuth } from "../lib/auth.tsx";
import { useCatalog } from "../lib/catalog.ts";
import { sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

type DocWithJoins = DocumentRow & {
  operator: { name: string } | null;
  product: { name: string } | null;
  current: { version_number: number; page_count: number | null; chunk_count: number | null } | null;
};

const STATUS_TONE: Record<DocumentStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  ativo: "success", revisao: "warning", erro: "danger", processando: "info", rascunho: "neutral", inativo: "neutral",
};
const VERSION_LABEL: Record<DocumentVersionRow["status"], string> = {
  enviado: "Na fila", processando: "Indexando", indexado: "Indexada", revisao: "Aguardando revisão", erro: "Erro", substituido: "Substituída", descartado: "Descartada",
};
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", txt: "text/plain", md: "text/markdown",
};
const MAX_MB = 50;

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validateFile(file: File | null): string | null {
  if (!file) return "Selecione um arquivo.";
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return `Formato não aceito (.${ext}). Use PDF, DOCX, XLSX, CSV ou TXT.`;
  if (file.size > MAX_MB * 1024 * 1024) return `Arquivo maior que ${MAX_MB} MB.`;
  if (file.size === 0) return "Arquivo vazio.";
  return null;
}

/** Envia o arquivo ao Storage privado e registra a versão (o worker indexa em seguida). */
async function uploadVersion(documentId: string, file: File, meta: { version_label?: string; change_notes?: string; ocr_requested?: boolean }) {
  const ext = file.name.toLowerCase().split(".").pop()!;
  const hash = await sha256Hex(file);
  const dup = unwrap(await sb.from("document_versions").select("version_number, document_id, knowledge_documents!document_versions_document_id_fkey(title)").eq("sha256", hash).limit(1));
  if (dup && dup.length) {
    const d = dup[0] as unknown as { version_number: number; knowledge_documents: { title: string } | null };
    throw new Error(`Este arquivo já foi enviado (idêntico) em "${d.knowledge_documents?.title ?? "outro documento"}", versão ${d.version_number}.`);
  }
  const safe = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
  const path = `documentos/${documentId}/${Date.now()}-${safe}`;
  const up = await sb.storage.from(KNOWLEDGE_BUCKET).upload(path, file, { contentType: MIME_BY_EXT[ext], upsert: false });
  if (up.error) throw up.error;
  const ins = await sb.from("document_versions").insert({
    document_id: documentId, version_number: 1, storage_path: path, file_name: file.name, mime_type: MIME_BY_EXT[ext], file_size: file.size, sha256: hash,
    version_label: meta.version_label || null, change_notes: meta.change_notes || null, ocr_requested: !!meta.ocr_requested,
  });
  if (ins.error) throw ins.error;
}

const MIN_TEXT = 40;

/** Converte o texto colado em um arquivo .txt (UTF-8) — segue o mesmo fluxo de indexação e revisão dos arquivos. */
function textToFile(text: string, title: string): File | null {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (clean.length < MIN_TEXT) return null;
  const base = (title.trim() || "texto").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "texto";
  return new File([clean + "\n"], `${base}.txt`, { type: "text/plain" });
}

/** Origem do conteúdo: arquivo enviado ou texto colado/digitado. */
function SourceInput({ title, onChange, fileLabel = "Arquivo *" }: { title: string; onChange: (file: File | null, problem: string | null) => void; fileLabel?: string }) {
  const [mode, setMode] = useState<"arquivo" | "texto">("arquivo");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const emit = (m: typeof mode, t: string, fl: File | null) => {
    if (m === "arquivo") return onChange(fl, null);
    const f = textToFile(t, title);
    onChange(f, f ? null : `Cole ou digite o texto (mínimo de ${MIN_TEXT} caracteres).`);
  };
  const tab = (m: typeof mode, label: string, Icon: typeof FileUp) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); emit(m, text, file); }}
      className={cn("flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", mode === m ? "bg-white font-medium text-ink-950 shadow-sm" : "text-ink-500 hover:text-ink-900")}>
      <Icon className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Origem do conteúdo" className="inline-flex w-fit gap-1 rounded-lg bg-ink-100 p-1">
        {tab("arquivo", "Enviar arquivo", FileUp)}
        {tab("texto", "Colar texto", ClipboardPaste)}
      </div>
      {mode === "arquivo" ? (
        <Field label={fileLabel} hint={`PDF, DOCX, XLSX, CSV ou TXT — até ${MAX_MB} MB`}>
          <Input type="file" accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")} onChange={(e) => { const fl = e.target.files?.[0] ?? null; setFile(fl); emit("arquivo", text, fl); }} />
        </Field>
      ) : (
        <Field label="Texto *" hint={`${text.trim().length.toLocaleString("pt-BR")} caracteres · cole o conteúdo oficial (comunicado, e-mail da operadora, tabela). Não cole dados de clientes.`}>
          <Textarea value={text} onChange={(e) => { setText(e.target.value); emit("texto", e.target.value, file); }} className="min-h-[220px] font-mono text-xs"
            placeholder={"Ex.: Comunicado Operadora X — 01/11/2026\nCarência para consultas: 30 dias para contratos PME a partir de 3 vidas..."} />
        </Field>
      )}
    </div>
  );
}

function validityBadge(d: { valid_until: string | null; status: string }) {
  if (!d.valid_until) return <span className="text-xs text-ink-500">Sem data final</span>;
  const days = daysBetween(todayISO(), d.valid_until);
  if (days < 0) return <Badge tone="danger">Vencido em {formatDateBR(d.valid_until)}</Badge>;
  if (days <= 30) return <Badge tone="warning">Vence em {days} d</Badge>;
  return <span className="text-xs text-ink-700">até {formatDateBR(d.valid_until)}</span>;
}

function scopeText(d: DocumentRow) {
  if (d.is_national) return "Nacional";
  if (d.states.length) return d.states.join(", ") + (d.cities.length ? ` · ${d.cities.join(", ")}` : "");
  return "Não informada";
}

export function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const catalog = useCatalog();
  const [search, setSearch] = useState("");
  const status = params.get("status") ?? "";
  const operator = params.get("operadora") ?? "";
  const category = params.get("categoria") ?? "";
  const expiredOnly = params.get("vencidos") === "1";
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const docs = useData(async () => {
    let q = sb.from("knowledge_documents")
      .select("*, operator:operators!knowledge_documents_operator_id_fkey(name), product:products(name), current:document_versions!knowledge_documents_current_version_fk(version_number, page_count, chunk_count)")
      .order("updated_at", { ascending: false }).limit(500);
    if (status) q = q.eq("status", status);
    if (operator === "geral") q = q.is("operator_id", null);
    else if (operator) q = q.eq("operator_id", operator);
    if (category) q = q.eq("category", category);
    if (expiredOnly) q = q.lt("valid_until", todayISO());
    return unwrap(await q) as unknown as DocWithJoins[];
  }, [status, operator, category, expiredOnly]);

  const filtered = useMemo(() => (docs.data ?? []).filter((d) => !search.trim() || d.title.toLowerCase().includes(search.trim().toLowerCase())), [docs.data, search]);
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  return (
    <>
      <PageHeader title="Documentos" description="Base de conhecimento: arquivos, classificação, vigência, versões e indexação."
        actions={<Button onClick={() => setCreating(true)}><FilePlus2 className="h-4 w-4" /> Novo documento</Button>} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-ink-100 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-500" />
            <Input className="pl-9" placeholder="Buscar por título" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar documentos" />
          </div>
          <Select className="w-44" value={status} onChange={(e) => setParam("status", e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>
            {Object.entries(DOCUMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select className="w-48" value={operator} onChange={(e) => setParam("operadora", e.target.value)} aria-label="Operadora">
            <option value="">Todas as operadoras</option>
            <option value="geral">Geral (ANS/interno)</option>
            {catalog.data?.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Select className="w-52" value={category} onChange={(e) => setParam("categoria", e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABELS[c]}</option>)}
          </Select>
          <Button variant={expiredOnly ? "accent" : "outline"} onClick={() => setParam("vencidos", expiredOnly ? "" : "1")}><AlertTriangle className="h-4 w-4" /> Vencidos</Button>
        </div>
        {docs.error ? <div className="p-4"><Alert tone="danger">{errorMessage(docs.error)}</Alert></div> : docs.loading && !docs.data ? <div className="p-6"><Spinner /></div> : (
          <Table head={["Título", "Operadora", "Categoria", "Abrangência", "Vigência", "Versão", "Status", ""]}
            empty={filtered.length === 0 && <EmptyState icon={<FileUp className="h-5 w-5" />} title="Nenhum documento encontrado" description="Cadastre manuais, comunicados e tabelas das operadoras para alimentar o especialista." />}>
            {filtered.map((d) => (
              <tr key={d.id} className="hover:bg-ink-50">
                <Td><button className="text-left font-medium text-ink-900 hover:text-accent-600 cursor-pointer" onClick={() => setOpenId(d.id)}>{d.title}</button>
                  {d.rule_nature === "condicao_negociada" && <Badge tone="warning" className="ml-2">Negociada</Badge>}</Td>
                <Td className="text-xs">{d.operator?.name ?? "Geral"}{d.product ? <span className="block text-ink-500">{d.product.name}</span> : null}</Td>
                <Td className="text-xs">{DOCUMENT_CATEGORY_LABELS[d.category as keyof typeof DOCUMENT_CATEGORY_LABELS] ?? d.category}</Td>
                <Td className="text-xs">{scopeText(d)}</Td>
                <Td>{validityBadge(d)}</Td>
                <Td className="text-xs">{d.current ? `v${d.current.version_number} · ${d.current.chunk_count ?? 0} trechos` : "—"}</Td>
                <Td><Badge tone={STATUS_TONE[d.status]}>{DOCUMENT_STATUS_LABELS[d.status]}</Badge></Td>
                <Td><Button size="sm" variant="ghost" onClick={() => setOpenId(d.id)}><Eye className="h-3.5 w-3.5" /> Abrir</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {creating && catalog.data && <DocumentFormDialog catalog={catalog.data} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); void docs.reload(); setOpenId(id); }} />}
      {openId && catalog.data && <DocumentDetailDialog id={openId} catalog={catalog.data} onClose={() => { setOpenId(null); void docs.reload(); }} />}
    </>
  );
}

interface DocForm {
  title: string; description: string; operator_id: string; product_id: string; administrator_id: string; category: string; rule_nature: string;
  contract_types: string[]; scope: "nacional" | "estados" | "nao_informado"; states: string[]; cities: string; lives_min: string; lives_max: string;
  published_at: string; valid_from: string; valid_until: string; version_label: string; priority: string;
}

function toForm(d?: DocumentRow): DocForm {
  return {
    title: d?.title ?? "", description: d?.description ?? "", operator_id: d?.operator_id ?? "", product_id: d?.product_id ?? "", administrator_id: d?.administrator_id ?? "",
    category: d?.category ?? "manual_comercial", rule_nature: d?.rule_nature ?? "regra_contratacao", contract_types: d?.contract_types ?? [],
    scope: d ? (d.is_national ? "nacional" : d.states.length ? "estados" : "nao_informado") : "nao_informado", states: d?.states ?? [], cities: (d?.cities ?? []).join(", "),
    lives_min: d?.lives_min?.toString() ?? "", lives_max: d?.lives_max?.toString() ?? "", published_at: d?.published_at ?? "", valid_from: d?.valid_from ?? "",
    valid_until: d?.valid_until ?? "", version_label: d?.version_label ?? "", priority: String(d?.priority ?? 0),
  };
}

function formToRow(f: DocForm) {
  const int = (v: string) => (v.trim() ? Number(v) : null);
  return {
    title: f.title.trim(), description: f.description.trim() || null, operator_id: f.operator_id || null, product_id: f.product_id || null,
    administrator_id: f.administrator_id || null, category: f.category, rule_nature: f.rule_nature, contract_types: f.contract_types,
    is_national: f.scope === "nacional", states: f.scope === "estados" ? f.states : [], cities: f.scope === "estados" ? f.cities.split(",").map((c) => c.trim()).filter(Boolean) : [],
    lives_min: int(f.lives_min), lives_max: int(f.lives_max), published_at: f.published_at || null, valid_from: f.valid_from || null,
    valid_until: f.valid_until || null, version_label: f.version_label.trim() || null, priority: Number(f.priority) || 0,
  };
}

function validateForm(f: DocForm): string | null {
  if (f.title.trim().length < 3) return "Informe um título com pelo menos 3 caracteres.";
  if (f.scope === "estados" && f.states.length === 0) return "Selecione ao menos um estado ou mude a abrangência.";
  if (f.lives_min && f.lives_max && Number(f.lives_min) > Number(f.lives_max)) return "Vidas mínimas maior que máximas.";
  if (f.valid_from && f.valid_until && f.valid_until < f.valid_from) return "Data de validade anterior ao início da vigência.";
  if (!f.valid_until) return null;
  return null;
}

function Chips({ options, value, onChange, label }: { options: Array<[string, string]>; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(([k, l]) => {
        const on = value.includes(k);
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={cn("rounded-full border px-2.5 py-1 text-xs cursor-pointer", on ? "border-accent-600 bg-accent-50 text-accent-600" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>{l}</button>
        );
      })}
    </div>
  );
}

function MetadataFields({ f, set, catalog }: { f: DocForm; set: (p: Partial<DocForm>) => void; catalog: { operators: OperatorRow[]; products: ProductRow[] } }) {
  const products = catalog.products.filter((p) => p.operator_id === f.operator_id);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Título *" className="md:col-span-2"><Input value={f.title} onChange={(e) => set({ title: e.target.value })} required maxLength={300} /></Field>
      <Field label="Operadora / seguradora" hint="Deixe em branco para regras gerais (ANS, procedimentos internos)">
        <Select value={f.operator_id} onChange={(e) => set({ operator_id: e.target.value, product_id: "" })}>
          <option value="">Geral (não específico)</option>
          {catalog.operators.filter((o) => o.kind !== "administradora").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label="Produto (opcional)">
        <Select value={f.product_id} onChange={(e) => set({ product_id: e.target.value })} disabled={!products.length}>
          <option value="">Todos os produtos</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Administradora de benefícios (se aplicável)">
        <Select value={f.administrator_id} onChange={(e) => set({ administrator_id: e.target.value })}>
          <option value="">Nenhuma</option>
          {catalog.operators.filter((o) => o.kind === "administradora").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label="Categoria do documento">
        <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
          {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABELS[c]}</option>)}
        </Select>
      </Field>
      <Field label="Natureza da regra" hint="Condições negociadas nunca são apresentadas como regra geral" className="md:col-span-2">
        <Select value={f.rule_nature} onChange={(e) => set({ rule_nature: e.target.value })}>
          {RULE_NATURES.map((r) => <option key={r} value={r}>{RULE_NATURE_LABELS[r]}</option>)}
        </Select>
      </Field>
      <div className="md:col-span-2"><p className="mb-1.5 text-xs font-medium text-ink-700">Tipos de contratação</p>
        <Chips label="Tipos de contratação" options={CONTRACT_TYPES.map((c) => [c, CONTRACT_TYPE_LABELS[c]])} value={f.contract_types} onChange={(v) => set({ contract_types: v })} /></div>
      <Field label="Abrangência geográfica">
        <Select value={f.scope} onChange={(e) => set({ scope: e.target.value as DocForm["scope"] })}>
          <option value="nao_informado">Não informada no documento</option><option value="nacional">Nacional</option><option value="estados">Estados/cidades específicos</option>
        </Select>
      </Field>
      {f.scope === "estados" ? (
        <Field label="Cidades (opcional, separadas por vírgula)"><Input value={f.cities} onChange={(e) => set({ cities: e.target.value })} /></Field>
      ) : <div />}
      {f.scope === "estados" && <div className="md:col-span-2"><p className="mb-1.5 text-xs font-medium text-ink-700">Estados</p><Chips label="Estados" options={UFS.map((u) => [u, u])} value={f.states} onChange={(v) => set({ states: v })} /></div>}
      <Field label="Vidas mínimas"><Input type="number" min={1} value={f.lives_min} onChange={(e) => set({ lives_min: e.target.value })} /></Field>
      <Field label="Vidas máximas"><Input type="number" min={1} value={f.lives_max} onChange={(e) => set({ lives_max: e.target.value })} /></Field>
      <Field label="Data de publicação"><Input type="date" value={f.published_at} onChange={(e) => set({ published_at: e.target.value })} /></Field>
      <Field label="Início da vigência"><Input type="date" value={f.valid_from} onChange={(e) => set({ valid_from: e.target.value })} /></Field>
      <Field label="Válido até" hint="Após esta data o documento deixa de ser usado como regra atual"><Input type="date" value={f.valid_until} onChange={(e) => set({ valid_until: e.target.value })} /></Field>
      <Field label="Prioridade (-10 a 10)" hint="Desempate entre fontes equivalentes"><Input type="number" min={-10} max={10} value={f.priority} onChange={(e) => set({ priority: e.target.value })} /></Field>
      <Field label="Descrição (opcional)" className="md:col-span-2"><Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} className="min-h-[60px]" /></Field>
    </div>
  );
}

function DocumentFormDialog({ catalog, onClose, onSaved }: { catalog: { operators: OperatorRow[]; products: ProductRow[] }; onClose: () => void; onSaved: (id: string) => void }) {
  const { profile } = useAuth();
  const [f, setF] = useState<DocForm>(toForm());
  const [file, setFile] = useState<File | null>(null);
  const [sourceProblem, setSourceProblem] = useState<string | null>(null);
  const [ocr, setOcr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState<Array<{ id: string; title: string }> | null>(null);
  const set = (p: Partial<DocForm>) => { setF((x) => ({ ...x, ...p })); setSimilar(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateForm(f) ?? sourceProblem ?? validateFile(file);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      // Antes de criar, avisa se já existem documentos ativos equivalentes (possível nova versão).
      if (similar === null && f.operator_id) {
        const s = unwrap(await sb.from("knowledge_documents").select("id, title").eq("operator_id", f.operator_id).eq("category", f.category).in("status", ["ativo", "revisao", "processando"]).limit(5));
        if (s.length) { setSimilar(s); setBusy(false); return; }
      }
      const doc = unwrap(await sb.from("knowledge_documents").insert({ ...formToRow(f), created_by: profile?.id, updated_by: profile?.id }).select("id").single()) as { id: string };
      try {
        await uploadVersion(doc.id, file!, { version_label: f.version_label, ocr_requested: ocr });
      } catch (err) {
        toast.error(`Documento criado, mas o envio do arquivo falhou: ${errorMessage(err)}. Envie o arquivo pelo detalhe do documento.`);
        onSaved(doc.id);
        return;
      }
      toast.success("Documento enviado. A indexação começa assim que o worker local estiver online.");
      onSaved(doc.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Novo documento" description="Envie um arquivo ou cole o texto. O conteúdo fica em armazenamento privado e é indexado pelo worker local." wide
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button form="doc-form" type="submit" loading={busy}>{similar?.length ? "Criar mesmo assim" : "Salvar e enviar"}</Button></>}>
      <form id="doc-form" onSubmit={submit} className="flex flex-col gap-5">
        <MetadataFields f={f} set={set} catalog={catalog} />
        <SourceInput title={f.title} onChange={(fl, p) => { setFile(fl); setSourceProblem(p); }} />
        <Field label="Rótulo da versão (opcional)" hint="Ex.: Manual 2026 rev. 3" className="md:max-w-sm"><Input value={f.version_label} onChange={(e) => set({ version_label: e.target.value })} /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} className="mt-1" />
          <span>PDF digitalizado (imagem): tentar OCR local se o texto não puder ser extraído. <span className="text-ink-500">O resultado sempre passa por revisão humana.</span></span></label>
        {similar && similar.length > 0 && (
          <Alert tone="warning" title="Já existem documentos ativos da mesma operadora e categoria">
            {similar.map((s) => <span key={s.id} className="block">• {s.title}</span>)}
            Se este arquivo for uma atualização, cancele e use <b>Nova versão</b> no documento existente — assim o histórico é preservado e não haverá regras conflitantes.
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Dialog>
  );
}

function DocumentDetailDialog({ id, catalog, onClose }: { id: string; catalog: { operators: OperatorRow[]; products: ProductRow[] }; onClose: () => void }) {
  const { profile } = useAuth();
  const doc = useData(async () => unwrap(await sb.from("knowledge_documents").select("*").eq("id", id).single()) as DocumentRow, [id]);
  const versions = useData(async () => unwrap(await sb.from("document_versions").select("*").eq("document_id", id).order("version_number", { ascending: false })) as DocumentVersionRow[], [id]);
  const conflicts = useData(async () => unwrap(await sb.from("knowledge_conflicts").select("id, description, status, source, created_at").or(`document_a_id.eq.${id},document_b_id.eq.${id}`).order("created_at", { ascending: false })), [id]);
  const [f, setF] = useState<DocForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [newVersion, setNewVersion] = useState(false);
  const [chunksOf, setChunksOf] = useState<DocumentVersionRow | null>(null);
  const [deactivate, setDeactivate] = useState(false);
  const [reason, setReason] = useState("");
  const form = f ?? (doc.data ? toForm(doc.data) : null);
  const reload = () => { void doc.reload(); void versions.reload(); void conflicts.reload(); };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); reload(); } catch (err) { toast.error(errorMessage(err)); }
  };
  const save = async () => {
    if (!form) return;
    const problem = validateForm(form);
    if (problem) return toast.error(problem);
    setSaving(true);
    await act(async () => unwrap(await sb.from("knowledge_documents").update({ ...formToRow(form), updated_by: profile?.id }).eq("id", id).select("id")), "Classificação atualizada.");
    setSaving(false);
    setF(null);
  };
  const download = async (v: DocumentVersionRow) => {
    const { data, error } = await sb.storage.from(KNOWLEDGE_BUCKET).createSignedUrl(v.storage_path, 60);
    if (error) return toast.error(errorMessage(error));
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={doc.data?.title ?? "Documento"} wide
      description={doc.data ? `${DOCUMENT_STATUS_LABELS[doc.data.status]} · atualizado em ${formatDateTime(doc.data.updated_at)}` : undefined}
      footer={<>
        {doc.data?.status === "inativo"
          ? <Button variant="outline" onClick={() => act(async () => unwrap(await sb.rpc("set_document_active", { p_document_id: id, p_active: true })), "Documento reativado.")}><Power className="h-4 w-4" /> Reativar</Button>
          : <Button variant="outline" onClick={() => setDeactivate(true)}><Power className="h-4 w-4" /> Desativar</Button>}
        <Button variant="outline" onClick={() => act(async () => unwrap(await sb.rpc("request_reindex", { p_document_id: id })), "Reindexação solicitada.")}><RefreshCw className="h-4 w-4" /> Reindexar</Button>
        <Button variant="outline" onClick={() => setNewVersion(true)}><FileUp className="h-4 w-4" /> Nova versão</Button>
        <Button onClick={save} loading={saving} disabled={!f}>Salvar classificação</Button>
      </>}>
      {!form ? <Spinner /> : (
        <div className="flex flex-col gap-6">
          {doc.data?.status === "inativo" && <Alert tone="info" title="Documento desativado">{doc.data.deactivation_reason} — mantido apenas para histórico e auditoria.</Alert>}
          {(conflicts.data ?? []).filter((c: { status: string }) => c.status === "aberto").map((c: { id: string; description: string }) => (
            <Alert key={c.id} tone="danger" title="Conflito em aberto com outra regra">{c.description}</Alert>
          ))}
          <section>
            <h3 className="mb-3 text-sm font-semibold">Versões</h3>
            {versions.loading && !versions.data ? <Spinner /> : (
              <div className="flex flex-col gap-2">
                {(versions.data ?? []).length === 0 && <Alert tone="warning">Nenhum arquivo enviado. Use “Nova versão” para enviar o arquivo.</Alert>}
                {(versions.data ?? []).map((v) => (
                  <div key={v.id} className={cn("rounded-lg border p-3 text-sm", doc.data?.current_version_id === v.id ? "border-success-600/40 bg-success-50/50" : "border-ink-200")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">v{v.version_number}{v.version_label ? ` · ${v.version_label}` : ""}</span>
                      {doc.data?.current_version_id === v.id && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Vigente</Badge>}
                      <Badge tone={v.status === "erro" ? "danger" : v.status === "revisao" ? "warning" : v.status === "indexado" ? "success" : "neutral"}>{VERSION_LABEL[v.status]}</Badge>
                      {v.ocr_used && <Badge tone="info"><ScanText className="h-3 w-3" /> OCR</Badge>}
                      <span className="ml-auto text-xs text-ink-500">{v.file_name} · {(v.file_size / 1024).toFixed(0)} KB · {formatDateTime(v.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {v.page_count ?? "—"} página(s) · {v.chunk_count ?? 0} trecho(s){v.embedding_model ? ` · embeddings ${v.embedding_model}` : ""}{v.change_notes ? ` · ${v.change_notes}` : ""}
                    </p>
                    {v.review_reason && <p className="mt-1 text-xs text-warning-600">{v.review_reason}</p>}
                    {v.error_message && <p className="mt-1 text-xs text-danger-600">{v.error_message}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => download(v)}><Download className="h-3.5 w-3.5" /> Original</Button>
                      {(v.chunk_count ?? 0) > 0 || v.status === "revisao" ? <Button size="sm" variant="outline" onClick={() => setChunksOf(v)}><Eye className="h-3.5 w-3.5" /> Ver texto extraído</Button> : null}
                      {v.status === "revisao" && <Button size="sm" variant="accent" onClick={() => act(async () => unwrap(await sb.rpc("approve_document_version", { p_version_id: v.id, p_notes: "Conferido com o original" })), "Extração aprovada e versão ativada.")}><CheckCircle2 className="h-3.5 w-3.5" /> Aprovar extração</Button>}
                      {["revisao", "erro"].includes(v.status) && v.mime_type === "application/pdf" && !v.ocr_requested && (
                        <Button size="sm" variant="outline" onClick={() => act(async () => { unwrap(await sb.from("document_versions").update({ ocr_requested: true }).eq("id", v.id).select("id")); unwrap(await sb.rpc("request_reindex", { p_document_id: id })); }, "OCR solicitado: o worker tentará reconhecer o texto.")}><ScanText className="h-3.5 w-3.5" /> Tentar OCR</Button>
                      )}
                      {doc.data?.current_version_id !== v.id && !["substituido", "descartado"].includes(v.status) && (
                        <Button size="sm" variant="ghost" onClick={() => act(async () => unwrap(await sb.rpc("discard_document_version", { p_version_id: v.id, p_reason: "Descartada pelo editor" })), "Versão descartada.")}><Trash2 className="h-3.5 w-3.5" /> Descartar</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold">Classificação</h3>
            <MetadataFields f={form} set={(p) => setF({ ...form, ...p })} catalog={catalog} />
          </section>
        </div>
      )}
      {newVersion && doc.data && <NewVersionDialog doc={doc.data} current={(versions.data ?? []).find((v) => v.id === doc.data!.current_version_id) ?? null} onClose={() => { setNewVersion(false); reload(); }} />}
      {chunksOf && <ChunksDialog version={chunksOf} onClose={() => setChunksOf(null)} />}
      {deactivate && (
        <Dialog open onOpenChange={(o) => !o && setDeactivate(false)} title="Desativar documento" description="O documento sai das respostas, mas permanece no histórico e na auditoria."
          footer={<><Button variant="outline" onClick={() => setDeactivate(false)}>Cancelar</Button>
            <Button variant="danger" disabled={reason.trim().length < 3} onClick={async () => { await act(async () => unwrap(await sb.rpc("set_document_active", { p_document_id: id, p_active: false, p_reason: reason })), "Documento desativado."); setDeactivate(false); }}>Desativar</Button></>}>
          <Field label="Motivo *"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: substituído pelo manual 2027" /></Field>
        </Dialog>
      )}
    </Dialog>
  );
}

function NewVersionDialog({ doc, current, onClose }: { doc: DocumentRow; current: DocumentVersionRow | null; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceProblem, setSourceProblem] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [ocr, setOcr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const problem = sourceProblem ?? validateFile(file) ?? (label.trim() ? null : "Informe o rótulo da nova versão.") ?? (confirm ? null : "Confirme que esta é uma versão mais recente.");
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await uploadVersion(doc.id, file!, { version_label: label, change_notes: notes, ocr_requested: ocr });
      toast.success("Nova versão enviada. A versão atual continua valendo até a nova ser indexada.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Enviar nova versão" description={doc.title}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={busy}>Enviar versão</Button></>}>
      <div className="flex flex-col gap-4">
        {current && <Alert tone="info" title="Versão vigente">v{current.version_number}{current.version_label ? ` · ${current.version_label}` : ""} — {current.file_name} (enviada em {formatDateTime(current.created_at)})</Alert>}
        <SourceInput title={doc.title} onChange={(fl, p) => { setFile(fl); setSourceProblem(p); }} />
        <Field label="Rótulo da versão *" hint="Ex.: Comunicado 08/2026"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field label="O que mudou?"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} className="mt-1" /> PDF digitalizado: tentar OCR local</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1" />
          Confirmo que este conteúdo é uma versão mais recente do mesmo documento e que a classificação (vigência, região, modalidade) continua correta.</label>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  );
}

function ChunksDialog({ version, onClose }: { version: DocumentVersionRow; onClose: () => void }) {
  const chunks = useData(async () => unwrap(await sb.from("document_chunks").select("chunk_index, page_from, page_to, section, content").eq("version_id", version.id).order("chunk_index").limit(60)), [version.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Texto extraído — v${version.version_number}`} description="Confira se o texto corresponde ao original antes de aprovar." wide>
      {chunks.loading ? <Spinner /> : (chunks.data ?? []).length === 0 ? <EmptyState title="Nenhum texto extraído" description="Envie um arquivo legível ou solicite OCR." /> : (
        <ol className="flex flex-col gap-3">
          {(chunks.data ?? []).map((c: { chunk_index: number; page_from: number | null; page_to: number | null; section: string | null; content: string }) => (
            <li key={c.chunk_index} className="rounded-lg border border-ink-200 p-3">
              <p className="mb-1 text-[11px] font-medium text-ink-500">Trecho {c.chunk_index + 1} · p. {c.page_from}{c.page_to !== c.page_from ? `–${c.page_to}` : ""}{c.section ? ` · ${c.section}` : ""}</p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-900">{c.content}</p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
