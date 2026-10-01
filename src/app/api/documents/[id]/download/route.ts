import { NextResponse } from "next/server";
import { apiHandler } from "@/server/api-utils";
import { authorizeDownload } from "@/server/services/documents";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return apiHandler(
    "read",
    async (user) => {
      const doc = await authorizeDownload(id, user);
      // Supabase: URL assinada de curta duração (60 s)
      const signed = await storage().signedUrl(doc.storageKey, 60, doc.fileName);
      if (signed) return NextResponse.redirect(signed, { headers: { "Cache-Control": "no-store" } });
      const buf = await storage().get(doc.storageKey);
      const safeInline = inline && (doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/"));
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": doc.mimeType,
          "Content-Length": String(buf.length),
          "Content-Disposition": `${safeInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      });
    },
    "download",
  );
}
