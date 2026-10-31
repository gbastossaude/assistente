import { Headset, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CHANNEL_LABELS, type Channel } from "@especialista/shared";
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Select, Spinner, Textarea, errorMessage, formatDateTime } from "@especialista/ui";
import { PageHeader, Table, Td } from "../components/layout.tsx";
import { useAuth } from "../lib/auth.tsx";
import { invokeFunction, sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

type Handoff = {
  id: string; channel: Channel; status: "aberto" | "em_atendimento" | "resolvido"; note: string | null; resolution_note: string | null; created_at: string;
  profile: { full_name: string; email: string } | null; question: { text_redacted: string } | null; assignee: { full_name: string } | null;
};
const TONE = { aberto: "warning", em_atendimento: "info", resolvido: "success" } as const;
const LABEL = { aberto: "Aberto", em_atendimento: "Em atendimento", resolvido: "Resolvido" } as const;

export function HandoffsPage() {
  const [status, setStatus] = useState("pendentes");
  const [open, setOpen] = useState<Handoff | null>(null);
  const list = useData(async () => {
    let q = sb.from("handoff_requests")
      .select("id, channel, status, note, resolution_note, created_at, profile:profiles!handoff_requests_profile_id_fkey(full_name, email), question:questions(text_redacted), assignee:profiles!handoff_requests_assigned_to_fkey(full_name)")
      .order("created_at", { ascending: false }).limit(200);
    if (status === "pendentes") q = q.neq("status", "resolvido");
    else if (status) q = q.eq("status", status);
    return unwrap(await q) as unknown as Handoff[];
  }, [status]);

  return (
    <>
      <PageHeader title="Atendimento humano" description='Pedidos de "Falar com responsável" feitos pela extensão ou pelo WhatsApp.' />
      <Card>
        <div className="flex gap-2 border-b border-ink-100 p-4">
          <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
            <option value="pendentes">Pendentes</option><option value="aberto">Abertos</option><option value="em_atendimento">Em atendimento</option><option value="resolvido">Resolvidos</option><option value="">Todos</option>
          </Select>
        </div>
        {list.error ? <div className="p-4"><Alert tone="danger">{errorMessage(list.error)}</Alert></div> : !list.data ? <div className="p-6"><Spinner /></div> : (
          <Table head={["Data", "Colaborador", "Canal", "Contexto", "Situação", ""]} empty={list.data.length === 0 && <EmptyState icon={<Headset className="h-5 w-5" />} title="Nenhum pedido pendente" />}>
            {list.data.map((h) => (
              <tr key={h.id}>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(h.created_at)}</Td>
                <Td><span className="font-medium">{h.profile?.full_name ?? "—"}</span><span className="block text-xs text-ink-500">{h.profile?.email}</span></Td>
                <Td><Badge tone={h.channel === "whatsapp" ? "success" : "info"}>{h.channel === "whatsapp" && <MessageCircle className="h-3 w-3" />}{CHANNEL_LABELS[h.channel]}</Badge></Td>
                <Td className="max-w-sm text-xs">{h.question?.text_redacted ?? h.note ?? "—"}</Td>
                <Td><Badge tone={TONE[h.status]}>{LABEL[h.status]}</Badge>{h.assignee && <span className="block text-[11px] text-ink-500">{h.assignee.full_name}</span>}</Td>
                <Td><Button size="sm" variant="outline" onClick={() => setOpen(h)}>Atender</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {open && <HandoffDialog h={open} onClose={() => { setOpen(null); void list.reload(); }} />}
    </>
  );
}

function HandoffDialog({ h, onClose }: { h: Handoff; onClose: () => void }) {
  const { profile } = useAuth();
  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState(h.resolution_note ?? "");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await invokeFunction<{ status: string; error?: string }>("whatsapp-send", { handoff_id: h.id, text: reply });
      if (r.status === "enviada") { toast.success("Mensagem enviada pelo WhatsApp oficial."); setReply(""); }
      else toast.error(`Não enviada: ${r.status}${r.error ? ` (${r.error})` : ""}. Se a janela de 24 h expirou, contate o colaborador por outro canal.`);
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const update = async (status: Handoff["status"]) => {
    setBusy(true);
    try {
      unwrap(await sb.from("handoff_requests").update({ status, assigned_to: profile?.id, resolution_note: resolution || null, resolved_at: status === "resolvido" ? new Date().toISOString() : null }).eq("id", h.id).select("id"));
      toast.success("Atendimento atualizado.");
      onClose();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Atendimento humano" description={`${h.profile?.full_name ?? ""} · ${CHANNEL_LABELS[h.channel]} · ${formatDateTime(h.created_at)}`}
      footer={<>
        {h.status === "aberto" && <Button variant="outline" onClick={() => update("em_atendimento")} loading={busy}>Assumir</Button>}
        <Button onClick={() => update("resolvido")} loading={busy}>Marcar como resolvido</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {h.question && <div className="rounded-lg bg-ink-50 p-3 text-sm"><p className="text-[11px] font-medium uppercase text-ink-500">Última pergunta</p>{h.question.text_redacted}</div>}
        {h.note && <p className="text-sm">Observação: {h.note}</p>}
        {h.channel === "whatsapp" ? (
          <div className="flex flex-col gap-2">
            <Field label="Responder pelo WhatsApp oficial" hint="Envio permitido apenas dentro da janela de 24 h da última mensagem do colaborador; conta no teto mensal.">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={3800} />
            </Field>
            <Button className="self-end" onClick={send} loading={busy} disabled={!reply.trim()}><Send className="h-4 w-4" /> Enviar</Button>
          </div>
        ) : (
          <Alert tone="info">Pedido feito pela extensão: contate {h.profile?.full_name} pelo canal interno (e-mail: {h.profile?.email}).</Alert>
        )}
        <Field label="Anotação da resolução (opcional)"><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} className="min-h-[60px]" maxLength={1000} /></Field>
      </div>
    </Dialog>
  );
}
