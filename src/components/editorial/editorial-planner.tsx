"use client";
import { CalendarPlus, Download, Printer, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { Table, Td, Th } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { toCsv } from "@/lib/csv";
import { formatDateBR } from "@/lib/domain/dates";
import {
  EDITORIAL_PILLAR_HINTS,
  EDITORIAL_PILLAR_LABELS,
  EDITORIAL_PILLAR_SHARE,
  EDITORIAL_PLATFORMS,
  EDITORIAL_PLATFORM_LABELS,
  POSTING_FREQUENCIES,
  POSTING_FREQUENCY_LABELS,
  editorialCsvRows,
  editorialMarkdown,
  suggestImportantDates,
  type EditorialPillar,
  type EditorialPlatform,
} from "@/lib/domain/editorial-calendar";
import type { EditorialResult } from "@/server/services/editorial";
import { generateEditorialCalendarAction } from "@/server/actions/editorial";

interface FormValue {
  startDate: string;
  niche: string;
  platform: string;
  audience: string;
  frequency: string;
  pillars: string;
  objectives: string;
  product: string;
  launchWeek: string;
  importantDates: string;
}

const PILLAR_TONES: Record<EditorialPillar, string> = { educativo: "blue", conexao: "violet", venda: "emerald", engajamento: "amber" };

export function EditorialPlanner({ initial, aiEnabled }: { initial: FormValue; aiEnabled: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState<FormValue>(initial);
  const [result, setResult] = useState<(EditorialResult & { platform: EditorialPlatform }) | null>(null);
  const set = <K extends keyof FormValue>(k: K, val: FormValue[K]) => setV((s) => ({ ...s, [k]: val }));

  async function generate() {
    const res = await run(() => generateEditorialCalendarAction(v), { refresh: false, success: false });
    if (res.ok) setResult({ ...res.data, platform: v.platform as EditorialPlatform });
  }

  function downloadCsv() {
    if (!result) return;
    const { header, rows } = editorialCsvRows(result.calendar);
    const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario-editorial-${result.calendar.posts[0]?.date ?? "mes"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cal = result?.calendar;
  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Nicho/área" required error={fieldErrors.niche} className="md:col-span-2">
              <Input value={v.niche} onChange={(e) => set("niche", e.target.value)} />
            </Field>
            <Field label="Plataforma principal">
              <Select value={v.platform} onChange={(e) => set("platform", e.target.value)}>
                {EDITORIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {EDITORIAL_PLATFORM_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Frequência de postagem">
              <Select value={v.frequency} onChange={(e) => set("frequency", e.target.value)}>
                {POSTING_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {POSTING_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Público-alvo" required error={fieldErrors.audience} className="md:col-span-2">
              <Input value={v.audience} onChange={(e) => set("audience", e.target.value)} />
            </Field>
            <Field label="Início (30 dias corridos)" required error={fieldErrors.startDate}>
              <Input type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <Field label="Semana do lançamento" error={fieldErrors.launchWeek}>
              <Select value={v.launchWeek} onChange={(e) => set("launchWeek", e.target.value)}>
                <option value="0">Sem lançamento</option>
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={String(w)}>
                    Semana {w}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Produto/serviço que vende" className="md:col-span-2" hint="Usado nos posts de venda (indireta e de lançamento)">
              <Input value={v.product} onChange={(e) => set("product", e.target.value)} />
            </Field>
            <Field label="Pilares de conteúdo (se já tiver)" className="md:col-span-2" hint="Ex.: educação, bastidores, vendas, lifestyle">
              <Input value={v.pillars} onChange={(e) => set("pillars", e.target.value)} />
            </Field>
            <Field label="Objetivos do mês" className="md:col-span-2">
              <Textarea value={v.objectives} onChange={(e) => set("objectives", e.target.value)} rows={3} placeholder="Ex.: lançamento na semana 3, crescer seguidores, aquecer audiência" />
            </Field>
            <Field label="Datas importantes no período" className="md:col-span-2" hint="Uma por linha: dd/mm Descrição">
              <Textarea value={v.importantDates} onChange={(e) => set("importantDates", e.target.value)} rows={3} placeholder="15/11 Proclamação da República" />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted">
            Distribuição: {(Object.keys(EDITORIAL_PILLAR_SHARE) as EditorialPillar[]).map((p) => `${EDITORIAL_PILLAR_SHARE[p]}% ${EDITORIAL_PILLAR_LABELS[p].toLowerCase()} (${EDITORIAL_PILLAR_HINTS[p]})`).join(" · ")}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={generate} loading={pending}>
              <Sparkles /> Gerar calendário
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                const s = suggestImportantDates(v.startDate, v.niche);
                set("importantDates", [v.importantDates.trim(), s].filter(Boolean).join("\n"));
              }}
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(v.startDate)}
            >
              <CalendarPlus /> Sugerir datas do período
            </Button>
            <span className="self-center text-xs text-muted">{aiEnabled ? "Temas e legendas escritos pelo Claude." : "Modo local: temas do banco do sistema (configure ANTHROPIC_API_KEY para textos sob medida)."}</span>
          </div>
        </CardContent>
      </Card>

      {cal && result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.mode === "claude" ? "violet" : "slate"}>{result.mode === "claude" ? "Gerado com Claude" : "Modo local"}</Badge>
            {result.note && <span className="text-xs text-amber-700 dark:text-amber-300">{result.note}</span>}
            <span className="text-sm text-muted">
              {cal.posts.length} posts · {formatDateBR(cal.posts[0]?.date)} a {formatDateBR(cal.posts[cal.posts.length - 1]?.date)} · {cal.distribution.map((d) => `${EDITORIAL_PILLAR_LABELS[d.pillar]} ${d.count} (${d.pct}%)`).join(" · ")}
            </span>
            <div className="ml-auto flex flex-wrap gap-2 print:hidden">
              <CopyButton text={() => editorialMarkdown(cal, result.platform)} label="Copiar (Markdown)" successMessage="Calendário copiado" />
              <Button size="sm" variant="outline" onClick={downloadCsv}>
                <Download /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer /> Imprimir / PDF
              </Button>
            </div>
          </div>

          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Dia</Th>
                  <Th>Dia da semana</Th>
                  <Th>Pilar</Th>
                  <Th>Formato</Th>
                  <Th>Tema do post</Th>
                  <Th>Resumo da legenda</Th>
                  <Th>CTA</Th>
                </tr>
              </thead>
              <tbody>
                {cal.posts.map((p) => (
                  <tr key={p.day}>
                    <Td className="whitespace-nowrap">
                      <span className="font-medium">{p.day}</span> <span className="text-xs text-muted">{formatDateBR(p.date).slice(0, 5)}</span>
                    </Td>
                    <Td>{p.weekday}</Td>
                    <Td>
                      <Badge tone={PILLAR_TONES[p.pillar]}>{EDITORIAL_PILLAR_LABELS[p.pillar]}</Badge>
                      {p.launch && <Badge tone="red" className="ml-1">Lançamento</Badge>}
                    </Td>
                    <Td className="whitespace-nowrap">{p.format}</Td>
                    <Td className="min-w-56 font-medium">
                      {p.theme}
                      {p.occasion && <div className="mt-0.5 text-xs font-normal text-amber-700 dark:text-amber-300">📅 {p.occasion}</div>}
                    </Td>
                    <Td className="min-w-72 text-muted">{p.caption}</Td>
                    <Td className="min-w-40">{p.cta}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Resumo semanal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {cal.weeks.map((w) => (
                  <p key={w.week}>
                    <span className="font-semibold">
                      Semana {w.week}: {w.focus}
                    </span>{" "}
                    — {w.goal} <span className="text-xs text-muted">({cal.posts.filter((p) => p.week === w.week).length} posts)</span>
                  </p>
                ))}
                {cal.offDayOccasions.length > 0 && (
                  <p className="text-xs text-muted">Datas em dias sem post (use os Stories): {cal.offDayOccasions.map((o) => `${formatDateBR(o.date).slice(0, 5)} ${o.label}`).join(" · ")}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dicas de horário</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {cal.schedulingTips.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>5 ideias de Stories diários</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {cal.stories.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>3 ideias de Reels</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {cal.reels.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
