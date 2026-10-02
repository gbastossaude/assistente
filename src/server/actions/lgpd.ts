"use server";
import { z } from "zod";
import { anonymizeSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { anonymizeSubject, findDataSubject } from "../services/lgpd";

export async function findDataSubjectAction(term: unknown) {
  return runAction("lgpd:manage", (u) => {
    void u;
    return findDataSubject(parseInput(z.string().max(200), term));
  }, { revalidate: [] });
}
export async function anonymizeSubjectAction(input: unknown) {
  return runAction("lgpd:manage", (u) => anonymizeSubject(parseInput(anonymizeSchema, input), u), { message: "Dados anonimizados" });
}
