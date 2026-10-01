"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { deleteInsurerAction, saveInsurerAction } from "@/server/actions/insurers";

type F = { name: string; kind: string; ansCode: string; contactName: string; email: string; phone: string; followupDays: string; active: boolean; notes: string };

export function InsurerFormButton({ id, initial, canDelete }: { id?: string; initial?: Partial<F>; canDelete?: boolean }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<F>({ name: "", kind: "operadora", ansCode: "", contactName: "", email: "", phone: "", followupDays: "", active: true, notes: "", ...initial });
  return (
    <>
      <Button size="sm" variant={id ? "outline" : "default"} onClick={() => setOpen(true)}>
        {id ? (
          <>
            <Pencil /> Editar
          </>
        ) : (
          <>
            <Plus /> Nova operadora
          </>
        )}
      </Button>
      {id && canDelete && (
        <ConfirmButton
          title="Excluir operadora?"
          description="Exclusão lógica — o histórico de cotações é preservado."
          size="icon"
          onConfirm={async () => {
            const r = await run(() => deleteInsurerAction(id), { refresh: false });
            if (r.ok) router.push("/operadoras");
          }}
        >
          <Trash2 />
        </ConfirmButton>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={id ? "Editar operadora" : "Nova operadora/seguradora"}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome" required error={fieldErrors.name}>
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
                <option value="operadora">Operadora</option>
                <option value="seguradora">Seguradora</option>
              </Select>
            </Field>
            <Field label="Registro ANS">
              <Input value={v.ansCode} onChange={(e) => setV({ ...v, ansCode: e.target.value })} />
            </Field>
            <Field label="Prazo padrão de follow-up (dias)" error={fieldErrors.followupDays} hint="Vazio = regra geral">
              <Input inputMode="numeric" value={v.followupDays} onChange={(e) => setV({ ...v, followupDays: e.target.value })} />
            </Field>
            <Field label="Contato comercial">
              <Input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} />
            </Field>
            <Field label="E-mail" error={fieldErrors.email}>
              <Input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field label="Telefone">
              <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativa
            </label>
            <Field label="Observações" className="sm:col-span-2">
              <Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => saveInsurerAction(id ?? null, v));
                if (r.ok) setOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
