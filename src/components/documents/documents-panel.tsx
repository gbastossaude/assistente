"use client";
import { Download, Eye, FileUp, Lock, Pencil, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, Table, Td, Th } from "@/components/ui/misc";
import { DocumentStatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/use-action";
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS, DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentStatus, type DocumentType } from "@/lib/domain/constants";
import { formatDateBR, formatDateTimeBR, todayISO } from "@/lib/domain/dates";
import { cn, formatBytes } from "@/lib/utils";
import { deleteDocumentAction, updateDocumentAction } from "@/server/actions/documents";
import { uploadFile } from "./upload";

export interface DocRow {
  id: string;
  docType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  referenceDate: string | null;
  sender: string | null;
  status: DocumentStatus;
  sensitive: boolean;
  notes: string | null;
  createdAt: Date;
  uploaderName: string | null;
  companyName?: string | null;
  quotationCode?: string | null;
  quotationId?: string | null;
}

const ACCEPT = ".pdf,.xlsx,.xlsm,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg,.txt,.zip,.eml,.msg";

export function UploadZone({ quotationId, companyId, taskId, defaultType = "outros", compact, onUploaded, maxMb }: { quotationId?: string | null; companyId?: string | null; taskId?: string | null; defaultType?: DocumentType; compact?: boolean; onUploaded?: (d: { id: string; fileName: string }) => void; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState({ docType: defaultType as string, referenceDate: "", sender: "", status: "recebido", notes: "" });
  const send = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of list) {
      if (f.size > maxMb * 1024 * 1024) {
        toast.error(`${f.name}: excede ${maxMb} MB`);
        continue;
      }
      const r = await uploadFile(f, { ...meta, quotationId, companyId, taskId });
      if (r.ok) {
        ok++;
        onUploaded?.(r);
      } else toast.error(`${f.name}: ${r.error}`);
    }
    setBusy(false);
    if (ok) {
      toast.success(`${ok} arquivo(s) enviado(s)`);
      router.refresh();
    }
    if (input.current) input.current.value = "";
  };
  return (
    <div className="space-y-3">
      {!compact && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo do documento">
            <Select value={meta.docType} onChange={(e) => setMeta({ ...meta, docType: e.target.value })}>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data de referência">
            <Input type="date" value={meta.referenceDate} onChange={(e) => setMeta({ ...meta, referenceDate: e.target.value })} max={todayISO()} />
          </Field>
          <Field label="Responsável pelo envio">
            <Input value={meta.sender} onChange={(e) => setMeta({ ...meta, sender: e.target.value })} placeholder="Quem enviou (cliente, RH…)" />
          </Field>
          <Field label="Status inicial">
            <Select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>
              {DOCUMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DOCUMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void send(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Enviar arquivos"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 text-center transition-colors",
          compact ? "py-3" : "py-7",
          drag ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2/60",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="size-6 text-muted" />
        <p className="text-sm font-medium">{busy ? "Enviando…" : "Arraste arquivos aqui ou clique para selecionar"}</p>
        <p className="text-xs text-muted">PDF, planilhas, documentos e imagens · até {maxMb} MB · armazenamento privado</p>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && send(e.target.files)} />
      </div>
    </div>
  );
}

export function DocumentsTable({ docs, canWrite, canSensitive, showContext }: { docs: DocRow[]; canWrite: boolean; canSensitive: boolean; showContext?: boolean }) {
  const { run, pending } = useAction();
  const [edit, setEdit] = useState<DocRow | null>(null);
  if (!docs.length) return <EmptyState icon={<FileUp />} title="Nenhum documento" description="Envie os documentos do processo — o checklist é atualizado automaticamente." />;
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Documento</Th>
            {showContext && <Th>Empresa / cotação</Th>}
            <Th>Tipo</Th>
            <Th>Status</Th>
            <Th>Referência</Th>
            <Th>Enviado por</Th>
            <Th>Inclusão</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const locked = d.sensitive && !canSensitive;
            const viewable = d.mimeType === "application/pdf" || d.mimeType.startsWith("image/");
            return (
              <tr key={d.id}>
                <Td>
                  <p className="flex items-center gap-1.5 font-medium">
                    {d.sensitive && <Lock className="size-3.5 text-amber-600" aria-label="Dado sensível" />}
                    <span className="break-all">{d.fileName}</span>
                  </p>
                  <p className="text-xs text-muted">{formatBytes(d.sizeBytes)}{d.notes ? ` · ${d.notes}` : ""}</p>
                </Td>
                {showContext && (
                  <Td className="text-xs">
                    {d.companyName ?? "—"}
                    {d.quotationCode && (
                      <a className="block text-primary hover:underline" href={`/cotacoes/${d.quotationId}?tab=documentos`}>
                        {d.quotationCode}
                      </a>
                    )}
                  </Td>
                )}
                <Td className="text-xs">{DOCUMENT_TYPE_LABELS[d.docType as DocumentType] ?? d.docType}</Td>
                <Td>
                  <DocumentStatusBadge value={d.status} />
                </Td>
                <Td className="whitespace-nowrap">{formatDateBR(d.referenceDate)}</Td>
                <Td>{d.sender ?? "—"}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">
                  {formatDateTimeBR(d.createdAt)}
                  <span className="block">{d.uploaderName}</span>
                </Td>
                <Td>
                  <div className="flex justify-end gap-0.5">
                    {locked ? (
                      <span className="px-2 text-xs text-muted" title="Acesso restrito a dados de saúde">
                        Restrito
                      </span>
                    ) : (
                      <>
                        {viewable && (
                          <Button asChild variant="ghost" size="icon-sm" title="Visualizar">
                            <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener noreferrer">
                              <Eye />
                            </a>
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="icon-sm" title="Baixar">
                          <a href={`/api/documents/${d.id}/download`}>
                            <Download />
                          </a>
                        </Button>
                      </>
                    )}
                    {canWrite && (
                      <>
                        <Button variant="ghost" size="icon-sm" title="Editar / validar" onClick={() => setEdit(d)}>
                          <Pencil />
                        </Button>
                        <ConfirmButton title="Excluir documento?" description={`${d.fileName} será removido do processo (exclusão lógica; o arquivo é expurgado conforme a política de retenção).`} onConfirm={() => run(() => deleteDocumentAction(d.id))} size="icon-sm">
                          <Trash2 />
                        </ConfirmButton>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title="Documento" description={edit?.fileName}>
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <Select value={edit.docType} onChange={(e) => setEdit({ ...edit, docType: e.target.value })}>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DOCUMENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as DocumentStatus })}>
                  {DOCUMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {DOCUMENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data de referência">
                <Input type="date" value={edit.referenceDate ?? ""} onChange={(e) => setEdit({ ...edit, referenceDate: e.target.value })} />
              </Field>
              <Field label="Responsável pelo envio">
                <Input value={edit.sender ?? ""} onChange={(e) => setEdit({ ...edit, sender: e.target.value })} />
              </Field>
              <Field label="Observação" className="sm:col-span-2" hint="Inválido/desatualizado gera pendência documental automaticamente">
                <Textarea value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </Field>
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
                const r = await run(() => updateDocumentAction({ id: edit.id, docType: edit.docType, status: edit.status, referenceDate: edit.referenceDate, sender: edit.sender, notes: edit.notes }));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
