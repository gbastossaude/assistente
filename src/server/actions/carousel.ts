"use server";
import { carouselBriefSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { generateCarousel } from "../services/carousel";

export async function generateCarouselAction(input: unknown) {
  return runAction("content:write", () => generateCarousel(parseInput(carouselBriefSchema, input)), { message: "Carrossel gerado", revalidate: [], context: "carousel" });
}
