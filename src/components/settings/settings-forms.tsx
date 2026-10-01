"use client";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/domain/constants";
import { CHECKLIST_CATEGORIES, CHECKLIST_CATEGORY_LABELS } from "@/lib/domain/checklist-catalog";
import { PLACEHOLDERS } from "@/lib/domain/messages";
import type { AgeBand } from "@/lib/domain/age";
import type { AppSettings } from "@/lib/domain/settings-defaults";
import { formatDateTimeBR } from "@/lib/domain/dates";
import { runSweepAction, saveAgeBandsAction, saveChecklistTemplateAction, saveGeneralSettingsAction, saveRuleAction, saveTemplateAction, saveUserAction } from "@/server/actions/admin";

// ─── Usuários ───
export function UsersAdmin({ users, currentUserId }: { users: { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt: Date | null }[]; currentUserId: string }) {
  const { run, pending, fieldErrors } = useAction();
  const [edit, setEdit] = useState<{ id?: string; name: string; email: string; role: Role; active: boolean; password: string } | null>(null);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Usuários e papéis</CardTitle>
          <CardDescription>Administrador · Head · Analista · Comercial · Somente leitura. Comercial e leitura não veem dados de saúde.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEdit({ name: "", email: "", role: "analista", active: true, password: "" })}>
          <Plus /> Novo usuário
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/60 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Último acesso</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t border-border ${u.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-2">
                  {u.name} {u.id === currentUserId && <Badge tone="blue">você</Badge>} {!u.active && <Badge tone="zinc">inativo</Badge>}
                </td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-2 text-xs text-muted">{u.lastLoginAt ? formatDateTimeBR(u.lastLoginAt) : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit({ ...u, password: "" })}>
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Editar usuário" : "Novo usuário"}>
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome" required error={fieldErrors.name}>
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="E-mail" required error={fieldErrors.email}>
                <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
              <Field label="Papel">
                <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={edit.id ? "Nova senha (opcional)" : "Senha inicial"} error={fieldErrors.password} hint="Mínimo de 10 caracteres">
                <Input type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => saveUserAction(edit));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Parâmetros gerais + faixas ANS ───
export function GeneralSettingsForm({ settings }: { settings: AppSettings }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({
    copayMaxPct: String(settings.copay_max_pct),
    criticalDeadlineDays: String(settings.critical_deadline_days),
    weights: Object.fromEntries(Object.entries(settings.readiness_weights).map(([k, x]) => [k, String(x)])) as Record<string, string>,
    retention: Object.fromEntries(Object.entries(settings.retention).map(([k, x]) => [k, String(x)])) as Record<string, string>,
  });
  const [bands, setBands] = useState<{ label: string; min: string; max: string }[]>(settings.ans_age_bands.map((b: AgeBand) => ({ label: b.label, min: String(b.min), max: b.max === null ? "" : String(b.max) })));
  const W: Record<string, string> = { documentacao: "Documentação obrigatória", base_vidas: "Base de vidas válida", comercial: "Dados comerciais", casos_especiais: "Casos especiais tratados" };
  const R: Record<string, string> = { softDeletedDays: "Expurgo de arquivos excluídos (dias, 0 = nunca)", assistantHistoryDays: "Histórico do assistente (dias)", readNotificationsDays: "Notificações lidas (dias)" };
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Parâmetros de negócio</CardTitle>
            <CardDescription>Limite de coparticipação, criticidade, pesos do score de prontidão e retenção (LGPD).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Limite máximo de coparticipação (%)">
              <Input inputMode="decimal" value={v.copayMaxPct} onChange={(e) => setV({ ...v, copayMaxPct: e.target.value })} />
            </Field>
            <Field label="Prazo para processo crítico (dias até a data-alvo)">
              <Input inputMode="numeric" value={v.criticalDeadlineDays} onChange={(e) => setV({ ...v, criticalDeadlineDays: e.target.value })} />
            </Field>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Pesos do score de prontidão</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.keys(v.weights).map((k) => (
                <Field key={k} label={W[k] ?? k}>
                  <Input inputMode="numeric" value={v.weights[k]} onChange={(e) => setV({ ...v, weights: { ...v.weights, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Política de retenção</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Object.keys(v.retention).map((k) => (
                <Field key={k} label={R[k] ?? k}>
                  <Input inputMode="numeric" value={v.retention[k]} onChange={(e) => setV({ ...v, retention: { ...v.retention, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button loading={pending} onClick={() => run(() => saveGeneralSettingsAction(v))}>
              Salvar parâmetros
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Faixas etárias (ANS)</CardTitle>
            <CardDescription>Usadas para calcular a faixa na importação da base. Contíguas, começando em 0 e com a última aberta.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {bands.map((b, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-2">
              <Field label={i === 0 ? "Rótulo" : ""}>
                <Input value={b.label} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              </Field>
              <Field label={i === 0 ? "De" : ""}>
                <Input inputMode="numeric" value={b.min} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
              </Field>
              <Field label={i === 0 ? "Até (vazio = aberta)" : ""}>
                <Input inputMode="numeric" value={b.max} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))} />
              </Field>
              <Button variant="ghost" size="icon" aria-label="Remover faixa" onClick={() => setBands(bands.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setBands([...bands, { label: "", min: "", max: "" }])}>
              <Plus /> Faixa
            </Button>
            <Button loading={pending} onClick={() => run(() => saveAgeBandsAction(bands.map((b) => ({ label: b.label, min: b.min, max: b.max === "" ? null : b.max }))))}>
              Salvar faixas
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Automações ───
export function RulesAdmin({ rules, lastSweep }: { rules: { key: string; name: string; description: string; params: Record<string, number>; paramLabels?: Record<string, string>; config: { enabled: boolean; params: Record<string, number> } }[]; lastSweep: string | null }) {
  const { run, pending } = useAction();
  const [state, setState] = useState(() => Object.fromEntries(rules.map((r) => [r.key, { enabled: r.config.enabled, params: Object.fromEntries(Object.entries(r.config.params).map(([k, v]) => [k, String(v)])) }])));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Motor de automações</CardTitle>
          <CardDescription>Última rotina: {lastSweep ? formatDateTimeBR(lastSweep) : "nunca"}. Agende POST /api/cron/sweep (diário/horário) ou rode manualmente.</CardDescription>
        </div>
        <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => runSweepAction())}>
          <Play /> Executar rotina agora
        </Button>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {rules.map((r) => {
          const s = state[r.key];
          return (
            <div key={r.key} className="flex flex-wrap items-end gap-3 px-4 py-3">
              <label className="flex min-w-64 flex-1 items-start gap-2">
                <input type="checkbox" className="mt-1" checked={s.enabled} onChange={(e) => setState({ ...state, [r.key]: { ...s, enabled: e.target.checked } })} />
                <span>
                  <span className="block text-sm font-medium">{r.name}</span>
                  <span className="block text-xs text-muted">{r.description}</span>
                </span>
              </label>
              {Object.keys(r.params).map((p) => (
                <Field key={p} label={r.paramLabels?.[p] ?? p} className="w-44">
                  <Input inputMode="numeric" value={s.params[p] ?? ""} onChange={(e) => setState({ ...state, [r.key]: { ...s, params: { ...s.params, [p]: e.target.value } } })} />
                </Field>
              ))}
              <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => saveRuleAction(r.key, s.enabled, Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, Number(v)]))))}>
                Salvar
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Templates de mensagens ───
export function TemplatesAdmin({ templates }: { templates: { id: string; key: string; name: string; audience: string; channel: string; subject: string | null; body: string; active: boolean }[] }) {
  const { run, pending, fieldErrors } = useAction();
  const [edit, setEdit] = useState<(typeof templates)[number] | null>(null);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Templates de mensagens</CardTitle>
          <CardDescription>Placeholders disponíveis: {Object.keys(PLACEHOLDERS).map((k) => `{{${k}}}`).join(" ")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2">
            <span className="flex-1 text-sm">
              {t.name} {!t.active && <Badge tone="zinc">inativo</Badge>}
            </span>
            <Badge tone={t.audience === "cliente" ? "blue" : "violet"}>{t.audience}</Badge>
            <Badge tone="slate">{t.channel}</Badge>
            <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit(t)}>
              <Pencil />
            </Button>
          </div>
        ))}
      </CardContent>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title="Editar template" size="lg">
          {edit && (
            <div className="space-y-3">
              <Field label="Nome" error={fieldErrors.name}>
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              {edit.channel === "email" && (
                <Field label="Assunto">
                  <Input value={edit.subject ?? ""} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
                </Field>
              )}
              <Field label="Corpo" error={fieldErrors.body}>
                <Textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={12} className="font-mono text-xs" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => saveTemplateAction(edit));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Modelos de checklist ───
type CT = { id: string; processType: "NEW" | "RENEW"; itemKey: string; label: string; category: string; required: boolean; condition: string; autoSource: string | null; documentType: string | null; requestText: string | null; sortOrder: number; active: boolean };
export function ChecklistTemplatesAdmin({ items }: { items: CT[] }) {
  const { run, pending, fieldErrors } = useAction();
  const [type, setType] = useState<"NEW" | "RENEW">("NEW");
  const [edit, setEdit] = useState<Partial<CT> | null>(null);
  const list = items.filter((i) => i.processType === type);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Modelos de checklist</CardTitle>
          <CardDescription>Obrigatoriedade configurável separadamente para NEW e RENEW. Alterações valem para novas cotações; nas existentes use “Reaplicar modelo”.</CardDescription>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(["NEW", "RENEW"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={`rounded px-3 py-1 ${type === t ? "bg-primary text-white" : "text-muted"}`}>
                {t}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setEdit({ processType: type, required: true, active: true, condition: "always", category: "documentos", sortOrder: (list.at(-1)?.sortOrder ?? 0) + 10 })}>
            <Plus /> Item
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/60 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Condição</th>
              <th className="px-4 py-2">Fonte automática</th>
              <th className="px-4 py-2">Obrigatório</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} className={`border-t border-border ${i.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-1.5">{i.label}</td>
                <td className="px-4 py-1.5 text-xs">{CHECKLIST_CATEGORY_LABELS[i.category as keyof typeof CHECKLIST_CATEGORY_LABELS] ?? i.category}</td>
                <td className="px-4 py-1.5 font-mono text-[11px] text-muted">{i.condition}</td>
                <td className="px-4 py-1.5 font-mono text-[11px] text-muted">{i.autoSource ?? "manual"}</td>
                <td className="px-4 py-1.5">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={i.required} onChange={(e) => run(() => saveChecklistTemplateAction({ ...i, required: e.target.checked }))} /> {i.required ? "Sim" : "Não"}
                  </label>
                </td>
                <td className="px-4 py-1.5 text-right">
                  <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit(i)}>
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Editar item do modelo" : `Novo item — ${type}`} size="lg">
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Rótulo" required error={fieldErrors.label} className="sm:col-span-2">
                <Input value={edit.label ?? ""} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
              </Field>
              <Field label="Chave" required error={fieldErrors.itemKey} hint="letras minúsculas, números e _">
                <Input value={edit.itemKey ?? ""} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, itemKey: e.target.value })} />
              </Field>
              <Field label="Categoria">
                <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {CHECKLIST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CHECKLIST_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Condição" hint="always · special:<tipo> · modality:opcional">
                <Input value={edit.condition ?? "always"} onChange={(e) => setEdit({ ...edit, condition: e.target.value })} />
              </Field>
              <Field label="Fonte automática" hint="doc:<tipo> · field:<campo> · lives · special:<tipo> (vazio = manual)">
                <Input value={edit.autoSource ?? ""} onChange={(e) => setEdit({ ...edit, autoSource: e.target.value })} />
              </Field>
              <Field label="Tipo de documento relacionado">
                <Input value={edit.documentType ?? ""} onChange={(e) => setEdit({ ...edit, documentType: e.target.value })} />
              </Field>
              <Field label="Ordem">
                <Input inputMode="numeric" value={String(edit.sortOrder ?? 0)} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} />
              </Field>
              <Field label="Texto do pedido ao cliente" className="sm:col-span-2">
                <Textarea value={edit.requestText ?? ""} onChange={(e) => setEdit({ ...edit, requestText: e.target.value })} rows={2} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!edit.required} onChange={(e) => setEdit({ ...edit, required: e.target.checked })} /> Obrigatório
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => saveChecklistTemplateAction({ ...edit, processType: edit?.processType ?? type }));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
