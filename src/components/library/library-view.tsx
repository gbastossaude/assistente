"use client";
import { Copy, Pencil, Plus, RotateCcw, Search, Trash2, Variable } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { ANSWER_TOPIC_LABELS, LIBRARY_VARIABLES, MESSAGE_CATEGORY_LABELS, MESSAGE_CHANNELS, MESSAGE_CHANNEL_LABELS, type LibraryKind, type MessageChannel } from "@/lib/domain/commercial";
import { extractVariables, fillVariables, normalizeSearch } from "@/lib/domain/library";
import { cn } from "@/lib/utils";
import { deleteLibraryItemAction, duplicateLibraryItemAction, restoreLibraryDefaultAction, saveLibraryItemAction } from "@/server/actions/library";

export interface LibraryItemView {
  id: string;
  kind: LibraryKind;
  category: string;
  title: string;
  channel: string;
  subject: string | null;
  body: string;
  active: boolean;
  sourceKey: string | null;
}

type Edit = { id?: string; kind: LibraryKind; category: string; title: string; channel: string; subject: string; body: string; active: boolean };

const VARS_KEY = "besmart:biblioteca:variaveis";

export function LibraryView({ kind, items, canWrite, consultant, initialQuery }: { kind: LibraryKind; items: LibraryItemView[]; canWrite: boolean; consultant: string; initialQuery?: string }) {
  const labels: Record<string, string> = kind === "mensagem" ? MESSAGE_CATEGORY_LABELS : ANSWER_TOPIC_LABELS;
  const { run, pending, fieldErrors } = useAction();
  const [q, setQ] = useState(initialQuery ?? "");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({ consultor: consultant });
  const [showVars, setShowVars] = useState(kind === "mensagem");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VARS_KEY);
      if (saved) setVars((v) => ({ ...v, ...JSON.parse(saved), consultor: (JSON.parse(saved).consultor as string) || consultant }));
    } catch {
      /* armazenamento indisponível: segue sem lembrar */
    }
  }, [consultant]);
  const setVar = (k: string, val: string) => {
    setVars((v) => {
      const next = { ...v, [k]: val };
      try {
        localStorage.setItem(VARS_KEY, JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    const terms = normalizeSearch(q).split(/\s+/).filter(Boolean);
    return items.filter((i) => (!cat || i.category === cat) && terms.every((t) => normalizeSearch(`${i.title} ${i.subject ?? ""} ${i.body} ${labels[i.category] ?? ""}`).includes(t)));
  }, [items, q, cat, labels]);
  const grouped = useMemo(() => {
    const m = new Map<string, LibraryItemView[]>();
    for (const i of filtered) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()].sort((a, b) => Object.keys(labels).indexOf(a[0]) - Object.keys(labels).indexOf(b[0]));
  }, [filtered, labels]);
  const usedVars = useMemo(() => extractVariables(...items.map((i) => `${i.subject ?? ""} ${i.body}`)), [items]);

  const render = (i: LibraryItemView) => {
    const body = fillVariables(i.body, vars);
    const subject = i.subject ? fillVariables(i.subject, vars) : null;
    return { text: subject ? `Assunto: ${subject.text}\n\n${body.text}` : body.text, missing: [...new Set([...(subject?.missing ?? []), ...body.missing])] };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "mensagem" ? "Buscar mensagem (ex.: objeção preço, documentos)" : "Buscar resposta (ex.: carência, portabilidade)"} className="pl-8" aria-label="Buscar" />
        </div>
        {kind === "mensagem" && (
          <Button variant={showVars ? "secondary" : "outline"} size="sm" onClick={() => setShowVars((s) => !s)}>
            <Variable /> Variáveis
          </Button>
        )}
        {canWrite && (
          <Button size="sm" onClick={() => setEdit({ kind, category: cat || Object.keys(labels)[0], title: "", channel: kind === "mensagem" ? "whatsapp" : "geral", subject: "", body: "", active: true })}>
            <Plus /> {kind === "mensagem" ? "Nova mensagem" : "Nova resposta"}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setCat("")} className={cn("rounded-full border px-3 py-1 text-xs", !cat ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:bg-surface-2")}>
          Todas ({items.length})
        </button>
        {Object.entries(labels).map(([k, l]) => {
          const n = items.filter((i) => i.category === k).length;
          if (!n) return null;
          return (
            <button key={k} type="button" onClick={() => setCat(k === cat ? "" : k)} className={cn("rounded-full border px-3 py-1 text-xs", cat === k ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:bg-surface-2")}>
              {l} ({n})
            </button>
          );
        })}
      </div>
      {showVars && kind === "mensagem" && (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted">Preencha uma vez: o botão Copiar substitui as variáveis {"{{…}}"} nas mensagens. Campos vazios ficam destacados para você completar. (Os valores ficam salvos só neste navegador.)</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              {usedVars.map((k) => (
                <Field key={k} label={LIBRARY_VARIABLES[k] ?? k}>
                  {k === "documentos" ? (
                    <Textarea value={vars[k] ?? ""} onChange={(e) => setVar(k, e.target.value)} rows={1} />
                  ) : (
                    <Input value={vars[k] ?? ""} onChange={(e) => setVar(k, e.target.value)} placeholder={k === "data" ? "dd/mm/aaaa" : k === "horario" ? "hh:mm" : ""} />
                  )}
                </Field>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {grouped.length === 0 && <EmptyState title="Nada encontrado" description="Ajuste a busca ou crie um novo item." />}
      {grouped.map(([category, list]) => (
        <section key={category}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{labels[category] ?? category}</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((i) => {
              const r = render(i);
              return (
                <Card key={i.id} className={cn(!i.active && "opacity-60")}>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{i.title}</p>
                      <div className="flex gap-1">
                        {kind === "mensagem" && <Badge tone={i.channel === "email" ? "indigo" : "emerald"}>{MESSAGE_CHANNEL_LABELS[i.channel as MessageChannel] ?? i.channel}</Badge>}
                        {!i.active && <Badge tone="zinc">inativa</Badge>}
                      </div>
                    </div>
                    {i.subject && <p className="text-xs text-muted">Assunto: {i.subject}</p>}
                    <p className="whitespace-pre-wrap text-sm">{kind === "mensagem" ? r.text.replace(/^Assunto: .*\n\n/, "") : i.body}</p>
                    {kind === "mensagem" && r.missing.length > 0 && <p className="text-[11px] text-amber-700 dark:text-amber-300">Preencher: {r.missing.map((m) => LIBRARY_VARIABLES[m] ?? m).join(", ")}</p>}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <CopyButton text={() => (kind === "mensagem" ? r.text : i.body)} label="Copiar" />
                      {kind === "mensagem" && i.channel === "whatsapp" && (
                        <Button asChild size="sm" variant="outline">
                          <a href={`https://wa.me/?text=${encodeURIComponent(r.text)}`} target="_blank" rel="noopener noreferrer">
                            WhatsApp
                          </a>
                        </Button>
                      )}
                      {canWrite && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEdit({ id: i.id, kind: i.kind, category: i.category, title: i.title, channel: i.channel, subject: i.subject ?? "", body: i.body, active: i.active })}>
                            <Pencil /> Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => run(() => duplicateLibraryItemAction(i.id))}>
                            <Copy /> Duplicar
                          </Button>
                          {i.sourceKey && (
                            <ConfirmButton title="Restaurar o texto original?" description="As alterações feitas neste item serão substituídas pelo texto padrão do sistema." variant="default" onConfirm={() => run(() => restoreLibraryDefaultAction(i.id))}>
                              <RotateCcw /> Original
                            </ConfirmButton>
                          )}
                          <ConfirmButton title="Excluir este item?" onConfirm={() => run(() => deleteLibraryItemAction(i.id))}>
                            <Trash2 />
                          </ConfirmButton>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Editar" : kind === "mensagem" ? "Nova mensagem" : "Nova resposta"} size="lg">
          {edit && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Título" required error={fieldErrors.title} className="md:col-span-2">
                <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} autoFocus />
              </Field>
              <Field label={kind === "mensagem" ? "Categoria" : "Tema"} error={fieldErrors.category}>
                <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                  {Object.entries(labels).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              {kind === "mensagem" && (
                <>
                  <Field label="Canal">
                    <Select value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value })}>
                      {MESSAGE_CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {MESSAGE_CHANNEL_LABELS[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Assunto (e-mail)" className="md:col-span-2">
                    <Input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
                  </Field>
                </>
              )}
              <Field
                label="Texto"
                required
                error={fieldErrors.body}
                className="md:col-span-3"
                hint={kind === "mensagem" ? `Variáveis: ${Object.keys(LIBRARY_VARIABLES).map((k) => `{{${k}}}`).join(" ")}` : "Inclua a ressalva de que as condições variam por operadora, contrato, região e análise."}
              >
                <Textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={8} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativa
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (!edit) return;
                const { id, ...rest } = edit;
                const r = await run(() => saveLibraryItemAction(id ?? null, rest));
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
