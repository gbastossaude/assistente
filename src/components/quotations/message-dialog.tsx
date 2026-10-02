"use client";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { generateMessageAction, logMessageSentAction } from "@/server/actions/quotations";

export interface TemplateOption {
  key: string;
  name: string;
  audience: string;
  channel: string;
}

/**
 * Gera e-mail/WhatsApp a partir das pendências reais. O sistema nunca envia automaticamente:
 * o usuário copia ou abre no próprio cliente de e-mail/WhatsApp.
 */
export function MessageDialog({
  open,
  onOpenChange,
  quotationId,
  templates,
  insurers = [],
  defaultTemplate,
  defaultInsurerId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quotationId: string;
  templates: TemplateOption[];
  insurers?: { id: string; name: string }[];
  defaultTemplate?: string;
  defaultInsurerId?: string;
}) {
  const { run, pending } = useAction();
  const [key, setKey] = useState(defaultTemplate ?? templates[0]?.key ?? "");
  const [qi, setQi] = useState(defaultInsurerId ?? "");
  const [msg, setMsg] = useState<{ subject: string; body: string; to: string; missing: string[]; channel: string } | null>(null);
  const tpl = templates.find((t) => t.key === key);

  // Reinicia só ao abrir: dados que chegam com o diálogo aberto não apagam o que o usuário digitou.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setKey(defaultTemplate ?? templates[0]?.key ?? "");
      setQi(defaultInsurerId ?? "");
      setMsg(null);
    }
    wasOpen.current = open;
  }, [open, defaultTemplate, defaultInsurerId, templates]);

  const generate = async () => {
    const r = await run(() => generateMessageAction({ quotationId, templateKey: key, quotationInsurerId: qi || null }), { success: false, refresh: false });
    if (r.ok) setMsg({ subject: r.data.subject ?? "", body: r.data.body, to: r.data.to ?? "", missing: r.data.missing, channel: r.data.channel });
  };
  const copy = async () => {
    if (!msg) return;
    await navigator.clipboard.writeText(msg.subject ? `Assunto: ${msg.subject}\n\n${msg.body}` : msg.body);
    toast.success("Mensagem copiada");
  };
  const mailto = msg ? `mailto:${encodeURIComponent(msg.to)}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}` : "#";
  const wa = msg ? `https://wa.me/${msg.to.replace(/\D/g, "")}?text=${encodeURIComponent(msg.body)}` : "#";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Gerar mensagem" description="Baseada exclusivamente nas pendências reais da cotação. Nada é enviado automaticamente." size="lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Modelo">
            <Select value={key} onChange={(e) => setKey(e.target.value)}>
              <optgroup label="Cliente">
                {templates
                  .filter((t) => t.audience === "cliente")
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Operadora">
                {templates
                  .filter((t) => t.audience === "operadora")
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            </Select>
          </Field>
          {tpl?.audience === "operadora" ? (
            <Field label="Operadora">
              <Select value={qi} onChange={(e) => setQi(e.target.value)}>
                <option value="">Selecione…</option>
                {insurers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div />
          )}
          <Button onClick={generate} loading={pending} disabled={!key || (tpl?.audience === "operadora" && !qi)}>
            Gerar
          </Button>
        </div>
        {msg && (
          <div className="mt-4 space-y-3">
            {msg.missing.length > 0 && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Dados ausentes no sistema (marcados como [informar …]): {msg.missing.join(", ")}. Complete antes de enviar.
              </p>
            )}
            <Field label={msg.channel === "whatsapp" ? "WhatsApp do destinatário" : "Para"}>
              <Input value={msg.to} onChange={(e) => setMsg({ ...msg, to: e.target.value })} />
            </Field>
            {msg.channel !== "whatsapp" && (
              <Field label="Assunto">
                <Input value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} />
              </Field>
            )}
            <Field label="Mensagem (editável)">
              <Textarea value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} rows={14} className="font-mono text-xs" />
            </Field>
          </div>
        )}
        <DialogFooter>
          {msg && (
            <>
              <Button variant="outline" onClick={copy}>
                <Copy /> Copiar
              </Button>
              {msg.channel === "whatsapp" ? (
                <Button asChild variant="success">
                  <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => run(() => logMessageSentAction({ quotationId, channel: "whatsapp", summary: tpl?.name ?? "" }), { success: false })}>
                    <MessageCircle /> Abrir no WhatsApp
                  </a>
                </Button>
              ) : (
                <Button asChild>
                  <a href={mailto} onClick={() => run(() => logMessageSentAction({ quotationId, channel: "email", summary: `${tpl?.name}: ${msg.subject}` }), { success: false })}>
                    <Mail /> Abrir no e-mail
                  </a>
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
