import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  buildEditorialCalendar,
  EDITORIAL_PILLAR_HINTS,
  EDITORIAL_PILLAR_LABELS,
  EDITORIAL_PLATFORM_LABELS,
  POSTING_FREQUENCY_LABELS,
  type EditorialCalendar,
  type EditorialInput,
} from "@/lib/domain/editorial-calendar";
import { formatDateBR } from "@/lib/domain/dates";
import { logTechnicalError } from "../errors";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export interface EditorialResult {
  calendar: EditorialCalendar;
  mode: "claude" | "local";
  note?: string;
}

const SYSTEM = `Você é um estrategista de conteúdo que cria calendários editoriais para marcas e profissionais. Você sabe que consistência vence criatividade aleatória, e que um bom calendário equilibra 4 pilares: educar, entreter, conectar e vender.
Escreva em português do Brasil. Os dias, pilares e formatos de cada post já foram definidos pelo sistema (respeitando a distribuição 50% educativo, 20% conexão, 15% venda, 15% engajamento) — não os altere: escreva um tema, um resumo de legenda de exatamente 2 frases e um CTA para cada um, coerentes com o nicho, o público, os objetivos e as datas especiais informadas.
Regras: não repita temas; posts de venda são indiretos fora da semana de lançamento; não invente números, preços, depoimentos ou resultados (use "exemplo ilustrativo" quando precisar); em planos de saúde, lembre que as condições variam por operadora, contrato, região e análise; não use dados pessoais de clientes.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: { day: { type: "integer" }, theme: { type: "string" }, caption: { type: "string" }, cta: { type: "string" } },
        required: ["day", "theme", "caption", "cta"],
        additionalProperties: false,
      },
    },
    weeks: {
      type: "array",
      items: { type: "object", properties: { week: { type: "integer" }, focus: { type: "string" }, goal: { type: "string" } }, required: ["week", "focus", "goal"], additionalProperties: false },
    },
    stories: { type: "array", items: { type: "string" } },
    reels: { type: "array", items: { type: "string" } },
    schedulingTips: { type: "array", items: { type: "string" } },
  },
  required: ["posts", "weeks", "stories", "reels", "schedulingTips"],
  additionalProperties: false,
};

const text = (max: number) => z.string().trim().min(1).max(max);
const outputSchema = z.object({
  posts: z.array(z.object({ day: z.number().int(), theme: text(200), caption: text(600), cta: text(160) })),
  weeks: z.array(z.object({ week: z.number().int().min(1).max(4), focus: text(120), goal: text(400) })).length(4),
  stories: z.array(text(300)).min(5),
  reels: z.array(text(300)).min(3),
  schedulingTips: z.array(text(300)).min(1).max(8),
});

function brief(input: EditorialInput, base: EditorialCalendar) {
  const slots = base.posts.map((p) => ({ day: p.day, data: formatDateBR(p.date), dia_semana: p.weekday, semana: p.week, pilar: EDITORIAL_PILLAR_LABELS[p.pillar], formato: p.format, data_especial: p.occasion, venda_de_lancamento: p.launch }));
  return [
    `Nicho/Área: ${input.niche}`,
    `Plataforma principal: ${EDITORIAL_PLATFORM_LABELS[input.platform]}`,
    `Público-alvo: ${input.audience}`,
    `Frequência de postagem: ${POSTING_FREQUENCY_LABELS[input.frequency]}`,
    `Pilares de conteúdo do usuário: ${input.pillars || "não definidos (use os 4 pilares da regra)"}`,
    `Pilares da regra: ${Object.entries(EDITORIAL_PILLAR_HINTS).map(([k, v]) => `${EDITORIAL_PILLAR_LABELS[k as keyof typeof EDITORIAL_PILLAR_LABELS]} (${v})`).join(", ")}`,
    `Objetivos do mês: ${input.objectives || "não informados"}`,
    `Produto/serviço que vende: ${input.product || "não informado"}`,
    `Semana de lançamento: ${input.launchWeek ? `semana ${input.launchWeek}` : "sem lançamento"}`,
    `Datas importantes: ${input.importantDates?.replace(/\s*\n\s*/g, "; ") || "nenhuma"}`,
    "",
    `Posts definidos (${slots.length}) — devolva um item em "posts" para cada "day", na mesma ordem:`,
    JSON.stringify(slots),
    "",
    "Entregue também: resumo das 4 semanas (foco e objetivo), 5 ideias de Stories diários recorrentes, 3 ideias de Reels para o mês e dicas de horário para publicar no nicho e na plataforma.",
  ].join("\n");
}

async function claudeCalendar(input: EditorialInput, base: EditorialCalendar): Promise<EditorialCalendar | null> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: brief(input, base) }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const raw = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = outputSchema.safeParse(json);
  if (!parsed.success) return null;
  const byDay = new Map(parsed.data.posts.map((p) => [p.day, p]));
  // Só aceita se cobrir exatamente os dias planejados; pilares, formatos e datas continuam os do sistema.
  if (byDay.size !== base.posts.length || base.posts.some((p) => !byDay.has(p.day))) return null;
  return {
    ...base,
    posts: base.posts.map((p) => {
      const c = byDay.get(p.day)!;
      return { ...p, theme: c.theme, caption: c.caption, cta: c.cta };
    }),
    weeks: [...parsed.data.weeks].sort((a, b) => a.week - b.week),
    stories: parsed.data.stories.slice(0, 5),
    reels: parsed.data.reels.slice(0, 3),
    schedulingTips: parsed.data.schedulingTips,
  };
}

/** Gera o calendário: com Claude quando há chave; senão (ou em caso de falha), pelo banco de temas local. */
export async function generateEditorialCalendar(input: EditorialInput): Promise<EditorialResult> {
  const base = buildEditorialCalendar(input);
  if (!process.env.ANTHROPIC_API_KEY) return { calendar: base, mode: "local" };
  try {
    const calendar = await claudeCalendar(input, base);
    if (calendar) return { calendar, mode: "claude" };
    return { calendar: base, mode: "local", note: "A resposta da IA veio incompleta — calendário gerado pelo modelo local." };
  } catch (e) {
    if (!(e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError)) throw e;
    logTechnicalError("editorial-claude", e);
    return { calendar: base, mode: "local", note: "Claude indisponível no momento — calendário gerado pelo modelo local." };
  }
}
