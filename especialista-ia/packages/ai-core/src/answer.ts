import {
  detectPromptInjection,
  extractEntities,
  FALLBACK_NO_SOURCE,
  formatDateBR,
  redactSensitive,
  todayISO,
  topicLabel,
  truncate,
  UF_NAMES,
  CONTRACT_TYPE_LABELS,
  type ContractType,
  type ExtractedEntities,
  type UF,
} from "@especialista/shared";
import { buildUserPrompt, SYSTEM_PROMPT, ANSWER_JSON_SCHEMA } from "./prompt.ts";
import { potentialConflictPairs, rankCandidates, selectContext, type Candidate } from "./ranking.ts";
import { evaluateRequiredInfo, missingInfoMessage } from "./required-info.ts";
import { detectOutOfScope, INJECTION_REFUSAL, LEGAL_NOTICE, MEDICAL_REFUSAL } from "./scope.ts";
import {
  AiUnavailableError,
  type AnswerDeps,
  type AnswerInput,
  type AnswerResult,
  type ChatMessage,
  type DetectedInfo,
  type SourceRef,
} from "./types.ts";
import { parseModelAnswer, validateAnswer, type ModelAnswer } from "./validation.ts";

const EXCERPT_CHARS = 600;

function toDetected(e: ExtractedEntities): DetectedInfo {
  return {
    operator_id: e.operatorIds[0] ?? null,
    operator_ids: e.operatorIds,
    product_id: e.productIds[0] ?? null,
    uf: e.uf,
    city: e.city,
    lives: e.lives,
    contract_type: e.contractType,
    cnpj_months: e.cnpjMonths,
    topic: e.topics[0] ?? null,
    topics: e.topics,
  };
}

function summarizeEntities(e: ExtractedEntities, operatorNames: Map<string, string>): string {
  const parts: string[] = [];
  if (e.operatorIds.length) parts.push(`operadora(s): ${e.operatorIds.map((id) => operatorNames.get(id) ?? id).join(", ")}`);
  if (e.uf) parts.push(`estado: ${UF_NAMES[e.uf as UF] ?? e.uf} (${e.uf})`);
  if (e.city) parts.push(`cidade: ${e.city}`);
  if (e.contractType) parts.push(`modalidade: ${CONTRACT_TYPE_LABELS[e.contractType as ContractType] ?? e.contractType}`);
  if (e.lives !== null) parts.push(`vidas: ${e.lives}`);
  if (e.cnpjMonths !== null) parts.push(`tempo de CNPJ: ${e.cnpjMonths} mes(es)`);
  if (e.topics.length) parts.push(`tema: ${e.topics.slice(0, 2).map(topicLabel).join(", ")}`);
  return parts.join("; ");
}

function toSource(c: Candidate, rank: number): SourceRef {
  return {
    rank,
    kind: c.kind,
    document_id: c.document_id,
    version_id: c.version_id,
    chunk_id: c.chunk_id,
    faq_id: c.faq_id,
    title: c.kind === "faq" ? c.title : c.title,
    operator_name: c.operator_name,
    page_from: c.page_from,
    page_to: c.page_to,
    excerpt: truncate(c.content.replace(/\s+/g, " ").trim(), EXCERPT_CHARS),
    score: c.score,
    valid_until: c.valid_until,
    rule_nature: c.rule_nature,
    expired: c.flags.expired || undefined,
  };
}

/** Renumera as citações [n] para a ordem das fontes efetivamente usadas. */
function renumberCitations(text: string, mapping: Map<number, number>): string {
  return text.replace(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, (_m, inner: string) => {
    const nums = inner
      .split(/[,;]/)
      .map((n) => mapping.get(Number(n.trim())))
      .filter((n): n is number => n !== undefined);
    return nums.length ? `[${[...new Set(nums)].sort((a, b) => a - b).join(", ")}]` : "";
  });
}

function sourceWarnings(used: Candidate[], e: ExtractedEntities, nearExpiryDays: number): string[] {
  const w: string[] = [];
  used.forEach((c, i) => {
    const n = i + 1;
    if (c.flags.negotiated) w.push(`A fonte [${n}] é uma condição negociada (exceção) — não aplique como regra geral.`);
    if (c.flags.nearExpiry && c.valid_until)
      w.push(`A fonte [${n}] vence em ${formatDateBR(c.valid_until)} (menos de ${nearExpiryDays} dias). Confirme se há versão nova.`);
    if (c.rule_nature === "procedimento_interno") w.push(`A fonte [${n}] é um procedimento interno da corretora, não uma regra da operadora.`);
  });
  const regional = used.filter((c) => c.flags.regional);
  if (regional.length && !e.uf) {
    const states = [...new Set(regional.flatMap((c) => c.states))].join(", ");
    w.push(`Regra com abrangência regional (${states}). Não aplique a outros estados sem confirmar.`);
  }
  if (used.some((c) => c.flags.scopeUnknown) && !used.some((c) => c.is_national)) {
    w.push("A abrangência geográfica não está informada no documento de origem; confirme a região antes de orientar o cliente.");
  }
  return w;
}

function fallbackResult(base: Omit<AnswerResult, "outcome" | "content" | "sources" | "warnings">, extra: Partial<AnswerResult> = {}): AnswerResult {
  return { ...base, outcome: "sem_fonte", content: FALLBACK_NO_SOURCE, sources: [], warnings: [], ...extra };
}

/**
 * Serviço central de respostas — usado pela extensão, pelo painel e pelo bot do WhatsApp.
 * Nunca inventa: sem documento vigente e relevante, devolve a mensagem padrão de "sem fonte".
 */
export async function answerQuestion(input: AnswerInput, deps: AnswerDeps): Promise<AnswerResult> {
  const t0 = Date.now();
  const now = deps.now?.() ?? new Date();
  const today = todayISO(deps.settings.timeZone, now);
  const s = deps.settings;
  const operatorNames = new Map(deps.catalog.operators.map((o) => [o.id, o.name]));

  const rawText = (input.parentText ? `${input.parentText}\nComplemento informado: ${input.text}` : input.text).slice(
    0,
    s.maxQuestionLength * 2,
  );
  const redaction = redactSensitive(rawText);
  const question = redaction.text;
  const entities = extractEntities(question, deps.catalog, input.context ?? {});

  const base = {
    missing_fields: [] as string[],
    detected: toDetected(entities),
    injection_flag: false,
    pii_redacted: redaction.hasSensitive,
    conflict_document_ids: [] as string[],
    conflict_description: null as string | null,
    confidence: null as number | null,
    provider: null as string | null,
    model: null as string | null,
    retrieval_ms: 0,
    generation_ms: 0,
    total_ms: 0,
  };
  const finish = (r: AnswerResult): AnswerResult => {
    r.total_ms = Date.now() - t0;
    if (redaction.healthContext) {
      r.warnings.push("Lembrete LGPD: não envie dados de saúde identificáveis de clientes; descreva apenas a situação geral.");
    }
    if (redaction.hasSensitive) r.warnings.push("Dados pessoais identificados na pergunta foram removidos antes do processamento.");
    return r;
  };

  // 1. Proteções de entrada
  const injection = detectPromptInjection(rawText);
  if (injection.suspicious && s.blockPromptInjection) {
    deps.logger?.warn("pergunta bloqueada por suspeita de prompt injection", { patterns: injection.matches.length });
    return finish({ ...base, injection_flag: true, outcome: "recusada", content: INJECTION_REFUSAL, sources: [], warnings: [] });
  }
  const outOfScope = detectOutOfScope(question);
  if (outOfScope === "medico") {
    return finish({ ...base, outcome: "recusada", content: MEDICAL_REFUSAL, sources: [], warnings: [] });
  }

  // 2. Informações obrigatórias
  const missing = evaluateRequiredInfo(deps.rules, entities);
  if (missing.fields.length) {
    return finish({ ...base, outcome: "precisa_info", content: missingInfoMessage(missing), sources: [], warnings: [], missing_fields: missing.fields });
  }

  // 3. Recuperação híbrida
  const tr = Date.now();
  let embedding: number[];
  try {
    [embedding] = await deps.embedder.embed([question], "query", { timeoutMs: Math.min(s.requestTimeoutMs, 60_000) });
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    throw new AiUnavailableError("Falha ao gerar embedding da pergunta.", err);
  }
  const searchParams = {
    embedding,
    text: question,
    embeddingModel: s.embeddingModel,
    operatorIds: entities.operatorIds.length ? entities.operatorIds : null,
    includeGeneral: true,
    limit: s.retrievalCandidates,
  };
  const [chunks, faqs] = await Promise.all([
    deps.retriever.searchChunks(searchParams),
    deps.retriever.searchFaq({ ...searchParams, limit: 5 }),
  ]);
  const ranking = rankCandidates(chunks, faqs, {
    entities,
    weights: s.weights,
    today,
    minVectorSimilarity: s.minVectorSimilarity,
    nearExpiryDays: s.nearExpiryDays,
  });
  base.retrieval_ms = Date.now() - tr;

  // 4. Sem fonte vigente
  if (ranking.usable.length === 0) {
    const warnings: string[] = [];
    let content = FALLBACK_NO_SOURCE;
    const expiredDocs = ranking.expired.slice(0, 3);
    if (expiredDocs.length) {
      const list = [...new Map(expiredDocs.map((c) => [c.document_id ?? c.key, c])).values()]
        .map((c) => `"${c.title}" (vigência encerrada em ${formatDateBR(c.valid_until)})`)
        .join("; ");
      content += `\n\nEncontrei apenas documento(s) vencido(s) sobre o assunto: ${list}. Eles não podem ser apresentados como regra atual.`;
      warnings.push("Somente documentos vencidos foram encontrados — a base precisa de atualização.");
    } else if (ranking.regionExcluded.length && entities.uf) {
      const states = [...new Set(ranking.regionExcluded.flatMap((c) => c.states))].join(", ");
      content += `\n\nHá regras cadastradas apenas para outra(s) região(ões) (${states}), que não se aplicam a ${entities.uf}.`;
    } else if (ranking.future.length) {
      content += `\n\nHá documento com vigência futura (a partir de ${formatDateBR(ranking.future[0].valid_from)}), ainda não aplicável.`;
    }
    return finish(
      fallbackResult(base, {
        content,
        warnings,
        sources: expiredDocs.map((c, i) => ({ ...toSource(c, i + 1), expired: true })),
      }),
    );
  }

  // 5. FAQ oficial com alta similaridade: resposta direta e instantânea (sem gerar texto)
  const topFaq = ranking.usable.find((c) => c.kind === "faq");
  if (topFaq && (topFaq.vector_similarity ?? 0) >= s.faqDirectThreshold && !topFaq.flags.otherOperator) {
    const answer = topFaq.content.split("Resposta oficial:")[1]?.trim() ?? topFaq.content;
    const used = [topFaq];
    return finish({
      ...base,
      outcome: "respondida",
      content: `${answer} [1]`,
      sources: used.map((c, i) => toSource(c, i + 1)),
      warnings: sourceWarnings(used, entities, s.nearExpiryDays),
      confidence: Math.min(1, topFaq.vector_similarity ?? 0.9),
      provider: "faq",
      model: null,
    });
  }

  // 6. Geração com o modelo local
  const context = selectContext(ranking.usable, s.maxContextChunks);
  const conflictPairs = potentialConflictPairs(context);
  const notes: string[] = [];
  if (outOfScope === "juridico") notes.push("A pergunta envolve aspecto jurídico: oriente com base nos trechos sem concluir juridicamente.");
  if (ranking.expired.length) notes.push("Documentos vencidos foram excluídos dos trechos.");
  const userPrompt = buildUserPrompt({
    question,
    detectedSummary: summarizeEntities(entities, operatorNames),
    context,
    conflictPairs,
    extraNotes: notes,
  });
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
  const contextTexts = context.map((c) => c.content);
  const tg = Date.now();
  let parsed: ModelAnswer | null = null;
  let issues: string[] = [];
  let model: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await deps.chat.chat(messages, {
      temperature: s.temperature,
      jsonSchema: ANSWER_JSON_SCHEMA as unknown as Record<string, unknown>,
      numCtx: s.numCtx,
      timeoutMs: s.requestTimeoutMs,
    });
    model = res.model;
    parsed = parseModelAnswer(res.content);
    if (!parsed) {
      issues = ["Saída fora do formato JSON solicitado."];
    } else {
      issues = validateAnswer(parsed, contextTexts, question).map((i) => i.detail);
    }
    if (parsed && issues.length === 0) break;
    deps.logger?.warn("resposta do modelo reprovada na validação", { attempt, issues: issues.length });
    messages.push(
      { role: "assistant", content: res.content },
      {
        role: "user",
        content:
          `Sua resposta foi reprovada: ${issues.join(" ")} Corrija: use somente informações dos trechos, cite [n] após cada afirmação ` +
          `e não inclua números que não estejam nos trechos citados. Se os trechos não respondem, use status "sem_fonte". Responda só o JSON.`,
      },
    );
  }
  base.generation_ms = Date.now() - tg;
  base.provider = deps.chat.name;
  base.model = model;

  const related = context.slice(0, 3).map((c, i) => toSource(c, i + 1));
  if (!parsed || issues.length) {
    return finish(
      fallbackResult(base, {
        content: `${FALLBACK_NO_SOURCE}\n\nDocumentos possivelmente relacionados, para conferência manual, estão listados nas fontes.`,
        sources: related,
        warnings: ["A resposta gerada não passou na verificação de fontes e foi descartada."],
      }),
    );
  }
  if (parsed.status === "sem_fonte") return finish(fallbackResult(base));
  if (parsed.status === "precisa_info") {
    const content = parsed.resposta || "Para encontrar a regra correta, preciso de mais informações.";
    return finish({
      ...base,
      outcome: "precisa_info",
      content: parsed.informacoes_faltantes.length && !/•/.test(content)
        ? `${content}\n\nInforme, por favor:\n${parsed.informacoes_faltantes.map((f) => `• ${f}`).join("\n")}`
        : content,
      sources: [],
      warnings: [],
      missing_fields: parsed.informacoes_faltantes,
    });
  }

  // 7. Fontes efetivamente citadas, renumeradas
  const cited = [...new Set([...parsed.fontes, ...[...parsed.resposta.matchAll(/\[(\d+)/g)].map((m) => Number(m[1]))])]
    .filter((n) => n >= 1 && n <= context.length)
    .sort((a, b) => a - b);
  const mapping = new Map(cited.map((n, i) => [n, i + 1]));
  const used = cited.map((n) => context[n - 1]);
  let content = renumberCitations(parsed.resposta, mapping);
  const warnings = sourceWarnings(used, entities, s.nearExpiryDays);
  if (outOfScope === "juridico") warnings.push(LEGAL_NOTICE);

  const sims = used.map((c) => c.vector_similarity ?? 0.5);
  const confidence = Math.round(Math.min(1, sims.reduce((a, b) => a + b, 0) / Math.max(1, sims.length)) * 1000) / 1000;

  if (parsed.status === "conflito") {
    const docIds = [...new Set(used.map((c) => c.document_id).filter((d): d is string => !!d))];
    const description = renumberCitations(parsed.conflito || parsed.resposta, mapping);
    content =
      `⚠️ Encontrei regras divergentes na base de conhecimento e não posso escolher uma delas.\n\n${content}\n\n` +
      "O conflito foi registrado para o administrador. Valide com o responsável pela operadora antes de orientar o cliente.";
    return finish({
      ...base,
      outcome: "conflito",
      content,
      sources: used.map((c, i) => toSource(c, i + 1)),
      warnings,
      conflict_document_ids: docIds.slice(0, 2),
      conflict_description: truncate(description, 1500),
      confidence,
    });
  }

  return finish({
    ...base,
    outcome: "respondida",
    content,
    sources: used.map((c, i) => toSource(c, i + 1)),
    warnings,
    confidence,
  });
}
