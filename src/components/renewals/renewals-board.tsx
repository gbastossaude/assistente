"use client";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { RenewalStatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/use-action";
import { RENEWAL_STATUSES, RENEWAL_STATUS_LABELS, type RenewalStatus } from "@/lib/domain/constants";
import { formatDateBR, relativeDays, todayISO } from "@/lib/domain/dates";
import { RENEWAL_WINDOW_LABELS, renewalWindow, type RenewalWindow } from "@/lib/domain/renewals";
import { cn, formatNumber, formatPct } from "@/lib/utils";
import { deleteRenewalAction, saveRenewalAction } from "@/server/actions/renewals";

export interface RenewalView {
  id: string;
  companyId: string;
  companyName: string;
  insurerId: string | null;
  insurerName: string | null;
  lives: number | null;
  anniversaryDate: string;
  recommendedStartDate: string | null;
  adjustmentReceivedPct: number | null;
  lossRatioPct: number | null;
  status: RenewalStatus;
  ownerId: string | null;
  ownerName: string | null;
  quotationId: string | null;
  quotationCode: string | null;
  notes: string | null;
  contractId: string | null;
}

type Form = Record<string, string>;
const toForm = (r?: Partial<RenewalView>): Form => ({
  companyId: r?.companyId ?? "",
  contractId: r?.contractId ?? "",
  insurerId: r?.insurerId ?? "",
  insurerName: r?.insurerName ?? "",
  lives: r?.lives?.toString() ?? "",
  anniversaryDate: r?.anniversaryDate ?? "",
  adjustmentReceivedPct: r?.adjustmentReceivedPct?.toString() ?? "",
  lossRatioPct: r?.lossRatioPct?.toString() ?? "",
  status: r?.status ?? "a_iniciar",
  ownerId: r?.ownerId ?? "",
  quotationId: r?.quotationId ?? "",
  notes: r?.notes ?? "",
});

export function RenewalsBoard({
  rows,
  suggestions,
  companies,
  insurers,
  users,
  quotations,
  canWrite,
  openId,
  initialWindow,
  newFor,
}: {
  rows: RenewalView[];
  suggestions: { companyId: string; companyName: string; contractId: string; insurerId: string | null; insurerName: string | null; next: string; lives: number | null }[];
  companies: { id: string; name: string }[];
  insurers: { id: string; name: string }[];
  users: { id: string; name: string }[];
  quotations: { id: string; label: string; companyId: string }[];
  canWrite: boolean;
  openId?: string | null;
  initialWindow?: string | null;
  newFor?: string | null;
}) {
  const { run, pending, fieldErrors } = useAction();
  const today = todayISO();
  const [win, setWin] = useState<RenewalWindow | "todas">((initialWindow as RenewalWindow) ?? "todas");
  const [edit, setEdit] = useState<{ id?: string; f: Form } | null>(null);
  useEffect(() => {
    const r = openId ? rows.find((x) => x.id === openId) : null;
    if (r) setEdit({ id: r.id, f: toForm(r) });
    else if (newFor && canWrite) setEdit({ f: toForm({ companyId: newFor }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, newFor]);
  const withWin = rows.map((r) => ({ ...r, win: renewalWindow(r.anniversaryDate, today) }));
  const counts = (w: RenewalWindow) => withWin.filter((r) => r.win === w).length;
  const visible = withWin.filter((r) => win === "todas" || r.win === win);
  const set = (k: string, v: string) => setEdit((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(["todas", "vencida", "30", "60", "90", "120", "futura"] as const).map((w) => (
            <button key={w} type="button" onClick={() => setWin(w)} className={cn("rounded-full border px-3 py-1 text-xs", win === w ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:bg-surface-2")}>
              {w === "todas" ? `Todas (${rows.length})` : `${RENEWAL_WINDOW_LABELS[w]} (${counts(w)})`}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setEdit({ f: toForm() })}>
            <Plus /> Nova renovação
          </Button>
        )}
      </div>

      {canWrite && suggestions.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-blue-900 dark:text-blue-100">
            <Sparkles className="size-4" /> Contratos com aniversário nos próximos 150 dias sem renovação cadastrada
          </p>
          <ul className="space-y-1 text-sm">
            {suggestions.map((s) => (
              <li key={s.contractId} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  {s.companyName} — {s.insurerName ?? "operadora"} · aniversário {formatDateBR(s.next)} ({relativeDays(s.next, today)})
                </span>
                <Button size="sm" variant="outline" onClick={() => setEdit({ f: toForm({ companyId: s.companyId, contractId: s.contractId, insurerId: s.insurerId, insurerName: s.insurerName, anniversaryDate: s.next, lives: s.lives }) })}>
                  Cadastrar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState title="Nenhuma renovação nesta janela" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Operadora atual</th>
                <th className="px-3 py-2 text-right">Vidas</th>
                <th className="px-3 py-2">Aniversário</th>
                <th className="px-3 py-2">Início recomendado</th>
                <th className="px-3 py-2 text-right">Reajuste</th>
                <th className="px-3 py-2 text-right">Sinistralidade</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={cn("border-t border-border", r.id === openId && "bg-amber-50/50 dark:bg-amber-950/30")}>
                  <td className="px-3 py-2">
                    <Link className="font-medium hover:underline" href={`/empresas/${r.companyId}`}>
                      {r.companyName}
                    </Link>
                    {r.quotationCode && (
                      <Link className="block text-xs text-primary hover:underline" href={`/cotacoes/${r.quotationId}`}>
                        {r.quotationCode}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.insurerName ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.lives)}</td>
                  <td className={cn("whitespace-nowrap px-3 py-2", (r.win === "30" || r.win === "vencida") && "font-medium text-red-700")}>
                    {formatDateBR(r.anniversaryDate)} <span className="block text-xs text-muted">{relativeDays(r.anniversaryDate, today)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDateBR(r.recommendedStartDate)}</td>
                  <td className="px-3 py-2 text-right">{formatPct(r.adjustmentReceivedPct)}</td>
                  <td className="px-3 py-2 text-right">{formatPct(r.lossRatioPct)}</td>
                  <td className="px-3 py-2">
                    <RenewalStatusBadge value={r.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">{r.ownerName ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {canWrite && (
                      <>
                        <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit({ id: r.id, f: toForm(r) })}>
                          <Pencil />
                        </Button>
                        <ConfirmButton title="Excluir renovação?" description="As tarefas automáticas abertas serão canceladas." onConfirm={() => run(() => deleteRenewalAction(r.id))} size="icon-sm">
                          <Trash2 />
                        </ConfirmButton>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Editar renovação" : "Nova renovação"} description="Ao salvar, o sistema programa tarefas 120/90/60/30 dias antes (prazos configuráveis)." size="lg">
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Empresa" required error={fieldErrors.companyId} className="sm:col-span-2">
                <Select value={edit.f.companyId} onChange={(e) => set("companyId", e.target.value)}>
                  <option value="">Selecione…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data de aniversário" required error={fieldErrors.anniversaryDate}>
                <Input type="date" value={edit.f.anniversaryDate} onChange={(e) => set("anniversaryDate", e.target.value)} />
              </Field>
              <Field label="Operadora atual">
                <Select value={edit.f.insurerId} onChange={(e) => set("insurerId", e.target.value)}>
                  <option value="">Outra</option>
                  {insurers.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {!edit.f.insurerId && (
                <Field label="Nome da operadora">
                  <Input value={edit.f.insurerName} onChange={(e) => set("insurerName", e.target.value)} />
                </Field>
              )}
              <Field label="Número de vidas" error={fieldErrors.lives}>
                <Input inputMode="numeric" value={edit.f.lives} onChange={(e) => set("lives", e.target.value)} />
              </Field>
              <Field label="Reajuste recebido (%)" error={fieldErrors.adjustmentReceivedPct}>
                <Input inputMode="decimal" value={edit.f.adjustmentReceivedPct} onChange={(e) => set("adjustmentReceivedPct", e.target.value)} />
              </Field>
              <Field label="Sinistralidade (%)" error={fieldErrors.lossRatioPct}>
                <Input inputMode="decimal" value={edit.f.lossRatioPct} onChange={(e) => set("lossRatioPct", e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={edit.f.status} onChange={(e) => set("status", e.target.value)}>
                  {RENEWAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {RENEWAL_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsável">
                <Select value={edit.f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
                  <option value="">(eu)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cotação vinculada">
                <Select value={edit.f.quotationId} onChange={(e) => set("quotationId", e.target.value)}>
                  <option value="">—</option>
                  {quotations
                    .filter((q) => !edit.f.companyId || q.companyId === edit.f.companyId)
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.label}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Observações" className="sm:col-span-3">
                <Textarea value={edit.f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                if (!edit) return;
                const r = await run(() => saveRenewalAction(edit.id ?? null, edit.f));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
