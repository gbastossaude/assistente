import { isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { todayISO } from "@/lib/domain/dates";
import { apiHandler } from "@/server/api-utils";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import {
  calendarEvents,
  campaigns,
  companies,
  companyCnpjs,
  contacts,
  currentContractPlans,
  currentContracts,
  insurers,
  libraryItems,
  meetings,
  messageTemplates,
  opportunities,
  opportunityStageHistory,
  quotations,
  renewals,
  tasks,
  users,
} from "@/server/db/schema";

export const runtime = "nodejs";

/**
 * Backup lógico (JSON) dos dados comerciais e operacionais. Por minimização (LGPD), NÃO inclui base de vidas,
 * situações especiais (CID/relatórios médicos), arquivos, senhas nem auditoria. O backup completo do banco
 * deve ser feito pelo PostgreSQL/Supabase (ver docs/DEPLOY.md).
 */
export async function GET() {
  return apiHandler(
    "lgpd:manage",
    async (user) => {
      const [u, cos, cnpjs, cts, contracts, plans, ins, qs, opps, history, mts, camps, lib, tks, evts, rens, tpls] = await Promise.all([
        db.select({ id: users.id, name: users.name, email: users.email, role: users.role, supervisorId: users.supervisorId, active: users.active }).from(users),
        db.select().from(companies).where(isNull(companies.deletedAt)),
        db.select().from(companyCnpjs),
        db.select().from(contacts).where(isNull(contacts.deletedAt)),
        db.select().from(currentContracts).where(isNull(currentContracts.deletedAt)),
        db.select().from(currentContractPlans),
        db.select().from(insurers).where(isNull(insurers.deletedAt)),
        db.select().from(quotations).where(isNull(quotations.deletedAt)),
        db.select().from(opportunities).where(isNull(opportunities.deletedAt)),
        db.select().from(opportunityStageHistory),
        db.select().from(meetings).where(isNull(meetings.deletedAt)),
        db.select().from(campaigns).where(isNull(campaigns.deletedAt)),
        db.select().from(libraryItems).where(isNull(libraryItems.deletedAt)),
        db.select().from(tasks).where(isNull(tasks.deletedAt)),
        db.select().from(calendarEvents).where(isNull(calendarEvents.deletedAt)),
        db.select().from(renewals).where(isNull(renewals.deletedAt)),
        db.select().from(messageTemplates),
      ]);
      const payload = {
        formato: "besmart-backup",
        versao: 1,
        geradoEm: new Date().toISOString(),
        observacao: "Backup lógico sem dados de saúde (base de vidas, CID, relatórios médicos) e sem arquivos/senhas.",
        dados: {
          usuarios: u,
          empresas: cos,
          cnpjs,
          contatos: cts,
          contratosAtuais: contracts,
          planosDosContratos: plans,
          operadoras: ins,
          cotacoes: qs,
          oportunidades: opps,
          historicoEtapas: history,
          reunioes: mts,
          campanhas: camps,
          biblioteca: lib,
          tarefas: tks,
          agenda: evts,
          renovacoes: rens,
          templatesMensagens: tpls,
        },
      };
      await audit({ userId: user.id, action: "download", entityType: "backup", summary: "Backup JSON exportado (dados comerciais, sem dados de saúde)", sensitive: true });
      return new NextResponse(JSON.stringify(payload, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="besmart-backup-${todayISO()}.json"`, "Cache-Control": "private, no-store" },
      });
    },
    "backup",
  );
}
