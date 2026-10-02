"use client";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, CHANNELS, CHANNEL_LABELS, PRODUCTS, PRODUCT_LABELS } from "@/lib/domain/commercial";
import { todayISO } from "@/lib/domain/dates";
import { saveCampaignAction } from "@/server/actions/campaigns";

export interface CampaignFormValue {
  id?: string;
  name: string;
  product: string;
  startDate: string;
  endDate: string;
  audience: string;
  goal: string;
  goalLeads: string;
  goalSales: string;
  goalValue: string;
  mainMessage: string;
  channels: string[];
  ownerId: string;
  responsibles: string;
  status: string;
  remindersEnabled: boolean;
  results: string;
}

export function blankCampaign(): CampaignFormValue {
  const t = todayISO();
  const [y, m] = t.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { name: "", product: "plano_saude", startDate: `${t.slice(0, 7)}-01`, endDate: end, audience: "", goal: "", goalLeads: "", goalSales: "", goalValue: "", mainMessage: "", channels: ["whatsapp"], ownerId: "", responsibles: "", status: "planejada", remindersEnabled: true, results: "" };
}

export function CampaignDialog({ value, users, trigger }: { value?: CampaignFormValue; users: { id: string; name: string }[]; trigger: "new" | "edit" }) {
  const { run, pending, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<CampaignFormValue>(value ?? blankCampaign());
  // Reinicia só ao abrir: dados que chegam com o diálogo aberto não apagam o que o usuário digitou.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setV(value ?? blankCampaign());
    wasOpen.current = open;
  }, [open, value]);
  const set = <K extends keyof CampaignFormValue>(k: K, val: CampaignFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  return (
    <>
      {trigger === "new" ? (
        <Button onClick={() => setOpen(true)}>
          <Plus /> Nova campanha
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Editar
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={v.id ? "Editar campanha" : "Nova campanha"} size="lg">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Nome da campanha" required error={fieldErrors.name} className="md:col-span-2">
              <Input value={v.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </Field>
            <Field label="Produto">
              <Select value={v.product} onChange={(e) => set("product", e.target.value)}>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {PRODUCT_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={v.status} onChange={(e) => set("status", e.target.value)}>
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CAMPAIGN_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Início" required error={fieldErrors.startDate}>
              <Input type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label="Fim" required error={fieldErrors.endDate}>
              <Input type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </Field>
            <Field label="Responsável">
              <Select value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                <option value="">(eu)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Outros responsáveis">
              <Input value={v.responsibles} onChange={(e) => set("responsibles", e.target.value)} placeholder="Nomes" />
            </Field>
            <Field label="Público-alvo" className="md:col-span-4">
              <Input value={v.audience} onChange={(e) => set("audience", e.target.value)} />
            </Field>
            <Field label="Meta (descrição)" className="md:col-span-4">
              <Input value={v.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Ex.: 20 reuniões de diagnóstico e 4 contratos" />
            </Field>
            <Field label="Meta de leads" error={fieldErrors.goalLeads}>
              <Input value={v.goalLeads} onChange={(e) => set("goalLeads", e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Meta de vendas" error={fieldErrors.goalSales}>
              <Input value={v.goalSales} onChange={(e) => set("goalSales", e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Meta de valor (R$/mês)" error={fieldErrors.goalValue}>
              <Input value={v.goalValue} onChange={(e) => set("goalValue", e.target.value)} inputMode="decimal" />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={v.remindersEnabled} onChange={(e) => set("remindersEnabled", e.target.checked)} /> Lembretes automáticos
            </label>
            <div className="md:col-span-4">
              <p className="mb-1 text-xs font-medium text-muted">Canais de divulgação</p>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <label key={c} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
                    <input type="checkbox" checked={v.channels.includes(c)} onChange={(e) => set("channels", e.target.checked ? [...v.channels, c] : v.channels.filter((x) => x !== c))} />
                    {CHANNEL_LABELS[c]}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Mensagem principal" className="md:col-span-4">
              <Textarea value={v.mainMessage} onChange={(e) => set("mainMessage", e.target.value)} rows={3} />
            </Field>
            <Field label="Resultados" className="md:col-span-4" hint="Preencha ao longo e no encerramento da campanha">
              <Textarea value={v.results} onChange={(e) => set("results", e.target.value)} rows={2} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                const { id, ...rest } = v;
                const r = await run(() => saveCampaignAction(id ?? null, rest));
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
