import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { apiHandler } from "@/server/api-utils";
import { guardQuotation } from "@/server/access";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { quotations } from "@/server/db/schema";
import { NotFoundError } from "@/server/errors";
import { getComparison } from "@/server/services/insurers";

export const runtime = "nodejs";

/** Exportação do comparativo em Excel. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return apiHandler(
    "read",
    async (user) => {
      await guardQuotation(user, id);
      const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
      if (!q) throw new NotFoundError("Cotação");
      const cmp = await getComparison(id);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Comparativo");
      ws.addRow([`Comparativo de propostas — ${q.code}`]).font = { bold: true, size: 13 };
      ws.addRow([`Custo mensal atual de referência: ${cmp.currentMonthlyCost ?? "não informado"}`]);
      ws.addRow([]);
      const header = ["Operadora", "Versão", "Destaque", "Produto", "Rede", "Abrangência", "Acomodação", "Coparticipação", "Reembolso", "Valor mensal", "Custo atual", "Variação (R$)", "Variação (%)", "Comissão (%)", "Taxa adm. (%)", "Carências", "Condições", "Recebida", "Validade", "Observações"];
      const h = ws.addRow(header);
      h.font = { bold: true };
      h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF6" } };
      for (const p of cmp.proposals) {
        for (const pl of p.plans) {
          ws.addRow([
            p.insurerName,
            p.p.version,
            p.p.selectedForPresentation ? "Sim" : "",
            pl.productName,
            pl.network,
            pl.coverage,
            pl.accommodation,
            pl.copay,
            pl.reimbursement,
            pl.monthlyValue,
            pl.currentCost,
            pl.variation,
            pl.variationPct === null ? null : Math.round(pl.variationPct * 100) / 100,
            p.p.commissionPct,
            p.p.adminFeePct,
            pl.waitingPeriods,
            pl.commercialConditions ?? p.p.commercialConditions,
            p.p.receivedAt,
            p.p.validUntil,
            pl.notes ?? p.p.notes,
          ]);
        }
      }
      ws.columns.forEach((c) => (c.width = 16));
      for (const col of [9, 10, 11, 12]) ws.getColumn(col).numFmt = '"R$" #,##0.00';
      await audit({ userId: user.id, action: "download", entityType: "quotation", entityId: id, summary: `${q.code}: comparativo exportado (Excel)` });
      const buf = await wb.xlsx.writeBuffer();
      return new Response(new Uint8Array(buf as ArrayBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="comparativo-${q.code}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    },
    "comparativo",
  );
}
