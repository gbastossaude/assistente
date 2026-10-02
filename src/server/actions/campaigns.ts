"use server";
import { z } from "zod";
import { CAMPAIGN_STATUSES } from "@/lib/domain/commercial";
import { campaignSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { saveCampaign, setCampaignStatus, softDeleteCampaign } from "../services/campaigns";

export async function saveCampaignAction(id: string | null, input: unknown) {
  return runAction("campaign:write", (u) => saveCampaign(id, parseInput(campaignSchema, input), u), { message: "Campanha salva" });
}
export async function setCampaignStatusAction(id: string, status: unknown) {
  return runAction("campaign:write", (u) => setCampaignStatus(id, parseInput(z.enum(CAMPAIGN_STATUSES), status), u), { message: "Status da campanha atualizado" });
}
export async function deleteCampaignAction(id: string) {
  return runAction("campaign:write", (u) => softDeleteCampaign(id, u), { message: "Campanha excluída" });
}
