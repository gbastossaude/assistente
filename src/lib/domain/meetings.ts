/**
 * Ficha de reunião com cliente (seção 6 do prompt mestre): roteiro de perguntas com marcação,
 * e geração automática de ata, pendências, próximos passos e mensagem de follow-up.
 * Funções puras — testadas em tests/unit/meetings.test.ts.
 */
import type { AnswerStatus } from "./commercial";
import { formatDateBR } from "./dates";

export interface MeetingQuestion {
  key: string;
  text: string;
  asked: boolean;
  status: AnswerStatus;
  answer: string;
  note: string;
}

export interface MeetingAction {
  text: string;
  owner: string;
  dueDate: string | null;
  done: boolean;
}

/** Roteiro padrão de diagnóstico para cotação de plano de saúde. */
export const DEFAULT_MEETING_QUESTIONS: { key: string; text: string }[] = [
  { key: "objetivo", text: "Qual o objetivo principal da cotação?" },
  { key: "possui_plano", text: "O cliente possui plano atualmente?" },
  { key: "operadora_atual", text: "Qual a operadora atual?" },
  { key: "valor_atual", text: "Qual o valor pago atualmente?" },
  { key: "vidas", text: "Quantas vidas serão cotadas?" },
  { key: "dependentes", text: "Existem dependentes?" },
  { key: "acomodacao", text: "Qual tipo de acomodação desejada?" },
  { key: "coparticipacao", text: "Deseja coparticipação?" },
  { key: "regiao", text: "Qual região precisa de atendimento?" },
  { key: "rede_preferida", text: "Existe hospital ou rede preferida?" },
  { key: "prazo_decisao", text: "Qual o prazo para decisão?" },
  { key: "concorrente", text: "Existe alguma proposta concorrente?" },
  { key: "decisor", text: "Quem decide a contratação?" },
  { key: "problema_atual", text: "Qual o maior problema com o plano atual?" },
  { key: "foco", text: "O cliente busca reduzir custo, melhorar rede ou ambos?" },
  { key: "cross_sell", text: "Existe interesse em dental, vida, benefícios ou outros produtos?" },
  { key: "docs_pendentes", text: "Quais documentos ainda estão pendentes?" },
];

export function defaultQuestions(): MeetingQuestion[] {
  return DEFAULT_MEETING_QUESTIONS.map((q) => ({ ...q, asked: false, status: "nao_marcada", answer: "", note: "" }));
}

export interface MeetingForMinutes {
  title: string;
  clientName: string | null;
  companyName: string | null;
  advisorName: string | null;
  salesRepName: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  participants: string | null;
  location: string | null;
  objective: string | null;
  summary: string | null;
  questions: MeetingQuestion[];
  actions: MeetingAction[];
}

export interface MeetingOutputs {
  minutes: string;
  pendencies: string[];
  nextSteps: string[];
  whatsapp: string;
  /** Sugestão de tarefa de retorno (título e prazo). */
  followupTask: { title: string; dueDate: string };
}

const t5 = (s: string | null) => (s ? s.slice(0, 5) : "");
const firstName = (s: string | null) => (s ?? "").trim().split(/\s+/)[0] ?? "";

/** Pendências: perguntas com resposta pendente, perguntas não feitas e ações abertas. */
export function meetingPendencies(m: Pick<MeetingForMinutes, "questions" | "actions">): string[] {
  const out: string[] = [];
  for (const q of m.questions) {
    if (q.status === "pendente") out.push(`Aguardando resposta: ${q.text}${q.note ? ` (${q.note})` : ""}`);
  }
  for (const q of m.questions) {
    if (!q.asked && q.status === "nao_marcada") out.push(`Pergunta não feita: ${q.text}`);
  }
  for (const a of m.actions) {
    if (!a.done && a.text.trim()) out.push(`Ação em aberto: ${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.dueDate ? ` (até ${formatDateBR(a.dueDate)})` : ""}`);
  }
  return out;
}

/** Gera ata, pendências, próximos passos, WhatsApp de follow-up e sugestão de tarefa de retorno. */
export function buildMeetingOutputs(m: MeetingForMinutes, opts: { consultant: string; today: string; followupDays?: number }): MeetingOutputs {
  const who = m.companyName ? `${m.clientName ? `${m.clientName} — ` : ""}${m.companyName}` : (m.clientName ?? "cliente");
  const answered = m.questions.filter((q) => q.status === "recebida" && q.answer.trim());
  const pendencies = meetingPendencies(m);
  const openActions = m.actions.filter((a) => !a.done && a.text.trim());
  const nextSteps = openActions.length
    ? openActions.map((a) => `${a.text}${a.owner ? ` — responsável: ${a.owner}` : ""}${a.dueDate ? ` — prazo: ${formatDateBR(a.dueDate)}` : ""}`)
    : [
        ...(m.questions.some((q) => q.status === "pendente") ? ["Obter as respostas pendentes com o cliente"] : []),
        ...(m.questions.find((q) => q.key === "docs_pendentes" && q.answer.trim()) ? ["Receber os documentos pendentes e conferir"] : []),
        "Montar e enviar o estudo/cotação conforme o diagnóstico",
        "Agendar retorno para apresentar as opções",
      ];

  const lines: string[] = [];
  lines.push(`ATA DE REUNIÃO — ${m.title}`);
  lines.push(`Cliente: ${who}`);
  lines.push(`Data: ${formatDateBR(m.date)}${m.startTime ? ` · ${t5(m.startTime)}${m.endTime ? `–${t5(m.endTime)}` : ""}` : ""}${m.location ? ` · ${m.location}` : ""}`);
  const team = [m.advisorName && `Assessor: ${m.advisorName}`, m.salesRepName && `Comercial: ${m.salesRepName}`].filter(Boolean).join(" · ");
  if (team) lines.push(team);
  if (m.participants?.trim()) lines.push(`Participantes: ${m.participants.trim()}`);
  if (m.objective?.trim()) lines.push(`\nObjetivo: ${m.objective.trim()}`);
  if (m.summary?.trim()) lines.push(`\nResumo: ${m.summary.trim()}`);
  if (answered.length) {
    lines.push("\nDiagnóstico (respostas do cliente):");
    for (const q of answered) lines.push(`• ${q.text} ${q.answer.trim()}${q.note.trim() ? ` (obs.: ${q.note.trim()})` : ""}`);
  }
  if (pendencies.length) {
    lines.push("\nPendências:");
    for (const p of pendencies) lines.push(`• ${p}`);
  }
  lines.push("\nPróximos passos:");
  for (const s of nextSteps) lines.push(`• ${s}`);

  const pendingAnswers = m.questions.filter((q) => q.status === "pendente");
  const wa: string[] = [];
  wa.push(`Olá${firstName(m.clientName) ? `, ${firstName(m.clientName)}` : ""}! Tudo bem?`);
  wa.push(`Obrigado pela reunião de ${formatDateBR(m.date)}${m.companyName ? ` sobre o plano da ${m.companyName}` : ""}. Segue o resumo dos próximos passos:`);
  for (const s of nextSteps.slice(0, 5)) wa.push(`✅ ${s}`);
  if (pendingAnswers.length) {
    wa.push("\nPara avançarmos, ficaram pendentes:");
    for (const q of pendingAnswers.slice(0, 6)) wa.push(`• ${q.text}`);
  }
  wa.push(`\nQualquer dúvida, estou à disposição. — ${opts.consultant}`);

  const days = opts.followupDays ?? 2;
  const [y, mo, d] = opts.today.split("-").map(Number);
  const due = new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
  return {
    minutes: lines.join("\n"),
    pendencies,
    nextSteps,
    whatsapp: wa.join("\n"),
    followupTask: { title: `Retorno pós-reunião — ${m.companyName ?? m.clientName ?? m.title}`, dueDate: due },
  };
}
