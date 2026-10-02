import type { campaigns } from "@/server/db/schema";
import type { CampaignFormValue } from "./campaign-dialog";

const n = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

export function campaignToForm(c: typeof campaigns.$inferSelect): CampaignFormValue {
  return {
    id: c.id,
    name: c.name,
    product: c.product,
    startDate: c.startDate,
    endDate: c.endDate,
    audience: c.audience ?? "",
    goal: c.goal ?? "",
    goalLeads: n(c.goalLeads),
    goalSales: n(c.goalSales),
    goalValue: n(c.goalValue),
    mainMessage: c.mainMessage ?? "",
    channels: c.channels,
    ownerId: c.ownerId ?? "",
    responsibles: c.responsibles ?? "",
    status: c.status,
    remindersEnabled: c.remindersEnabled,
    results: c.results ?? "",
  };
}
