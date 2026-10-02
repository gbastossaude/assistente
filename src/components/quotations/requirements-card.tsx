import { AlertTriangle, Download, FileSpreadsheet, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { LIVES_TEMPLATE_FILENAME, LIVES_TEMPLATE_URL, QUOTATION_REQUIREMENTS, SINISTRALITY_NOTICE, requirementsAsText } from "@/lib/domain/quotation-requirements";

/** Lista do que o cliente precisa enviar para cotar Grandes Contas, com cópia para e-mail/WhatsApp e a planilha modelo. */
export function RequirementsCard() {
  return (
    <Card className="mb-5" data-testid="quotation-requirements">
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>Informações necessárias para a cotação</CardTitle>
          <p className="mt-0.5 text-xs text-muted">Envie ao cliente junto com a planilha modelo da base de vidas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={requirementsAsText()} label="Copiar lista" successMessage="Lista copiada — cole no e-mail ou WhatsApp" />
          <Button asChild size="sm">
            <a href={LIVES_TEMPLATE_URL} download={LIVES_TEMPLATE_FILENAME}>
              <Download /> Baixar planilha modelo
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {QUOTATION_REQUIREMENTS.map((s, i) => (
          <section key={s.title} className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">{s.title}</h3>
            {s.note && (
              <p className="flex gap-1.5 rounded-md bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                <Info className="mt-0.5 size-3.5 shrink-0" /> {s.note}
              </p>
            )}
            <ul className="space-y-1.5 text-sm">
              {s.items.map((it) => (
                <li key={it.label} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0">
                    {it.label}
                    {it.hint && <span className="block text-xs text-muted">{it.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {i === 0 && (
              <>
                <p className="flex items-center gap-1.5 rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="size-3.5 shrink-0" /> {SINISTRALITY_NOTICE}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <FileSpreadsheet className="size-3.5 shrink-0" /> Planilha modelo: aba “BASE SAÚDE”, o mesmo layout que o sistema importa na cotação.
                </p>
              </>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
