import { and, asc, desc, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { toCsv, type CsvValue } from "@/lib/csv";
import { CAMPAIGN_STATUS_LABELS, CHANNEL_LABELS, LEAD_SOURCE_LABELS, MEETING_STATUS_LABELS, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS, PRODUCT_LABELS, WON_STAGES, type Channel, type LeadSource, type OpportunityStage } from "@/lib/domain/commercial";
import { PRIORITY_LABELS, TASK_CATEGORY_LABELS, TASK_STATUS_LABELS, type TaskCategory } from "@/lib/domain/constants";
import { addDays, isValidISODate, todayISO } from "@/lib/domain/dates";
import { apiHandler } from "@/server/api-utils";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { campaigns, companies, meetings, opportunities, tasks, users } from "@/server/db/schema";
import { getScope, ownerCond } from "@/server/scope";
import { localToUtc } from "@/server/services/calendar";
import { listCampaigns } from "@/server/services/campaigns";

export const runtime = "nodejs";

const DATASETS = ["oportunidades", "vendas", "reunioes", "tarefas", "campanhas"] as const;
type Dataset = (typeof DATASETS)[number];

const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** Exportação CSV (respeita o escopo do usuário e fica registrada na auditoria). */
export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  const url = new URL(req.url);
  return apiHandler(
    "data:export",
    async (user) => {
      if (!(DATASETS as readonly string[]).includes(dataset)) return NextResponse.json({ error: "Conjunto de dados desconhecido" }, { status: 404 });
      const scope = await getScope(user);
      const today = todayISO();
      const de = url.searchParams.get("de");
      const ate = url.searchParams.get("ate");
      const from = isValidISODate(de) ? de : addDays(today, -365);
      const to = isValidISODate(ate) ? ate : today;
      let header: string[] = [];
      let rows: CsvValue[][] = [];
      const broker = alias(users, "broker");
      switch (dataset as Dataset) {
        case "oportunidades":
        case "vendas": {
          const stage = url.searchParams.get("etapa");
          const conds = [isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId)];
          if (dataset === "vendas") conds.push(inArray(opportunities.stage, WON_STAGES), gte(opportunities.closedAt, localToUtc(from, "00:00")), lt(opportunities.closedAt, localToUtc(addDays(to, 1), "00:00")));
          else if (stage && (OPPORTUNITY_STAGES as readonly string[]).includes(stage)) conds.push(eq(opportunities.stage, stage as OpportunityStage));
          const data = await db
            .select({ o: opportunities, brokerName: broker.name, campaignName: campaigns.name, companyName: companies.legalName })
            .from(opportunities)
            .leftJoin(broker, eq(broker.id, opportunities.brokerId))
            .leftJoin(campaigns, eq(campaigns.id, opportunities.campaignId))
            .leftJoin(companies, eq(companies.id, opportunities.companyId))
            .where(and(...conds))
            .orderBy(desc(opportunities.updatedAt));
          header = ["Cliente", "Empresa cadastrada", "CNPJ/CPF", "Contato", "Telefone", "E-mail", "Produto", "Vidas", "Valor estimado (R$/mês)", "Operadora atual", "Operadoras cotadas", "Corretor", "Assessor", "Comercial", "Origem", "Campanha", "Etapa", "Próximo passo", "Próximo follow-up", "Motivo da perda", "Fechada em", "Criada em"];
          rows = data.map(({ o, brokerName, campaignName, companyName }) => [
            o.clientName,
            companyName,
            o.document,
            o.contactName,
            o.phone,
            o.email,
            PRODUCT_LABELS[o.product],
            o.lives,
            o.estimatedValue,
            o.currentInsurer,
            o.quotedInsurers.join(", "),
            brokerName,
            o.advisorName,
            o.salesRepName,
            LEAD_SOURCE_LABELS[o.source as LeadSource] ?? o.source,
            campaignName,
            OPPORTUNITY_STAGE_LABELS[o.stage],
            o.nextStep,
            br(o.nextFollowupAt),
            o.lostReason,
            o.closedAt ? br(o.closedAt.toISOString()) : "",
            br(o.createdAt.toISOString()),
          ]);
          break;
        }
        case "reunioes": {
          const data = await db
            .select({ m: meetings, ownerName: users.name })
            .from(meetings)
            .leftJoin(users, eq(users.id, meetings.ownerId))
            .where(and(isNull(meetings.deletedAt), ownerCond(scope, meetings.ownerId), gte(meetings.date, from), lte(meetings.date, to)))
            .orderBy(desc(meetings.date));
          header = ["Data", "Início", "Término", "Título", "Cliente", "Empresa", "Assessor", "Comercial", "Responsável", "Status", "Perguntas feitas", "Respostas pendentes", "Local/link", "Objetivo", "Próximos passos", "Ata gerada"];
          rows = data.map(({ m, ownerName }) => [
            br(m.date),
            m.startTime?.slice(0, 5),
            m.endTime?.slice(0, 5),
            m.title,
            m.clientName,
            m.companyName,
            m.advisorName,
            m.salesRepName,
            ownerName,
            MEETING_STATUS_LABELS[m.status],
            `${m.questions.filter((q) => q.asked).length}/${m.questions.length}`,
            m.questions.filter((q) => q.status === "pendente").length,
            m.location,
            m.objective,
            m.actions.map((a) => `${a.text}${a.owner ? ` (${a.owner})` : ""}${a.dueDate ? ` até ${br(a.dueDate)}` : ""}`).join(" | "),
            m.minutesGeneratedAt ? "Sim" : "Não",
          ]);
          break;
        }
        case "tarefas": {
          const data = await db
            .select({ t: tasks, ownerName: users.name, companyName: companies.legalName })
            .from(tasks)
            .leftJoin(users, eq(users.id, tasks.ownerId))
            .leftJoin(companies, eq(companies.id, tasks.companyId))
            .where(and(isNull(tasks.deletedAt), ownerCond(scope, tasks.ownerId)))
            .orderBy(asc(tasks.dueDate))
            .limit(5000);
          header = ["Título", "Categoria", "Prioridade", "Status", "Atrasada", "Prazo", "Data", "Responsável", "Cliente/empresa", "Descrição", "Concluída em"];
          rows = data.map(({ t, ownerName, companyName }) => [
            t.title,
            TASK_CATEGORY_LABELS[t.category as TaskCategory] ?? t.category,
            PRIORITY_LABELS[t.priority],
            TASK_STATUS_LABELS[t.status],
            !!t.dueDate && t.dueDate < today && !["concluida", "cancelada"].includes(t.status),
            br(t.dueDate),
            br(t.scheduledDate),
            ownerName,
            companyName,
            t.description,
            t.completedAt ? br(t.completedAt.toISOString()) : "",
          ]);
          break;
        }
        case "campanhas": {
          const data = await listCampaigns({}, scope);
          header = ["Campanha", "Produto", "Início", "Fim", "Status", "Público-alvo", "Meta", "Meta de leads", "Leads", "Meta de vendas", "Vendas", "Valor vendido (R$/mês)", "Follow-ups pendentes", "Canais", "Responsável", "Resultados"];
          rows = data.map(({ c, ownerName, leads, sales, salesValue, pendingFollowups }) => [
            c.name,
            PRODUCT_LABELS[c.product],
            br(c.startDate),
            br(c.endDate),
            CAMPAIGN_STATUS_LABELS[c.status],
            c.audience,
            c.goal,
            c.goalLeads,
            leads,
            c.goalSales,
            sales,
            salesValue,
            pendingFollowups,
            c.channels.map((ch) => CHANNEL_LABELS[ch as Channel] ?? ch).join(", "),
            ownerName,
            c.results,
          ]);
          break;
        }
      }
      await audit({ userId: user.id, action: "download", entityType: "export", entityId: dataset, summary: `Exportação CSV: ${dataset} (${rows.length} linha(s))` });
      return new NextResponse(toCsv(header, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${dataset}-${today}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    },
    "export",
  );
}
