"use client";
import { CheckCircle2, FileText, MessageCircle, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { Progress } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { ANSWER_STATUSES, ANSWER_STATUS_LABELS, LGPD_FREE_TEXT_WARNING, MEETING_STATUSES, MEETING_STATUS_LABELS, type AnswerStatus } from "@/lib/domain/commercial";
import { meetingPendencies, type MeetingAction, type MeetingQuestion } from "@/lib/domain/meetings";
import { cn } from "@/lib/utils";
import { deleteMeetingAction, generateMeetingOutputsAction, saveMeetingAction } from "@/server/actions/meetings";

export interface MeetingFormValue {
  id?: string;
  title: string;
  opportunityId: string;
  companyId: string;
  quotationId: string;
  clientName: string;
  companyName: string;
  advisorName: string;
  salesRepName: string;
  ownerId: string;
  date: string;
  startTime: string;
  endTime: string;
  participants: string;
  location: string;
  objective: string;
  summary: string;
  status: string;
  questions: MeetingQuestion[];
  actions: MeetingAction[];
  addToAgenda: boolean;
}

export interface MeetingOptions {
  users: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  quotations: { id: string; label: string; companyId: string }[];
  opportunities: { id: string; name: string; companyId: string | null; contactName: string | null }[];
}

export interface SavedOutputs {
  minutes: string | null;
  followupMessage: string | null;
  generatedAt: string | null;
  followupTask: { id: string; title: string; status: string; dueDate: string | null } | null;
}

export function MeetingForm({ initial, options, outputs, canWrite }: { initial: MeetingFormValue; options: MeetingOptions; outputs: SavedOutputs | null; canWrite: boolean }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState<MeetingFormValue>(initial);
  const [newQ, setNewQ] = useState("");
  const set = <K extends keyof MeetingFormValue>(k: K, val: MeetingFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const setQ = (i: number, patch: Partial<MeetingQuestion>) => set("questions", v.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const setA = (i: number, patch: Partial<MeetingAction>) => set("actions", v.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const asked = v.questions.filter((q) => q.asked).length;
  const pend = useMemo(() => meetingPendencies(v), [v]);

  const save = async () => {
    const { id, ...rest } = v;
    const r = await run(() => saveMeetingAction(id ?? null, rest), { refresh: !!id });
    if (r.ok && !id) router.push(`/reunioes/${r.data}`);
    return r;
  };
  const generate = async (createTask: boolean) => {
    const saved = await save();
    if (!saved.ok || !v.id) return;
    await run(() => generateMeetingOutputsAction(v.id!, createTask));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dados da reunião</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Título" required error={fieldErrors.title} className="md:col-span-2">
            <Input value={v.title} onChange={(e) => set("title", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Oportunidade (CRM)">
            <Select
              value={v.opportunityId}
              disabled={!canWrite}
              onChange={(e) => {
                const o = options.opportunities.find((x) => x.id === e.target.value);
                setV((s) => ({ ...s, opportunityId: e.target.value, companyId: o?.companyId ?? s.companyId, companyName: s.companyName || o?.name || "", clientName: s.clientName || o?.contactName || "" }));
              }}
            >
              <option value="">—</option>
              {options.opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={v.status} onChange={(e) => set("status", e.target.value)} disabled={!canWrite}>
              {MEETING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MEETING_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nome do cliente (contato)" error={fieldErrors.clientName}>
            <Input value={v.clientName} onChange={(e) => set("clientName", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Empresa">
            <Input value={v.companyName} onChange={(e) => set("companyName", e.target.value)} disabled={!canWrite} list="mt-companies" />
          </Field>
          <datalist id="mt-companies">
            {options.companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <Field label="Empresa cadastrada">
            <Select
              value={v.companyId}
              disabled={!canWrite}
              onChange={(e) => {
                const c = options.companies.find((x) => x.id === e.target.value);
                setV((s) => ({ ...s, companyId: e.target.value, companyName: c?.name ?? s.companyName, quotationId: "" }));
              }}
            >
              <option value="">—</option>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cotação +99">
            <Select value={v.quotationId} onChange={(e) => set("quotationId", e.target.value)} disabled={!canWrite}>
              <option value="">—</option>
              {(v.companyId ? options.quotations.filter((q) => q.companyId === v.companyId) : options.quotations).map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assessor">
            <Input value={v.advisorName} onChange={(e) => set("advisorName", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Comercial">
            <Input value={v.salesRepName} onChange={(e) => set("salesRepName", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Responsável">
            <Select value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)} disabled={!canWrite}>
              <option value="">(eu)</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data" required error={fieldErrors.date}>
            <Input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Início" error={fieldErrors.startTime}>
            <Input type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Término" error={fieldErrors.endTime}>
            <Input type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} disabled={!canWrite} />
          </Field>
          <Field label="Link ou local" className="md:col-span-2">
            <Input value={v.location} onChange={(e) => set("location", e.target.value)} disabled={!canWrite} placeholder="https://meet… ou endereço" />
          </Field>
          <Field label="Participantes" className="md:col-span-2">
            <Input value={v.participants} onChange={(e) => set("participants", e.target.value)} disabled={!canWrite} placeholder="Ex.: Maria (RH), João (Financeiro)" />
          </Field>
          <Field label="Objetivo da reunião" className="md:col-span-4">
            <Textarea value={v.objective} onChange={(e) => set("objective", e.target.value)} rows={2} disabled={!canWrite} />
          </Field>
          <label className="flex items-center gap-2 text-sm md:col-span-4">
            <input type="checkbox" checked={v.addToAgenda} onChange={(e) => set("addToAgenda", e.target.checked)} disabled={!canWrite} /> Mostrar na agenda (com lembrete 30 min antes)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Roteiro de perguntas</CardTitle>
            <p className="text-xs text-muted">
              Marque o que foi perguntado, se a resposta veio ou ficou pendente, e anote. {asked}/{v.questions.length} perguntadas.
            </p>
          </div>
          <div className="w-32">
            <Progress value={v.questions.length ? (asked / v.questions.length) * 100 : 0} label="Perguntas feitas" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {v.questions.map((q, i) => (
            <div key={`${q.key}-${i}`} className={cn("rounded-md border p-2.5", q.status === "pendente" ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" : q.status === "recebida" ? "border-emerald-200" : "border-border")}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-60 flex-1 items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={q.asked} disabled={!canWrite} onChange={(e) => setQ(i, { asked: e.target.checked })} aria-label={`Pergunta feita: ${q.text}`} />
                  {q.text}
                </label>
                <div role="radiogroup" aria-label={`Resposta: ${q.text}`} className="inline-flex rounded-md border border-border bg-surface p-0.5">
                  {ANSWER_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      role="radio"
                      aria-checked={q.status === st}
                      disabled={!canWrite}
                      onClick={() => setQ(i, { status: st as AnswerStatus, asked: st === "nao_marcada" ? q.asked : true })}
                      className={cn("rounded px-2 py-0.5 text-[11px] font-medium", q.status === st ? (st === "recebida" ? "bg-emerald-600 text-white" : st === "pendente" ? "bg-amber-500 text-white" : "bg-surface-2") : "text-muted hover:bg-surface-2")}
                    >
                      {st === "nao_marcada" ? "—" : ANSWER_STATUS_LABELS[st as AnswerStatus]}
                    </button>
                  ))}
                </div>
                {canWrite && q.key.startsWith("q_") && (
                  <button type="button" className="text-muted hover:text-red-600" onClick={() => set("questions", v.questions.filter((_, j) => j !== i))} aria-label="Remover pergunta">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <Input value={q.answer} onChange={(e) => setQ(i, { answer: e.target.value })} placeholder="Resposta" disabled={!canWrite} aria-label={`Resposta para: ${q.text}`} />
                <Input value={q.note} onChange={(e) => setQ(i, { note: e.target.value })} placeholder="Observação" disabled={!canWrite} aria-label={`Observação para: ${q.text}`} />
              </div>
            </div>
          ))}
          {canWrite && (
            <div className="flex gap-2">
              <Input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Adicionar pergunta personalizada" onKeyDown={(e) => {
                if (e.key === "Enter" && newQ.trim()) {
                  e.preventDefault();
                  set("questions", [...v.questions, { key: `q_${Date.now()}`, text: newQ.trim(), asked: false, status: "nao_marcada", answer: "", note: "" }]);
                  setNewQ("");
                }
              }} />
              <Button type="button" variant="outline" onClick={() => {
                if (!newQ.trim()) return;
                set("questions", [...v.questions, { key: `q_${Date.now()}`, text: newQ.trim(), asked: false, status: "nao_marcada", answer: "", note: "" }]);
                setNewQ("");
              }}>
                <Plus /> Pergunta
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumo, próximos passos e responsáveis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Resumo da reunião" hint={LGPD_FREE_TEXT_WARNING}>
            <Textarea value={v.summary} onChange={(e) => set("summary", e.target.value)} rows={4} disabled={!canWrite} />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Próximos passos (ação · responsável · prazo)</p>
            <div className="space-y-2">
              {v.actions.map((a, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr] gap-2 md:grid-cols-[auto_2fr_1fr_auto_auto] md:items-center">
                  <input type="checkbox" checked={a.done} disabled={!canWrite} onChange={(e) => setA(i, { done: e.target.checked })} aria-label="Concluída" />
                  <Input value={a.text} onChange={(e) => setA(i, { text: e.target.value })} placeholder="Ação" disabled={!canWrite} />
                  <Input value={a.owner} onChange={(e) => setA(i, { owner: e.target.value })} placeholder="Responsável" disabled={!canWrite} className="col-start-2 md:col-start-auto" />
                  <Input type="date" value={a.dueDate ?? ""} onChange={(e) => setA(i, { dueDate: e.target.value || null })} disabled={!canWrite} className="col-start-2 md:col-start-auto" aria-label="Prazo" />
                  {canWrite && (
                    <button type="button" className="col-start-2 justify-self-start text-muted hover:text-red-600 md:col-start-auto" onClick={() => set("actions", v.actions.filter((_, j) => j !== i))} aria-label="Remover ação">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canWrite && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => set("actions", [...v.actions, { text: "", owner: "", dueDate: null, done: false }])}>
                <Plus /> Ação
              </Button>
            )}
          </div>
          {pend.length > 0 && (
            <div className="rounded-md bg-surface-2/60 p-3">
              <p className="mb-1 text-xs font-semibold">Pendências identificadas ({pend.length})</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {pend.slice(0, 12).map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {pend.length > 12 && <li>… e mais {pend.length - 12}</li>}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {canWrite && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          {v.id && (
            <ConfirmButton
              title="Excluir reunião?"
              description="Também remove o compromisso da agenda."
              triggerVariant="ghost"
              className="mr-auto"
              onConfirm={async () => {
                const r = await run(() => deleteMeetingAction(v.id!), { refresh: false });
                if (r.ok) router.push("/reunioes");
              }}
            >
              <Trash2 /> Excluir
            </ConfirmButton>
          )}
          <Button variant="outline" loading={pending} onClick={save}>
            <Save /> Salvar
          </Button>
          {v.id && (
            <>
              <Button variant="secondary" loading={pending} onClick={() => generate(false)}>
                <FileText /> Gerar ata
              </Button>
              <Button variant="success" loading={pending} onClick={() => generate(true)}>
                <CheckCircle2 /> Finalizar: ata + tarefa de retorno
              </Button>
            </>
          )}
          {!v.id && <span className="text-xs text-muted">Salve para gerar a ata, as pendências e a mensagem de follow-up.</span>}
        </div>
      )}

      {outputs?.minutes && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-1.5">
                  <FileText className="size-4" /> Ata resumida
                </CardTitle>
                {outputs.generatedAt && <p className="text-xs text-muted">Gerada em {outputs.generatedAt}</p>}
              </div>
              <CopyButton text={outputs.minutes} />
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-sm">{outputs.minutes}</pre>
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <MessageCircle className="size-4 text-emerald-600" /> Mensagem de follow-up (WhatsApp)
                </CardTitle>
                <div className="flex gap-1">
                  <CopyButton text={outputs.followupMessage ?? ""} />
                  <Button asChild size="sm" variant="outline">
                    <a href={`https://wa.me/?text=${encodeURIComponent(outputs.followupMessage ?? "")}`} target="_blank" rel="noopener noreferrer">
                      Abrir no WhatsApp
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{outputs.followupMessage}</p>
                <p className="mt-2 text-xs text-muted">Nada é enviado automaticamente — revise e envie pelo seu WhatsApp.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tarefa de retorno</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {outputs.followupTask ? (
                  <Link href={`/tarefas?id=${outputs.followupTask.id}`} className="flex items-center gap-2 text-primary hover:underline">
                    {outputs.followupTask.title}
                    {outputs.followupTask.dueDate && <Badge tone="sky">prazo {outputs.followupTask.dueDate.split("-").reverse().join("/")}</Badge>}
                  </Link>
                ) : (
                  <p className="text-muted">Nenhuma tarefa criada. Use “Finalizar: ata + tarefa de retorno”.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
