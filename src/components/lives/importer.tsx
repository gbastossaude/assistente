"use client";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/inputs";
import { LIFE_FIELDS, LIFE_FIELD_LABELS, REQUIRED_LIFE_FIELDS, type ColumnMapping, type LifeField } from "@/lib/lives-import/fields";
import type { ImportPreview } from "@/server/services/lives";
import { cn, formatNumber } from "@/lib/utils";
import { LivesSummaryView } from "./summary-view";

export function LivesImporter({ quotationId, maxMb, showCid, hasActive }: { quotationId: string; maxMb: number; showCid: boolean; hasActive: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mode, setMode] = useState<"todas" | "validas">("todas");
  const [issueFilter, setIssueFilter] = useState<"error" | "warning" | "all">("error");

  const call = async (body: FormData | object) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/quotations/${quotationId}/lives/preview`, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao ler a planilha");
      setPreview(json);
      setMapping(json.mapping);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) return toast.error("Envie um arquivo .xlsx ou .xlsm");
    if (f.size > maxMb * 1024 * 1024) return toast.error(`Arquivo excede ${maxMb} MB`);
    const fd = new FormData();
    fd.append("file", f);
    void call(fd);
  };
  const remap = (field: LifeField, idx: string) => {
    if (!mapping || !preview) return;
    const next = { ...mapping, [field]: idx === "" ? null : Number(idx) };
    setMapping(next);
    void call({ tempKey: preview.tempKey, fileName: preview.fileName, sheet: preview.sheetName, mapping: next });
  };
  const confirm = async () => {
    if (!preview || !mapping) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/quotations/${quotationId}/lives/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempKey: preview.tempKey, fileName: preview.fileName, sheet: preview.sheetName, mapping, mode, confirmed: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha na importação");
      toast.success("Base de vidas importada — checklist e pendências atualizados");
      setPreview(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{hasActive ? "Importar nova versão da base" : "Importar base de vidas"}</CardTitle>
            <CardDescription>Layout padrão: aba “BASE SAÚDE” com 13 colunas (EMPRESA … PLANO ATUAL). Nada é gravado antes da sua confirmação; o arquivo original não é alterado.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onFile(e.dataTransfer.files[0]);
            }}
            className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed py-10 text-center", drag ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2/60", busy && "pointer-events-none opacity-60")}
          >
            {busy ? <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <UploadCloud className="size-7 text-muted" />}
            <p className="text-sm font-medium">{busy ? "Lendo e validando a planilha…" : "Arraste a planilha (.xlsx / .xlsm) ou clique para selecionar"}</p>
            <p className="text-xs text-muted">Macros são ignoradas · até {maxMb} MB · 50.000 linhas</p>
            <input ref={input} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </CardContent>
      </Card>
    );
  }

  const t = preview.totals;
  const blocking = preview.missingRequired.length > 0;
  const issues = preview.issues.filter((i) => issueFilter === "all" || i.level === issueFilter);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" /> Pré-visualização: {preview.fileName}
            </CardTitle>
            <CardDescription>
              Aba “{preview.sheetName}”, cabeçalho na linha {preview.headerRowNumber}. Revise o mapeamento e os erros antes de confirmar.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPreview(null)} disabled={busy}>
            Cancelar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label="Linhas com dados" value={t.rows} />
            <Tile label="Válidas" value={t.valid} tone="green" />
            <Tile label="Com erro" value={t.withErrors} tone={t.withErrors ? "red" : undefined} />
            <Tile label="Com aviso" value={t.withWarnings} tone={t.withWarnings ? "amber" : undefined} />
            <Tile label="Linhas vazias ignoradas" value={t.skippedEmpty} />
          </div>
          {preview.sheetNames.length > 1 && (
            <Field label="Aba da planilha" className="max-w-xs">
              <Select value={preview.sheetName} onChange={(e) => call({ tempKey: preview.tempKey, fileName: preview.fileName, sheet: e.target.value, mapping: null })} disabled={busy}>
                {preview.sheetNames.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
          )}
          <div>
            <p className="mb-2 text-sm font-medium">Mapeamento de colunas</p>
            {blocking && (
              <p className="mb-2 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">
                <XCircle className="size-4" /> Mapeie as colunas obrigatórias: {preview.missingRequired.map((f) => LIFE_FIELD_LABELS[f]).join(", ")}
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {LIFE_FIELDS.map((f) => (
                <Field key={f} label={`${LIFE_FIELD_LABELS[f]}${REQUIRED_LIFE_FIELDS.includes(f) ? " *" : ""}`}>
                  <Select value={mapping?.[f] ?? ""} onChange={(e) => remap(f, e.target.value)} disabled={busy} aria-invalid={preview.missingRequired.includes(f) || undefined}>
                    <option value="">— não mapear —</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {String.fromCharCode(65 + (i % 26))}: {h || "(sem título)"}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Problemas encontrados ({preview.issues.length}{preview.issuesTruncated ? "+" : ""})</CardTitle>
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(
              [
                ["error", "Erros"],
                ["warning", "Avisos"],
                ["all", "Todos"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setIssueFilter(k)} className={cn("rounded px-2 py-0.5", issueFilter === k ? "bg-primary text-white" : "text-muted")}>
                {l}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="max-h-80 overflow-y-auto p-0">
          {issues.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> Nenhum problema neste filtro
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="text-left text-muted">
                  <th className="px-3 py-1.5">Linha</th>
                  <th className="px-3 py-1.5">Campo</th>
                  <th className="px-3 py-1.5">Nível</th>
                  <th className="px-3 py-1.5">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {issues.slice(0, 500).map((i, k) => (
                  <tr key={k} className="border-t border-border">
                    <td className="px-3 py-1 tabular-nums">{i.row}</td>
                    <td className="px-3 py-1">{i.field}</td>
                    <td className="px-3 py-1">{i.level === "error" ? <Badge tone="red">Erro</Badge> : <Badge tone="amber">Aviso</Badge>}</td>
                    <td className="px-3 py-1">{i.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Primeiras linhas normalizadas</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="bg-surface-2">
              <tr className="text-left text-muted">
                {["Linha", "CNPJ", "Nascimento", "Idade", "Faixa", "Titularidade", "Parentesco", "Situação", "CID", "Cidade/UF", "Operadora", "Plano"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-1.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 20).map((l) => (
                <tr key={l.rowNumber} className={cn("border-t border-border", l.issues.some((i) => i.level === "error") && "bg-red-50/60 dark:bg-red-950/40")}>
                  <td className="px-2 py-1 tabular-nums">{l.rowNumber}</td>
                  <td className="px-2 py-1 tabular-nums">{l.cnpj ?? "—"}</td>
                  <td className="px-2 py-1">{l.birthDate?.split("-").reverse().join("/") ?? "—"}</td>
                  <td className="px-2 py-1">{l.age ?? "—"}</td>
                  <td className="px-2 py-1">{l.ageBand ?? "—"}</td>
                  <td className="px-2 py-1">{l.holderType ?? "—"}</td>
                  <td className="px-2 py-1">{l.kinship ?? "—"}</td>
                  <td className="px-2 py-1">{l.situation ?? "—"}</td>
                  <td className="px-2 py-1">{l.cid ? (showCid ? l.cid : "•••") : "—"}</td>
                  <td className="px-2 py-1">{[l.city, l.uf].filter(Boolean).join("/") || "—"}</td>
                  <td className="px-2 py-1">{l.insurer ?? "—"}</td>
                  <td className="px-2 py-1">{l.plan ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <LivesSummaryView s={preview.summary} showCid={showCid} />

      <Card className="sticky bottom-3 z-10 shadow-lg">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === "todas"} onChange={() => setMode("todas")} /> Importar todas ({formatNumber(t.rows)}) — linhas com erro ficam como incompletas
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === "validas"} onChange={() => setMode("validas")} /> Somente válidas ({formatNumber(t.valid)})
            </label>
          </div>
          <div className="flex items-center gap-2">
            {t.withErrors > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="size-3.5" /> {t.withErrors} linha(s) com erro
              </span>
            )}
            <Button onClick={confirm} loading={busy} disabled={blocking || (mode === "validas" && t.valid === 0)}>
              Confirmar importação
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" | "amber" }) {
  return (
    <div className={cn("rounded-md border border-border p-2.5", tone === "red" && "border-red-300 bg-red-50 dark:bg-red-950", tone === "amber" && "border-amber-300 bg-amber-50 dark:bg-amber-950", tone === "green" && "border-emerald-300 bg-emerald-50 dark:bg-emerald-950")}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}
