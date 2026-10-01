import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runSweep } from "@/server/automation/engine";
import { logTechnicalError } from "@/server/errors";

export const runtime = "nodejs";

/** Rotina de automações/alertas para agendadores externos (cron). Autenticada por CRON_SECRET. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runSweep());
  } catch (e) {
    logTechnicalError("cron-sweep", e);
    return NextResponse.json({ error: "Falha na rotina" }, { status: 500 });
  }
}
