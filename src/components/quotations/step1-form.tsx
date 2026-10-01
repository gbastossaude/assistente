"use client";
import { Building2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { canonicalCnpj, formatCnpj } from "@/lib/domain/cnpj";
import { LARGE_ACCOUNT_MIN_LIVES, PRIORITIES, PRIORITY_LABELS } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import { createQuotationAction } from "@/server/actions/quotations";

export interface CompanyOption {
  id: string;
  name: string;
  legalName: string;
  estimatedLives: number | null;
  cnpjs: string[];
  nextAnniversary: string | null;
}

export function Step1Form({ companies, users, defaultCompanyId, today, currentUserId }: { companies: CompanyOption[]; users: { id: string; name: string }[]; defaultCompanyId?: string; today: string; currentUserId: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction();
  const first = companies.find((c) => c.id === defaultCompanyId);
  const [v, setV] = useState({
    companyId: first?.id ?? "",
    processType: "" as "" | "NEW" | "RENEW",
    stipulantName: first?.legalName ?? "",
    estimatedLives: first?.estimatedLives?.toString() ?? "",
    reason: "",
    openedAt: today,
    targetDate: "",
    renewalDate: first?.nextAnniversary ?? "",
    ownerId: currentUserId,
    priority: "media",
  });
  const company = useMemo(() => companies.find((c) => c.id === v.companyId), [companies, v.companyId]);
  const [cnpjs, setCnpjs] = useState<string[]>(first?.cnpjs ?? []);
  const [extra, setExtra] = useState("");
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  const selectCompany = (id: string) => {
    const c = companies.find((x) => x.id === id);
    setV((s) => ({ ...s, companyId: id, stipulantName: c?.legalName ?? "", estimatedLives: c?.estimatedLives?.toString() ?? s.estimatedLives, renewalDate: c?.nextAnniversary ?? s.renewalDate }));
    setCnpjs(c?.cnpjs ?? []);
  };

  const lives = Number(v.estimatedLives || 0);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run<unknown>(() => createQuotationAction({ ...v, cnpjs }), { refresh: false });
        if (r.ok) router.push(`/cotacoes/${r.data}/wizard?step=2`);
      }}
      className="space-y-4"
    >
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Empresa" required error={fieldErrors.companyId} className="md:col-span-2" hint={<Link href="/empresas/nova" className="text-primary hover:underline">Cadastrar nova empresa</Link>}>
            <Select value={v.companyId} onChange={(e) => selectCompany(e.target.value)} aria-invalid={!!fieldErrors.companyId}>
              <option value="">Selecione…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.name !== c.legalName ? ` — ${c.legalName}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade" required>
            <Select value={v.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-3">
            <p className="mb-1 text-xs font-medium text-muted">
              Tipo do processo<span className="text-red-600">*</span>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { k: "NEW", icon: Sparkles, t: "NEW — Nova contratação", d: "Empresa vindo de outra corretora/operadora. Checklist NEW." },
                  { k: "RENEW", icon: RefreshCw, t: "RENEW — Renovação", d: "Renovação da carteira. Exige sinistralidade e evolução de vidas." },
                ] as const
              ).map((o) => (
                <button
                  type="button"
                  key={o.k}
                  onClick={() => set("processType", o.k)}
                  className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors", v.processType === o.k ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-surface-2")}
                  aria-pressed={v.processType === o.k}
                >
                  <o.icon className="mt-0.5 size-5 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold">{o.t}</span>
                    <span className="block text-xs text-muted">{o.d}</span>
                  </span>
                </button>
              ))}
            </div>
            {fieldErrors.processType && <p className="mt-1 text-xs text-red-600">Escolha NEW ou RENEW</p>}
          </div>
          <Field label="Nome do estipulante" error={fieldErrors.stipulantName}>
            <Input value={v.stipulantName} onChange={(e) => set("stipulantName", e.target.value)} />
          </Field>
          <Field label="Número estimado de vidas" required error={fieldErrors.estimatedLives} hint={lives > 0 && lives < LARGE_ACCOUNT_MIN_LIVES ? "Abaixo de 100 vidas: não entra em Grandes Contas +99" : undefined}>
            <Input type="number" min={1} value={v.estimatedLives} onChange={(e) => set("estimatedLives", e.target.value)} aria-invalid={!!fieldErrors.estimatedLives} />
          </Field>
          <Field label="Responsável">
            <Select value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data de abertura" required error={fieldErrors.openedAt}>
            <Input type="date" value={v.openedAt} onChange={(e) => set("openedAt", e.target.value)} />
          </Field>
          <Field label="Data-alvo para conclusão" error={fieldErrors.targetDate}>
            <Input type="date" value={v.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
          </Field>
          <Field label="Data de renovação" error={fieldErrors.renewalDate}>
            <Input type="date" value={v.renewalDate} onChange={(e) => set("renewalDate", e.target.value)} />
          </Field>
          <Field label="Motivo da cotação" className="md:col-span-3" error={fieldErrors.reason}>
            <Textarea value={v.reason} onChange={(e) => set("reason", e.target.value)} rows={2} placeholder="Reajuste elevado, insatisfação com rede, redução de custo…" />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Building2 className="size-4 text-muted" /> CNPJs participantes
          </p>
          {!company ? (
            <p className="text-sm text-muted">Selecione a empresa para ver os CNPJs cadastrados.</p>
          ) : (
            <div className="space-y-2">
              {[...new Set([...company.cnpjs, ...cnpjs])].map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm tabular-nums">
                  <input type="checkbox" checked={cnpjs.includes(c)} onChange={(e) => setCnpjs((s) => (e.target.checked ? [...s, c] : s.filter((x) => x !== c)))} />
                  {formatCnpj(c)}
                </label>
              ))}
              <div className="flex max-w-md gap-2">
                <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Adicionar outro CNPJ" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const c = canonicalCnpj(extra);
                    if (c) {
                      setCnpjs((s) => [...new Set([...s, c])]);
                      setExtra("");
                    }
                  }}
                  disabled={!canonicalCnpj(extra)}
                >
                  Adicionar
                </Button>
              </div>
              {extra && !canonicalCnpj(extra) && <p className="text-xs text-red-600">CNPJ inválido</p>}
              {Object.keys(fieldErrors).some((k) => k.startsWith("cnpjs")) && <p className="text-xs text-red-600">Há CNPJ inválido na lista</p>}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" loading={pending} disabled={!v.companyId || !v.processType}>
          Abrir cotação e gerar checklist →
        </Button>
      </div>
    </form>
  );
}
