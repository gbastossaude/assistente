"use server";
import { editorialCalendarSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { generateEditorialCalendar } from "../services/editorial";

export async function generateEditorialCalendarAction(input: unknown) {
  return runAction("content:write", () => generateEditorialCalendar(parseInput(editorialCalendarSchema, input)), { message: "Calendário gerado", revalidate: [], context: "editorial-calendar" });
}
