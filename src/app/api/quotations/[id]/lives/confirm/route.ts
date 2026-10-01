import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LIFE_FIELDS } from "@/lib/lives-import/fields";
import { parseInput } from "@/server/action-utils";
import { apiHandler } from "@/server/api-utils";
import { confirmImport } from "@/server/services/lives";

export const runtime = "nodejs";

const schema = z.object({
  tempKey: z.string().min(10),
  fileName: z.string().min(1).max(200),
  sheet: z.string().min(1).max(200),
  mapping: z.object(Object.fromEntries(LIFE_FIELDS.map((f) => [f, z.number().int().min(0).nullable()]))),
  mode: z.enum(["todas", "validas"]),
  confirmed: z.literal(true, { error: "Confirme a importação" }),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiHandler(
    "lives:import",
    async (user) => {
      const body = parseInput(schema, await req.json());
      const importId = await confirmImport(id, body as never, user);
      revalidatePath("/", "layout");
      return NextResponse.json({ importId });
    },
    "lives-confirm",
  );
}
