import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { documentMetaSchema } from "@/lib/validation/schemas";
import { parseInput } from "@/server/action-utils";
import { apiHandler } from "@/server/api-utils";
import { BusinessError } from "@/server/errors";
import { uploadDocument } from "@/server/services/documents";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return apiHandler(
    "document:write",
    async (user) => {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new BusinessError("Selecione um arquivo.");
      const meta = parseInput(documentMetaSchema, {
        quotationId: form.get("quotationId"),
        companyId: form.get("companyId"),
        taskId: form.get("taskId"),
        docType: form.get("docType"),
        referenceDate: form.get("referenceDate"),
        sender: form.get("sender"),
        status: form.get("status") || "recebido",
        notes: form.get("notes"),
      });
      const doc = await uploadDocument({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) }, meta, user);
      revalidatePath("/", "layout");
      return NextResponse.json({ id: doc.id, fileName: doc.fileName });
    },
    "upload",
  );
}
