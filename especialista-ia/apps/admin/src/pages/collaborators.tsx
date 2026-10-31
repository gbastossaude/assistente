import { Ban, CheckCircle2, Copy, KeyRound, Pencil, ShieldCheck, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EDGE_FUNCTIONS, ROLE_LABELS, ROLES, maskPhone, normalizePhoneBR, type ProfileRow, type Role } from "@especialista/shared";
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, Spinner, errorMessage, timeAgo } from "@especialista/ui";
import { PageHeader, Table, Td } from "../components/layout.tsx";
import { useAuth } from "../lib/auth.tsx";
import { invokeFunction, sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

export function CollaboratorsPage() {
  const { profile: me } = useAuth();
  const list = useData(async () => unwrap(await sb.from("profiles").select("*").order("full_name")) as ProfileRow[], []);
  const [filter, setFilter] = useState<"" | Role>("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  const rows = useMemo(() => (list.data ?? []).filter((p) => (!filter || p.role === filter) &&
    (!search || `${p.full_name} ${p.email}`.toLowerCase().includes(search.toLowerCase()))), [list.data, filter, search]);
  const pendingWa = (list.data ?? []).filter((p) => p.whatsapp_phone && !p.whatsapp_approved).length;

  const block = async (p: ProfileRow, blocked: boolean) => {
    try {
      await invokeFunction(EDGE_FUNCTIONS.adminUsers, { action: blocked ? "block" : "unblock", user_id: p.id });
      toast.success(blocked ? "Acesso bloqueado." : "Acesso reativado.");
      void list.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };
  const reset = async (p: ProfileRow) => {
    try {
      const r = await invokeFunction<{ temporary_password: string }>(EDGE_FUNCTIONS.adminUsers, { action: "reset_password", user_id: p.id });
      setSecret({ email: p.email ?? "", password: r.temporary_password });
    } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <>
      <PageHeader title="Colaboradores" description="Acessos, papéis e números de WhatsApp autorizados a usar o bot."
        actions={<Button onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> Novo acesso</Button>} />
      {pendingWa > 0 && <Alert tone="warning" className="mb-4">{pendingWa} número(s) de WhatsApp aguardando aprovação.</Alert>}
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-ink-100 p-4">
          <Input className="max-w-xs" placeholder="Buscar por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
          <Select className="w-48" value={filter} onChange={(e) => setFilter(e.target.value as Role | "")} aria-label="Papel">
            <option value="">Todos os papéis</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </div>
        {list.error ? <div className="p-4"><Alert tone="danger">{errorMessage(list.error)}</Alert></div> : !list.data ? <div className="p-6"><Spinner /></div> : (
          <Table head={["Nome", "Papel", "WhatsApp", "Situação", "Último acesso", ""]} empty={rows.length === 0 && <EmptyState title="Nenhum usuário" />}>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td><span className="font-medium">{p.full_name || "—"}</span><span className="block text-xs text-ink-500">{p.email}</span></Td>
                <Td><Badge tone={p.role === "admin" ? "brand" : p.role === "worker" ? "info" : "neutral"}>{ROLE_LABELS[p.role]}</Badge></Td>
                <Td className="text-xs">{p.whatsapp_phone ? <>{maskPhone(p.whatsapp_phone)} {p.whatsapp_approved ? <Badge tone="success">Aprovado</Badge> : <Badge tone="warning">Pendente</Badge>}</> : "—"}</Td>
                <Td>{p.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="danger">Bloqueado</Badge>}</Td>
                <Td className="text-xs text-ink-500">{timeAgo(p.last_seen_at)}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => reset(p)} aria-label="Gerar nova senha"><KeyRound className="h-3.5 w-3.5" /></Button>
                    {p.id !== me?.id && (p.active
                      ? <Button size="sm" variant="ghost" onClick={() => block(p, true)} aria-label="Bloquear"><Ban className="h-3.5 w-3.5 text-danger-600" /></Button>
                      : <Button size="sm" variant="ghost" onClick={() => block(p, false)} aria-label="Desbloquear"><CheckCircle2 className="h-3.5 w-3.5 text-success-600" /></Button>)}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {creating && <CreateUserDialog onClose={() => setCreating(false)} onCreated={(s) => { setCreating(false); if (s) setSecret(s); void list.reload(); }} />}
      {editing && <EditUserDialog profile={editing} onClose={() => { setEditing(null); void list.reload(); }} />}
      {secret && (
        <Dialog open onOpenChange={(o) => !o && setSecret(null)} title="Senha temporária" description="Exibida apenas uma vez. Entregue por canal seguro e peça para trocar no primeiro acesso.">
          <div className="flex flex-col gap-3">
            <p className="text-sm">Usuário: <b>{secret.email}</b></p>
            <div className="flex gap-2"><Input readOnly value={secret.password} aria-label="Senha temporária" className="font-mono" />
              <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(secret.password); toast.success("Copiada."); }}><Copy className="h-4 w-4" /></Button></div>
            <Alert tone="warning">Para a conta do worker, cole esta senha em WORKER_PASSWORD no arquivo .env do computador do Ollama.</Alert>
          </div>
        </Dialog>
      )}
    </>
  );
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (s: { email: string; password: string } | null) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("colaborador");
  const [mode, setMode] = useState<"password" | "invite">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await invokeFunction<{ temporary_password: string | null; email: string; linked_existing?: boolean }>(EDGE_FUNCTIONS.adminUsers, {
        action: "create", email, full_name: name, role, mode: role === "worker" ? "password" : mode, redirect_to: window.location.origin,
      });
      toast.success(r.linked_existing ? "Conta já existente vinculada — a pessoa entra com a senha atual." : "Acesso criado.");
      onCreated(r.temporary_password ? { email: r.email, password: r.temporary_password } : null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Novo acesso"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={busy}>Criar</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-mail *"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Papel">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
        {role === "worker" ? (
          <Alert tone="info" title="Conta de máquina">Use um e-mail exclusivo (ex.: worker@suacorretora.com.br). Ela só consegue processar a fila e indexar documentos — não acessa o painel.</Alert>
        ) : (
          <Field label="Forma de acesso">
            <Select value={mode} onChange={(e) => setMode(e.target.value as "password" | "invite")}>
              <option value="password">Gerar senha temporária</option>
              <option value="invite">Enviar convite por e-mail (requer e-mail configurado no Supabase)</option>
            </Select>
          </Field>
        )}
        <p className="flex items-center gap-1 text-xs text-ink-500"><ShieldCheck className="h-3.5 w-3.5" /> O cadastro público está desativado; somente administradores criam acessos.</p>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  );
}

function EditUserDialog({ profile, onClose }: { profile: ProfileRow; onClose: () => void }) {
  const [name, setName] = useState(profile.full_name);
  const [role, setRole] = useState<Role>(profile.role);
  const [phone, setPhone] = useState(profile.whatsapp_phone ?? "");
  const [approved, setApproved] = useState(profile.whatsapp_approved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const normalized = phone.trim() ? normalizePhoneBR(phone) : null;
    if (phone.trim() && !normalized) return setError("Telefone inválido. Use DDD + número, ex.: (11) 98765-4321.");
    if (approved && !normalized) return setError("Informe o número antes de aprovar.");
    setBusy(true);
    try {
      unwrap(await sb.from("profiles").update({ full_name: name.trim(), role, whatsapp_phone: normalized, whatsapp_approved: approved }).eq("id", profile.id).select("id"));
      toast.success("Usuário atualizado.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Editar acesso" description={profile.email ?? ""}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={busy}>Salvar</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Papel" hint="Administrador: tudo · Editor: base de conhecimento · Colaborador: consultas">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
        </Field>
        {role !== "worker" && <>
          <Field label="WhatsApp do colaborador" hint="Somente números aprovados conseguem usar o bot. Trocar o número exige nova aprovação.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" />
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> Número aprovado para usar o bot do WhatsApp</label>
        </>}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  );
}
