import { DocumentsTable } from "@/components/documents/documents-panel";
import { GlobalUpload } from "@/components/documents/global-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS, DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/domain/constants";
import { sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { listDocuments } from "@/server/services/documents";
import { taskOptions } from "@/server/services/options";
import { maxUploadBytes } from "@/server/storage";

export const metadata = { title: "Documentos" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const [rows, opts] = await Promise.all([listDocuments({ q: sp(s.q), docType: sp(s.tipo), status: sp(s.status), taskId: sp(s.tarefa) }), taskOptions()]);
  return (
    <>
      <PageHeader title="Documentos" description={s.tarefa ? "Anexos da tarefa selecionada" : "Armazenamento privado — downloads de documentos sensíveis são auditados"} />
      {can(user.role, "document:write") && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Enviar documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <GlobalUpload quotations={opts.quotations} companies={opts.companies} maxMb={Math.round(maxUploadBytes() / 1024 / 1024)} />
          </CardContent>
        </Card>
      )}
      <form className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-5" role="search">
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Arquivo, empresa ou cotação" className="sm:col-span-2" />
        <Select name="tipo" defaultValue={s.tipo ?? ""}>
          <option value="">Todos os tipos</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={s.status ?? ""}>
          <option value="">Todos os status</option>
          {DOCUMENT_STATUSES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_STATUS_LABELS[t]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      <Card>
        <DocumentsTable
          showContext
          docs={rows.map((r) => ({ ...r.d, uploaderName: r.uploaderName, companyName: r.companyName, quotationCode: r.quotationCode }))}
          canWrite={can(user.role, "document:write")}
          canSensitive={can(user.role, "sensitive:read")}
        />
      </Card>
    </>
  );
}
