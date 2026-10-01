import { NextResponse } from "next/server";
import { apiHandler } from "@/server/api-utils";
import { BusinessError } from "@/server/errors";
import { previewImport } from "@/server/services/lives";
import type { ColumnMapping } from "@/lib/lives-import/fields";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiHandler(
    "lives:import",
    async () => {
      const type = req.headers.get("content-type") ?? "";
      if (type.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new BusinessError("Selecione a planilha.");
        return NextResponse.json(await previewImport(id, { file: { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) } }));
      }
      const body = (await req.json()) as { tempKey?: string; fileName?: string; sheet?: string; mapping?: ColumnMapping };
      return NextResponse.json(await previewImport(id, { tempKey: body.tempKey, fileName: body.fileName, sheet: body.sheet ?? null, mapping: body.mapping ?? null }));
    },
    "lives-preview",
  );
}
