"use client";
import { Check, Copy, Pencil, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { PLAYBOOK_GROUPS, PLAYBOOK_SECTIONS, type PlaybookKind } from "@/lib/playbook/content";
import { searchPlaybook } from "@/lib/playbook/search";
import { cn } from "@/lib/utils";
import { restorePlaybookEntryAction, savePlaybookEntryAction } from "@/server/actions/playbook";

export interface PlaybookItem {
  id: string | null;
  section: string;
  key: string;
  title: string;
  subtitle: string | null;
  objective: string | null;
  kind: PlaybookKind;
  body: string;
  active: boolean;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência");
  } catch {
    toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
  }
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <li className="group flex items-start gap-2 rounded-md border border-border bg-surface-2/50 px-3 py-2 text-sm">
      <span className="flex-1 whitespace-pre-line">{text}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copiar frase"
        title="Copiar frase"
        onClick={async () => {
          await copyText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
    </li>
  );
}

function EntryCard({ e, canEdit, onEdit, showSection }: { e: PlaybookItem; canEdit: boolean; onEdit: (e: PlaybookItem) => void; showSection?: boolean }) {
  const lines = e.kind === "roteiro" ? e.body.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  return (
    <Card className={cn(!e.active && "opacity-60")} data-testid="playbook-entry">
      <CardHeader>
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {e.title}
            {showSection && <Badge tone="blue">{PLAYBOOK_SECTIONS[e.section]?.title ?? e.section}</Badge>}
            {!e.active && <Badge tone="zinc">Oculto</Badge>}
          </CardTitle>
          {e.subtitle && <CardDescription>{e.subtitle}</CardDescription>}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Copiar ${e.title}`} title="Copiar tudo" onClick={() => copyText(`${e.title}\n\n${e.body}`)}>
            <Copy />
          </Button>
          {canEdit && e.id && (
            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${e.title}`} title="Editar" onClick={() => onEdit(e)}>
              <Pencil />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {e.objective && (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100">
            <strong>Objetivo:</strong> {e.objective}
          </p>
        )}
        {e.kind === "roteiro" ? (
          <ul className="space-y-1.5">
            {lines.map((l, i) => (
              <CopyLine key={i} text={l} />
            ))}
          </ul>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed">{e.body}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PlaybookView({ entries, canEdit, initialSection }: { entries: PlaybookItem[]; canEdit: boolean; initialSection?: string }) {
  const [section, setSection] = useState(initialSection && PLAYBOOK_SECTIONS[initialSection] ? initialSection : "pj99");
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<PlaybookItem | null>(null);
  const { run, pending, fieldErrors } = useAction();

  const results = useMemo(() => (query.trim().length >= 2 ? searchPlaybook(entries, query, 12) : null), [entries, query]);
  const current = entries.filter((e) => e.section === section);
  const meta = PLAYBOOK_SECTIONS[section];

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input aria-label="Buscar no playbook" placeholder="Buscar (ex.: carência, objeção, coparticipação)" className="pl-8" value={query} onChange={(ev) => setQuery(ev.target.value)} />
        </div>
        <nav aria-label="Seções do playbook" className="space-y-3">
          {PLAYBOOK_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.label}</p>
              <ul className="space-y-0.5">
                {g.sections.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => {
                        setSection(s);
                        setQuery("");
                      }}
                      aria-current={s === section && !results ? "page" : undefined}
                      className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2", s === section && !results && "bg-surface-2 font-medium text-primary")}
                    >
                      {PLAYBOOK_SECTIONS[s].title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 space-y-3">
        {results ? (
          <>
            <p className="text-sm text-muted">
              {results.length} resultado(s) para “{query.trim()}”
            </p>
            {results.length ? (
              results.map((e) => <EntryCard key={`${e.section}:${e.key}`} e={e} canEdit={canEdit} onEdit={setEdit} showSection />)
            ) : (
              <EmptyState title="Nada encontrado" description="Tente outro termo — por exemplo: vigência, reajuste, SPIN, gancho, D3." />
            )}
          </>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold">{meta.title}</h2>
              <p className="text-sm text-muted">{meta.description}</p>
            </div>
            <div className={cn("grid gap-3", section !== "followup" && section !== "ganchos" && section !== "spin" && "xl:grid-cols-2")}>
              {current.map((e) => (
                <EntryCard key={e.key} e={e} canEdit={canEdit} onEdit={setEdit} />
              ))}
            </div>
          </>
        )}
      </section>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title="Editar item do playbook" description={edit?.kind === "roteiro" ? "Roteiro: cada linha vira uma frase com botão de copiar." : undefined} size="lg">
          {edit && (
            <div className="space-y-3">
              <Field label="Título" error={fieldErrors.title}>
                <Input value={edit.title} onChange={(ev) => setEdit({ ...edit, title: ev.target.value })} />
              </Field>
              <Field label="Subtítulo">
                <Input value={edit.subtitle ?? ""} onChange={(ev) => setEdit({ ...edit, subtitle: ev.target.value })} />
              </Field>
              <Field label="Objetivo">
                <Input value={edit.objective ?? ""} onChange={(ev) => setEdit({ ...edit, objective: ev.target.value })} />
              </Field>
              <Field label="Conteúdo" error={fieldErrors.body}>
                <Textarea value={edit.body} onChange={(ev) => setEdit({ ...edit, body: ev.target.value })} rows={14} className="text-sm" />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.active} onChange={(ev) => setEdit({ ...edit, active: ev.target.checked })} /> Visível para a equipe
              </label>
            </div>
          )}
          <DialogFooter className="justify-between">
            <Button
              variant="outline"
              loading={pending}
              onClick={async () => {
                if (!edit?.id) return;
                const r = await run(() => restorePlaybookEntryAction(edit.id!));
                if (r.ok) setEdit(null);
              }}
            >
              <RotateCcw /> Restaurar original
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (!edit) return;
                const r = await run(() => savePlaybookEntryAction(edit));
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
