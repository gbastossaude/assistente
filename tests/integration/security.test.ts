import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { activityLogs } from "@/server/db/schema";
import { companySchema, quotationStep1Schema } from "@/lib/validation/schemas";
import { createCompany } from "@/server/services/companies";
import { authorizeDownload, uploadDocument } from "@/server/services/documents";
import { createQuotation, getQuotationDetail } from "@/server/services/quotations";
import { redactEntries } from "@/server/services/quotation-view";
import { saveSpecialEntry, saveSpecialSummary } from "@/server/services/special-cases";
import { askAssistant, decideAction } from "@/server/assistant";
import { todayISO } from "@/lib/domain/dates";
import { hasTestDb, makeUser, resetTestDb } from "../helpers/db";
import type { CurrentUser } from "@/server/auth";

describe.skipIf(!hasTestDb)("segurança, LGPD e assistente (integração)", () => {
  let head: CurrentUser;
  let comercial: CurrentUser;
  let quotationId: string;
  let docId: string;

  beforeAll(async () => {
    await resetTestDb();
    head = await makeUser("head");
    comercial = await makeUser("comercial");
    const c = await createCompany(companySchema.parse({ legalName: "Empresa Segura S.A.", mainCnpj: "11222333000181" }), head);
    quotationId = (await createQuotation(quotationStep1Schema.parse({ companyId: c.id, processType: "NEW", estimatedLives: 150, openedAt: todayISO(), priority: "media" }), head)).id;
    docId = (await uploadDocument({ name: "relatorio.pdf", buffer: Buffer.from("%PDF-1.4") }, { quotationId, companyId: null, taskId: null, docType: "relatorio_medico", referenceDate: null, sender: null, status: "recebido", notes: null }, head)).id;
  });

  it("documento de saúde é sensível; comercial não baixa e o acesso negado é auditado", async () => {
    await expect(authorizeDownload(docId, comercial)).rejects.toThrow(/restrito/);
    const doc = await authorizeDownload(docId, head);
    expect(doc.sensitive).toBe(true);
    const logs = await db.select().from(activityLogs).where(eq(activityLogs.entityId, docId));
    expect(logs.filter((l) => l.action === "download" && l.sensitive)).toHaveLength(2);
  });

  it("CID não é exposto a perfis sem permissão e não entra na auditoria", async () => {
    await saveSpecialSummary({ quotationId, kind: "afastados", has: true, quantity: 1, details: {}, notes: null }, head);
    await saveSpecialEntry({ quotationId, kind: "afastados", data: { cid: "F32.1", data_afastamento: "2026-01-10", idade: 40, sexo: "F", plano_atual: "Plano A", localidade: "SP" } }, head);
    const d = (await getQuotationDetail(quotationId))!;
    expect(redactEntries(d.specialEntries, false)[0].data.cid).toBe("•••");
    expect(redactEntries(d.specialEntries, true)[0].data.cid).toBe("F32.1");
    const logs = await db.select().from(activityLogs);
    expect(JSON.stringify(logs)).not.toContain("F32.1");
  });

  it("assistente local responde com dados reais e só executa ação após confirmação", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r1 = await askAssistant("O que está pendente na cotação da empresa Segura?", head);
    expect(r1.mode).toBe("local");
    expect(r1.text).toMatch(/não informado|não enviado/);
    const r2 = await askAssistant("Quais renovações vencem nos próximos 30 dias?", head);
    expect(r2.text).toMatch(/Nenhuma renovação/);
    const r3 = await askAssistant("Crie tarefas para todas as operadoras que não responderam", head);
    expect(r3.actionIds).toHaveLength(0);
    await expect(decideAction("00000000-0000-0000-0000-000000000000", true, head)).rejects.toThrow(/não encontrada/);
  });
});
