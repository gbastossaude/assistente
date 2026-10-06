import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  buildCarousel,
  CAROUSEL_LIMITS,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_MIN_SLIDES,
  carouselMarkdown,
  findTemplate,
  normalizeKeyword,
  type Carousel,
  type CarouselBrief,
  type CarouselSlide,
  type SlideKind,
} from "@/lib/domain/instagram-carousel";
import { logTechnicalError } from "../errors";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export interface CarouselResult {
  carousel: Carousel;
  mode: "claude" | "local";
  note?: string;
}

const SYSTEM = `Você é um redator de carrosséis para Instagram de uma corretora de planos de saúde. Um bom carrossel prende na capa, entrega uma ideia por slide e termina com um CTA de palavra-chave nos comentários.
Escreva em português do Brasil, com frases curtas e diretas, para ler no celular. A estrutura já foi definida pelo sistema: o slide 1 é a capa, o último é o CTA e os do meio são de conteúdo — devolva exatamente essa quantidade, nessa ordem.
Campos de cada slide: eyebrow (rótulo de 1 a 3 palavras), title (título curto, até 5 palavras, aparece em caixa alta), highlight (continuação do título em itálico, até 6 palavras), body (texto corrido), bullets (lista de 2 a 4 itens curtos, só em slides de conteúdo; use body OU bullets) e keyword (só no CTA: uma palavra em caixa alta, sem espaços, que a pessoa comenta para receber o material no direct; nos outros slides, vazio).
Limites de caracteres: eyebrow ${CAROUSEL_LIMITS.eyebrow}, title ${CAROUSEL_LIMITS.title}, highlight ${CAROUSEL_LIMITS.highlight}, body ${CAROUSEL_LIMITS.body} (prefira até 200), cada item de bullets ${CAROUSEL_LIMITS.bullet} (prefira até 70), keyword ${CAROUSEL_LIMITS.keyword}. A legenda (caption) tem até 1.500 caracteres, repete a palavra-chave do CTA e termina com 3 a 5 hashtags.
Regras: não invente números, preços, depoimentos, nomes de operadoras ou resultados; em planos de saúde, lembre na legenda que as condições variam por operadora, contrato, região e análise; não use dados pessoais de clientes; não use emojis nos slides; não escreva texto entre colchetes.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          eyebrow: { type: "string" },
          title: { type: "string" },
          highlight: { type: "string" },
          body: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          keyword: { type: "string" },
        },
        required: ["eyebrow", "title", "highlight", "body", "bullets", "keyword"],
        additionalProperties: false,
      },
    },
    caption: { type: "string" },
  },
  required: ["slides", "caption"],
  additionalProperties: false,
};

const text = (max: number) => z.string().trim().max(max);
const outputSchema = z.object({
  slides: z.array(
    z.object({
      eyebrow: text(CAROUSEL_LIMITS.eyebrow),
      title: text(CAROUSEL_LIMITS.title).min(1),
      highlight: text(CAROUSEL_LIMITS.highlight),
      body: text(CAROUSEL_LIMITS.body),
      bullets: z.array(text(CAROUSEL_LIMITS.bullet)).max(CAROUSEL_LIMITS.bullets),
      keyword: text(CAROUSEL_LIMITS.keyword),
    }),
  ),
  caption: text(CAROUSEL_LIMITS.caption).min(1),
});

/** Estrutura pedida: capa, conteúdos e CTA (o Claude respeita a quantidade escolhida, mesmo com modelo pronto). */
function structure(input: CarouselBrief): SlideKind[] {
  const count = Math.min(CAROUSEL_MAX_SLIDES, Math.max(CAROUSEL_MIN_SLIDES, Math.round(input.slideCount)));
  return ["capa", ...Array.from({ length: count - 2 }, () => "conteudo" as const), "cta"];
}

function brief(input: CarouselBrief, kinds: SlideKind[], base: Carousel) {
  const template = findTemplate(input.topic);
  return [
    `Tema: ${input.topic}`,
    `Público-alvo: ${input.audience || "sócios, RH e gestores de empresas e famílias que querem pagar menos sem perder rede"}`,
    `Perfil: ${[input.brand, input.handle].filter(Boolean).join(" · ") || "não informado"}`,
    `Palavra-chave do CTA: ${input.keyword ? normalizeKeyword(input.keyword) : "escolha uma curta e ligada ao tema"}`,
    `Estrutura (${kinds.length} slides): ${kinds.map((k, i) => `${i + 1}=${k}`).join(", ")}`,
    ...(template ? ["", "Roteiro de referência da corretora sobre esse tema (use como base factual; pode reescrever, reorganizar e completar):", carouselMarkdown({ ...base, caption: "" })] : []),
  ].join("\n");
}

async function claudeCarousel(input: CarouselBrief, base: Carousel): Promise<Carousel | null> {
  const kinds = structure(input);
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: brief(input, kinds, base) }],
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
  if (!parsed.success || parsed.data.slides.length !== kinds.length) return null;
  const slides: CarouselSlide[] = kinds.map((kind, i) => {
    const s = parsed.data.slides[i];
    return {
      kind,
      eyebrow: s.eyebrow,
      title: s.title,
      highlight: s.highlight,
      body: s.body,
      bullets: kind === "conteudo" ? s.bullets.filter(Boolean) : [],
      keyword: kind === "cta" ? normalizeKeyword(s.keyword).replace(/\s+/g, "") : "",
    };
  });
  const cta = slides[slides.length - 1];
  // a palavra-chave pedida pelo usuário prevalece; sem ela, a do Claude (ou a do modelo local)
  cta.keyword = (input.keyword && normalizeKeyword(input.keyword)) || cta.keyword || base.slides[base.slides.length - 1].keyword;
  return { ...base, slides, caption: parsed.data.caption };
}

/** Gera o carrossel: com Claude quando há chave; senão (ou em caso de falha), pelo modelo local. */
export async function generateCarousel(input: CarouselBrief): Promise<CarouselResult> {
  const base = buildCarousel(input);
  const template = findTemplate(input.topic);
  const capped = template && base.slides.length < structure(input).length ? `O modelo pronto “${template.label}” tem ${base.slides.length} slides — use “Slide de conteúdo” para acrescentar mais.` : undefined;
  if (!process.env.ANTHROPIC_API_KEY) return { carousel: base, mode: "local", note: capped };
  try {
    const carousel = await claudeCarousel(input, base);
    if (carousel) return { carousel, mode: "claude" };
    return { carousel: base, mode: "local", note: "A resposta da IA veio incompleta — carrossel montado pelo modelo local." };
  } catch (e) {
    if (!(e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError)) throw e;
    logTechnicalError("carousel-claude", e);
    return { carousel: base, mode: "local", note: "Claude indisponível no momento — carrossel montado pelo modelo local." };
  }
}
