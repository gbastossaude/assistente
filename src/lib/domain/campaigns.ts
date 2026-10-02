/** Regras puras de campanhas: marcos de lembrete, progresso e sugestão de campanha. */
import { CHANNEL_LABELS, PRODUCT_LABELS, type Channel, type Product } from "./commercial";
import { addDays, diffDays, formatDateBR } from "./dates";

export type CampaignMilestoneKey = "inicio" | "meio" | "reta_final" | "encerramento";
export const CAMPAIGN_MILESTONE_LABELS: Record<CampaignMilestoneKey, string> = {
  inicio: "Início da campanha",
  meio: "Meio da campanha",
  reta_final: "Últimos dias",
  encerramento: "Encerramento — registrar resultado",
};

/** Datas dos marcos de lembrete. Reta final = 3 dias antes do fim (ou o meio, se a campanha for curta). */
export function campaignMilestones(startDate: string, endDate: string): { key: CampaignMilestoneKey; date: string }[] {
  const len = Math.max(0, diffDays(startDate, endDate));
  const mid = addDays(startDate, Math.floor(len / 2));
  const lastDays = len >= 6 ? addDays(endDate, -3) : mid;
  const out: { key: CampaignMilestoneKey; date: string }[] = [{ key: "inicio", date: startDate }];
  if (len >= 2) out.push({ key: "meio", date: mid });
  if (len >= 6) out.push({ key: "reta_final", date: lastDays });
  out.push({ key: "encerramento", date: endDate });
  return out;
}

/** Marco que vale para hoje (o mais recente já atingido), para lembrete único por marco. */
export function currentMilestone(startDate: string, endDate: string, today: string) {
  const reached = campaignMilestones(startDate, endDate).filter((m) => m.date <= today);
  return reached.length ? reached[reached.length - 1] : null;
}

export function campaignProgress(startDate: string, endDate: string, today: string): number {
  const len = diffDays(startDate, endDate);
  if (len <= 0) return today >= endDate ? 100 : 0;
  const done = diffDays(startDate, today);
  return Math.max(0, Math.min(100, Math.round((done / len) * 100)));
}

export function milestoneMessage(key: CampaignMilestoneKey, c: { name: string; endDate: string }, stats: { leads: number; pendingFollowups: number; goalLeads?: number | null }): { title: string; body: string } {
  const goal = stats.goalLeads ? ` de ${stats.goalLeads}` : "";
  switch (key) {
    case "inicio":
      return { title: `Campanha iniciada: ${c.name}`, body: `Divulgue nos canais definidos e registre os leads com origem “Campanha”. Término em ${formatDateBR(c.endDate)}.` };
    case "meio":
      return { title: `Meio da campanha ${c.name}`, body: `${stats.leads}${goal} lead(s) gerado(s) até agora · ${stats.pendingFollowups} follow-up(s) pendente(s). Hora de reforçar a divulgação.` };
    case "reta_final":
      return { title: `Últimos dias da campanha ${c.name}`, body: `Termina em ${formatDateBR(c.endDate)} · ${stats.leads}${goal} lead(s) · ${stats.pendingFollowups} follow-up(s) pendente(s). Priorize fechamentos.` };
    case "encerramento":
      return { title: `Campanha ${c.name} encerrada`, body: `${stats.leads} lead(s) gerado(s). Registre o resultado final e finalize a campanha.` };
  }
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Sugestão de campanha para um produto no mês informado (YYYY-MM) — usada pelo assistente. */
export function suggestCampaign(product: Product, month: string, focus: "empresarial" | "pme" | "pf" = "empresarial") {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const prod = PRODUCT_LABELS[product];
  const audienceBy = {
    empresarial: "Empresas de 30 a 300 vidas com plano atual há mais de 12 meses (reajuste próximo)",
    pme: "Pequenas e médias empresas (2 a 29 vidas), MEI e sócios",
    pf: "Famílias e profissionais autônomos sem plano ou insatisfeitos com o atual",
  } as const;
  const channels: Channel[] = focus === "pf" ? ["whatsapp", "instagram", "indicacao"] : ["whatsapp", "email", "linkedin", "telefone"];
  const label = focus === "pme" ? "PME" : focus === "pf" ? "Pessoa Física" : "Empresarial";
  return {
    name: `${prod} ${label} — ${MONTHS[m - 1]}/${y}`,
    product,
    startDate: start,
    endDate: end,
    audience: audienceBy[focus],
    goal: "Gerar oportunidades qualificadas e reuniões de diagnóstico",
    goalLeads: focus === "pf" ? 40 : 20,
    goalSales: focus === "pf" ? 8 : 4,
    channels,
    mainMessage:
      focus === "pf"
        ? `Plano de saúde com a rede que você precisa e valor que cabe no bolso. Em ${MONTHS[m - 1]}, faça uma análise gratuita com a BeSmart e compare as principais operadoras.`
        : `Sua empresa está pagando caro no plano de saúde? Em ${MONTHS[m - 1]}, a BeSmart faz um diagnóstico gratuito do contrato atual e compara as principais operadoras — redução de custo sem perder rede.`,
    channelsLabel: channels.map((c) => CHANNEL_LABELS[c]).join(", "),
  };
}
