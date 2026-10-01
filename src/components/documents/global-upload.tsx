"use client";
import { useState } from "react";
import { Field, Select } from "@/components/ui/inputs";
import { UploadZone } from "./documents-panel";

export function GlobalUpload({ quotations, companies, maxMb }: { quotations: { id: string; label: string; companyId: string }[]; companies: { id: string; name: string }[]; maxMb: number }) {
  const [quotationId, setQ] = useState("");
  const [companyId, setC] = useState("");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Cotação (recomendado — atualiza o checklist)">
          <Select
            value={quotationId}
            onChange={(e) => {
              setQ(e.target.value);
              setC(quotations.find((q) => q.id === e.target.value)?.companyId ?? companyId);
            }}
          >
            <option value="">—</option>
            {quotations.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Empresa">
          <Select value={companyId} onChange={(e) => setC(e.target.value)} disabled={!!quotationId}>
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {quotationId || companyId ? <UploadZone quotationId={quotationId || null} companyId={companyId || null} maxMb={maxMb} /> : <p className="text-xs text-muted">Selecione a cotação ou a empresa para enviar arquivos.</p>}
    </div>
  );
}
