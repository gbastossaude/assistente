import type { OpportunityRow } from "@/server/services/opportunities";
import type { OpportunityView } from "./board";

export function toOpportunityViews(rows: OpportunityRow[]): OpportunityView[] {
  return rows.map(({ o, brokerName, campaignName, quotationCode }) => ({
    id: o.id,
    clientName: o.clientName,
    companyId: o.companyId,
    document: o.document,
    contactName: o.contactName,
    phone: o.phone,
    email: o.email,
    product: o.product,
    lives: o.lives,
    estimatedValue: o.estimatedValue,
    currentInsurer: o.currentInsurer,
    quotedInsurers: o.quotedInsurers,
    brokerId: o.brokerId,
    brokerName,
    advisorName: o.advisorName,
    salesRepName: o.salesRepName,
    source: o.source,
    campaignId: o.campaignId,
    campaignName,
    stage: o.stage,
    nextStep: o.nextStep,
    nextFollowupAt: o.nextFollowupAt,
    lostReason: o.lostReason,
    quotationId: o.quotationId,
    quotationCode,
    notes: o.notes,
    updatedAt: o.updatedAt.toISOString(),
  }));
}
