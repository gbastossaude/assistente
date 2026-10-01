"use client";

export interface UploadMeta {
  quotationId?: string | null;
  companyId?: string | null;
  taskId?: string | null;
  docType: string;
  referenceDate?: string | null;
  sender?: string | null;
  status?: string;
  notes?: string | null;
}

export async function uploadFile(file: File, meta: UploadMeta): Promise<{ ok: true; id: string; fileName: string } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(meta)) if (v !== null && v !== undefined && v !== "") fd.append(k, String(v));
  try {
    const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error ?? `Falha no upload (${res.status})` };
    return { ok: true, id: json.id, fileName: json.fileName };
  } catch {
    return { ok: false, error: "Falha de comunicação durante o upload." };
  }
}
