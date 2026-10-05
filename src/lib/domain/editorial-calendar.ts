/**
 * Calendário editorial de 30 dias para redes sociais (regras puras): dias de postagem pela frequência,
 * distribuição por pilar (50% educativo · 20% conexão · 15% venda · 15% engajamento), formatos por
 * plataforma, temas com legenda resumida e CTA, resumo semanal, ideias de Stories/Reels e horários.
 * O modo local usa um banco de temas (planos de saúde ou genérico); com Claude, o serviço reescreve os
 * temas mantendo os mesmos dias, pilares e formatos calculados aqui.
 */
import { addDays, formatDateBR, isValidISODate } from "./dates";

export const EDITORIAL_DAYS = 30;

export const EDITORIAL_PILLARS = ["educativo", "conexao", "venda", "engajamento"] as const;
export type EditorialPillar = (typeof EDITORIAL_PILLARS)[number];
export const EDITORIAL_PILLAR_LABELS: Record<EditorialPillar, string> = { educativo: "Educativo", conexao: "Conexão", venda: "Venda", engajamento: "Engajamento" };
/** Regra de distribuição (percentual de posts por pilar). */
export const EDITORIAL_PILLAR_SHARE: Record<EditorialPillar, number> = { educativo: 50, conexao: 20, venda: 15, engajamento: 15 };
export const EDITORIAL_PILLAR_HINTS: Record<EditorialPillar, string> = {
  educativo: "valor, dicas, tutoriais",
  conexao: "bastidores, storytelling, opinião",
  venda: "produto, oferta, prova social",
  engajamento: "enquete, pergunta, interação",
};

export const EDITORIAL_PLATFORMS = ["instagram", "linkedin", "tiktok", "facebook", "youtube"] as const;
export type EditorialPlatform = (typeof EDITORIAL_PLATFORMS)[number];
export const EDITORIAL_PLATFORM_LABELS: Record<EditorialPlatform, string> = { instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube" };

export const POSTING_FREQUENCIES = ["diaria", "5x_semana", "3x_semana"] as const;
export type PostingFrequency = (typeof POSTING_FREQUENCIES)[number];
export const POSTING_FREQUENCY_LABELS: Record<PostingFrequency, string> = { diaria: "1x por dia", "5x_semana": "5x por semana (seg a sex)", "3x_semana": "3x por semana (seg, qua, sex)" };
const POSTING_WEEKDAYS: Record<PostingFrequency, number[]> = { diaria: [0, 1, 2, 3, 4, 5, 6], "5x_semana": [1, 2, 3, 4, 5], "3x_semana": [1, 3, 5] };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export interface EditorialInput {
  /** Primeiro dia do calendário (AAAA-MM-DD); o plano cobre 30 dias corridos. */
  startDate: string;
  niche: string;
  platform: EditorialPlatform;
  audience: string;
  frequency: PostingFrequency;
  /** Pilares próprios (texto livre) — usados como contexto; a distribuição segue os 4 pilares da regra. */
  pillars: string | null;
  objectives: string | null;
  product: string | null;
  /** Semana do lançamento (1 a 4) ou 0 quando não há lançamento no mês. */
  launchWeek: number;
  /** Uma data por linha: "dd/mm Descrição". */
  importantDates: string | null;
}

export interface EditorialSlot {
  /** Dia do calendário (1 a 30). */
  day: number;
  date: string;
  weekday: string;
  /** Semana 1 a 4 (os dias 29 e 30 entram na semana 4). */
  week: number;
  pillar: EditorialPillar;
  format: string;
  /** Data importante que cai no dia do post. */
  occasion: string | null;
  /** Post de venda dentro da semana de lançamento. */
  launch: boolean;
}

export interface EditorialPost extends EditorialSlot {
  theme: string;
  caption: string;
  cta: string;
}

export interface EditorialWeek {
  week: number;
  focus: string;
  goal: string;
}

export interface EditorialCalendar {
  posts: EditorialPost[];
  weeks: EditorialWeek[];
  stories: string[];
  reels: string[];
  schedulingTips: string[];
  distribution: { pillar: EditorialPillar; count: number; pct: number }[];
  /** Datas importantes que caem em dia sem post (sugestão: tratar nos Stories). */
  offDayOccasions: { date: string; label: string }[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Nicho de planos de saúde/benefícios → banco de temas específico; senão, banco genérico. */
export function isHealthNiche(niche: string) {
  return /(saude|plano|odonto|dental|operadora|beneficio|seguro|corretor)/.test(norm(niche));
}

/** Primeiro dia do próximo mês — início padrão do calendário. */
export function defaultEditorialStart(today: string) {
  const [y, m] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const weekOfDay = (day: number) => Math.min(4, Math.floor((day - 1) / 7) + 1);

/** Dias de postagem na janela de 30 dias, conforme a frequência. */
export function postingDays(startDate: string, frequency: PostingFrequency): { day: number; date: string }[] {
  const allowed = POSTING_WEEKDAYS[frequency];
  const out: { day: number; date: string }[] = [];
  for (let i = 0; i < EDITORIAL_DAYS; i++) {
    const date = addDays(startDate, i);
    if (allowed.includes(weekdayOf(date))) out.push({ day: i + 1, date });
  }
  return out;
}

/** Quantidade de posts por pilar (maiores restos): soma sempre igual a `total`. */
export function pillarCounts(total: number): Record<EditorialPillar, number> {
  const raw = EDITORIAL_PILLARS.map((p) => ({ p, exact: (total * EDITORIAL_PILLAR_SHARE[p]) / 100 }));
  const counts = Object.fromEntries(raw.map(({ p, exact }) => [p, Math.floor(exact)])) as Record<EditorialPillar, number>;
  let left = total - Object.values(counts).reduce((a, b) => a + b, 0);
  for (const { p } of [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left-- <= 0) break;
    counts[p]++;
  }
  return counts;
}

/** Ordem dos pilares espalhada ao longo do mês (round-robin ponderado suave). */
function spreadPillars(counts: Record<EditorialPillar, number>): EditorialPillar[] {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const current = Object.fromEntries(EDITORIAL_PILLARS.map((p) => [p, 0])) as Record<EditorialPillar, number>;
  const out: EditorialPillar[] = [];
  for (let i = 0; i < total; i++) {
    let best: EditorialPillar | null = null;
    for (const p of EDITORIAL_PILLARS) {
      current[p] += counts[p];
      if (best === null || current[p] > current[best]) best = p;
    }
    current[best!] -= total;
    out.push(best!);
  }
  return out;
}

/** Concentra a maior parte dos posts de venda na semana de lançamento (troca com educativos da semana). */
function concentrateLaunch(pillars: EditorialPillar[], weeks: number[], launchWeek: number) {
  const sales = pillars.filter((p) => p === "venda").length;
  const inLaunch = weeks.filter((w) => w === launchWeek).length;
  const target = Math.min(sales, Math.max(2, Math.ceil(sales * 0.6)), Math.max(0, inLaunch - 1));
  const count = () => pillars.filter((p, i) => p === "venda" && weeks[i] === launchWeek).length;
  // vendas antes do lançamento saem primeiro (a semana anterior é de aquecimento)
  const outside = pillars
    .map((_, i) => i)
    .filter((i) => pillars[i] === "venda" && weeks[i] !== launchWeek)
    .sort((a, b) => Number(weeks[b] < launchWeek) - Number(weeks[a] < launchWeek) || a - b);
  for (const from of outside) {
    if (count() >= target) break;
    const to = pillars.findIndex((p, i) => p === "educativo" && weeks[i] === launchWeek);
    if (to < 0) break;
    [pillars[from], pillars[to]] = [pillars[to], pillars[from]];
  }
}

const FORMATS: Record<EditorialPlatform, Record<EditorialPillar, string[]>> = {
  instagram: {
    educativo: ["Carrossel", "Reels", "Carrossel", "Post estático"],
    conexao: ["Foto + legenda", "Reels", "Carrossel"],
    venda: ["Carrossel", "Reels", "Depoimento (vídeo ou print)"],
    engajamento: ["Post com pergunta", "Reels", "Carrossel interativo"],
  },
  linkedin: {
    educativo: ["Carrossel (PDF)", "Texto", "Artigo", "Vídeo curto"],
    conexao: ["Texto + foto", "Texto", "Vídeo curto"],
    venda: ["Carrossel (PDF)", "Estudo de caso (texto)", "Vídeo curto"],
    engajamento: ["Enquete", "Texto com pergunta"],
  },
  tiktok: {
    educativo: ["Vídeo tutorial", "Vídeo mito ou verdade", "Vídeo de lista"],
    conexao: ["Vídeo de bastidor", "Storytime"],
    venda: ["Vídeo depoimento", "Vídeo demonstração"],
    engajamento: ["Vídeo respondendo comentário", "Trend", "Vídeo com pergunta"],
  },
  facebook: {
    educativo: ["Imagem + texto", "Vídeo", "Álbum"],
    conexao: ["Foto + texto", "Vídeo"],
    venda: ["Imagem + link do WhatsApp", "Depoimento"],
    engajamento: ["Enquete", "Post com pergunta"],
  },
  youtube: {
    educativo: ["Shorts", "Vídeo longo", "Shorts"],
    conexao: ["Shorts", "Post na comunidade"],
    venda: ["Shorts", "Vídeo depoimento"],
    engajamento: ["Enquete na comunidade", "Shorts com pergunta"],
  },
};

/** Lê "dd/mm Descrição" (uma por linha; aceita dd/mm/aaaa e separadores - – :) e posiciona na janela. */
export function parseImportantDates(text: string | null, startDate: string): { date: string; label: string }[] {
  const end = addDays(startDate, EDITORIAL_DAYS - 1);
  const year = Number(startDate.slice(0, 4));
  const out: { date: string; label: string }[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–—:]?\s*(.+)$/);
    if (!m) continue;
    const [, d, mo, y, label] = m;
    const years = y ? [Number(y.length === 2 ? `20${y}` : y)] : [year, year + 1];
    for (const yy of years) {
      const iso = `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      if (isValidISODate(iso) && iso >= startDate && iso <= end) {
        out.push({ date: iso, label: label.trim().slice(0, 120) });
        break;
      }
    }
  }
  return out;
}

const FIXED_DATES: { md: string; label: string; health?: boolean }[] = [
  { md: "01-01", label: "Confraternização Universal" },
  { md: "01-01", label: "Janeiro Branco (saúde mental) — o mês todo", health: true },
  { md: "02-04", label: "Dia Mundial do Câncer", health: true },
  { md: "03-08", label: "Dia Internacional da Mulher" },
  { md: "04-07", label: "Dia Mundial da Saúde", health: true },
  { md: "04-21", label: "Tiradentes (feriado)" },
  { md: "05-01", label: "Dia do Trabalho (feriado)" },
  { md: "05-12", label: "Dia da Enfermagem", health: true },
  { md: "08-01", label: "Agosto Lilás / Dourado — o mês todo", health: true },
  { md: "09-01", label: "Setembro Amarelo (prevenção ao suicídio) — o mês todo", health: true },
  { md: "09-07", label: "Independência do Brasil (feriado)" },
  { md: "10-01", label: "Outubro Rosa (câncer de mama) — o mês todo", health: true },
  { md: "10-12", label: "Dia das Crianças / N. Sra. Aparecida (feriado)" },
  { md: "10-18", label: "Dia do Médico", health: true },
  { md: "11-01", label: "Novembro Azul (saúde do homem) — o mês todo", health: true },
  { md: "11-02", label: "Finados (feriado)" },
  { md: "11-15", label: "Proclamação da República (feriado)" },
  { md: "11-20", label: "Dia da Consciência Negra (feriado)" },
  { md: "12-01", label: "Dezembro Vermelho (HIV/aids) — o mês todo", health: true },
  { md: "12-25", label: "Natal" },
];

/** Datas fixas (feriados nacionais e campanhas de saúde) que caem na janela, já no formato do campo. */
export function suggestImportantDates(startDate: string, niche = ""): string {
  const end = addDays(startDate, EDITORIAL_DAYS - 1);
  const health = isHealthNiche(niche);
  const y = Number(startDate.slice(0, 4));
  return [y, y + 1]
    .flatMap((yy) => FIXED_DATES.filter((f) => health || !f.health).map((f) => ({ iso: `${yy}-${f.md}`, label: f.label })))
    .filter((f) => f.iso >= startDate && f.iso <= end)
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .map((f) => `${formatDateBR(f.iso).slice(0, 5)} ${f.label}`)
    .join("\n");
}

/** Estrutura do mês: dias de post, pilar, formato e datas especiais (base dos modos local e Claude). */
export function planEditorialSlots(input: EditorialInput): { slots: EditorialSlot[]; offDayOccasions: { date: string; label: string }[] } {
  const days = postingDays(input.startDate, input.frequency);
  const weeks = days.map((d) => weekOfDay(d.day));
  const pillars = spreadPillars(pillarCounts(days.length));
  if (input.launchWeek >= 1 && input.launchWeek <= 4) concentrateLaunch(pillars, weeks, input.launchWeek);
  const occasions = parseImportantDates(input.importantDates, input.startDate);
  const seen: Record<EditorialPillar, number> = { educativo: 0, conexao: 0, venda: 0, engajamento: 0 };
  const slots = days.map((d, i) => {
    const pillar = pillars[i];
    const options = FORMATS[input.platform][pillar];
    const occ = occasions.filter((o) => o.date === d.date).map((o) => o.label);
    return {
      day: d.day,
      date: d.date,
      weekday: WEEKDAYS[weekdayOf(d.date)],
      week: weeks[i],
      pillar,
      format: options[seen[pillar]++ % options.length],
      occasion: occ.length ? occ.join(" · ") : null,
      launch: pillar === "venda" && weeks[i] === input.launchWeek,
    };
  });
  const postDates = new Set(days.map((d) => d.date));
  return { slots, offDayOccasions: occasions.filter((o) => !postDates.has(o.date)) };
}

interface Template {
  theme: string;
  caption: string;
  cta: string;
}
type Bank = Record<EditorialPillar, Template[]> & { lancamento: Template[] };
const t = (theme: string, caption: string, cta: string): Template => ({ theme, caption, cta });

const HEALTH_BANK: Bank = {
  educativo: [
    t("5 mitos sobre plano de saúde que fazem você pagar mais caro", "Carência, coparticipação e reajuste: separamos o que é mito e o que é regra. Salve para consultar antes de contratar ou renovar.", "Salve para consultar depois"),
    t("Carência: o que é e quando pode ser reduzida", "Explicamos os prazos máximos da ANS e as situações em que a carência pode ser aproveitada. As condições variam por operadora e contrato.", "Comente CARÊNCIA que eu explico o seu caso"),
    t("Coparticipação vale a pena? Faça as contas", "Mostramos em que perfil de uso a coparticipação reduz o custo total e quando ela pesa no bolso. Um exemplo prático com números.", "Salve e envie para quem está escolhendo plano"),
    t("Enfermaria ou apartamento: a diferença na prática", "A acomodação muda o preço e o conforto na internação, não a rede de consultas e exames. Veja como escolher.", "Envie para quem vai contratar"),
    t("Reajuste anual x reajuste por faixa etária", "São dois reajustes diferentes, com regras próprias para PF, adesão e empresarial. Entenda o que esperar na renovação.", "Deixe sua dúvida nos comentários"),
    t("Plano PME: empresa a partir de 2 vidas já pode contratar", "Com CNPJ ativo dá para ter plano empresarial, muitas vezes com valor menor que o individual. Veja os requisitos mais comuns.", "Chame no WhatsApp para saber se seu CNPJ se enquadra"),
    t("Portabilidade de carências: trocar de plano sem começar do zero", "Quem cumpre os prazos e requisitos da ANS pode mudar de plano sem cumprir novas carências. Listamos o passo a passo.", "Salve este passo a passo"),
    t("Como conferir a rede credenciada antes de contratar", "Hospital no material de venda não significa cobertura em todos os produtos. Veja como checar a rede por plano, acomodação e região.", "Comente o hospital indispensável para você"),
    t("Reembolso: como funciona e quanto volta para você", "O reembolso segue a tabela do contrato, não o valor cobrado na consulta. Mostramos como simular antes de escolher o plano.", "Salve para usar na próxima consulta"),
    t("Checklist de documentos para o plano empresarial", "O que a operadora pede da empresa e dos beneficiários — juntar tudo antes acelera a implantação.", "Peça o checklist completo no WhatsApp"),
    t("Dependentes: quem pode entrar no plano", "Cônjuge, filhos e outros dependentes têm regras de parentesco e idade que variam por operadora. Veja as mais comuns.", "Marque quem precisa saber disso"),
    t("Doença preexistente: o que declarar e por quê", "A declaração de saúde é obrigatória e omitir informações traz riscos. Explicamos a cobertura parcial temporária (CPT).", "Salve e compartilhe"),
    t("Os 6 fatores que mudam o preço do plano de saúde", "Idade, região, rede, acomodação, coparticipação e tipo de contratação explicam a diferença entre cotações. Entenda antes de comparar.", "Peça sua cotação comparativa"),
    t("Plano de saúde como benefício: retenção de talentos", "É um dos benefícios mais valorizados pelos colaboradores. Mostramos como estruturar sem estourar o orçamento.", "Envie para o RH da sua empresa"),
  ],
  conexao: [
    t("Por que escolhi trabalhar com planos de saúde", "Conto o que me trouxe até aqui e o que me motiva a orientar cada cliente. Por trás de toda cotação existe uma família ou uma equipe.", "Você já passou aperto com plano? Conta aqui"),
    t("Bastidores: como montamos um comparativo de operadoras", "O passo a passo de uma cotação real, sem dados do cliente: rede, preço, carência e reajuste lado a lado.", "Quer ver o seu? Chame no WhatsApp"),
    t("O dia em que a orientação certa fez diferença", "Uma história real, com autorização do cliente, de quando a escolha certa evitou dor de cabeça na internação.", "Comente se você já viveu algo parecido"),
    t("Minha opinião: o erro mais comum ao escolher plano", "Escolher só pelo preço costuma sair caro depois. Explico o que eu olho primeiro e por quê.", "Concorda? Comente sua opinião"),
    t("Conheça quem cuida do seu plano", "Apresentamos a equipe que acompanha você da cotação à implantação — e depois dela também.", "Deixe um oi para o time"),
    t("Um dia na rotina de um corretor de saúde", "Reuniões, análise de contratos, conversa com operadoras e muito WhatsApp: o que acontece por trás do atendimento.", "Quer mais bastidores? Comente SIM"),
    t("As perguntas que os clientes mais me fazem", "Separei as dúvidas da semana e respondi com sinceridade, inclusive quando a resposta é “depende da operadora”.", "Deixe a sua pergunta"),
  ],
  venda: [
    t("Diagnóstico gratuito do seu plano atual", "Analisamos contrato, rede e reajuste e mostramos se dá para pagar menos sem perder cobertura. Sem compromisso.", "Chame no WhatsApp e agende"),
    t("Depoimento: empresa que reorganizou o plano da equipe", "Um cliente conta o que mudou depois da nossa análise. Resultados variam conforme operadora e perfil de cada empresa.", "Quer o mesmo para sua empresa? Fale conosco"),
    t("Comparativo lado a lado: 3 operadoras para o mesmo perfil", "Um exemplo ilustrativo de como um comparativo transparente ajuda a decidir com segurança. Condições sujeitas à análise da operadora.", "Peça o seu comparativo"),
    t("Por que contratar com corretor (sem pagar a mais por isso)", "Você não paga a mais pela consultoria e ganha comparativo, apoio na implantação e no pós-venda.", "Envie uma mensagem e tire suas dúvidas"),
    t("{produto}: para quem é e como funciona", "Apresentamos {produto} em detalhes: o que inclui, para quem faz sentido e como começar.", "Comente QUERO para receber os detalhes"),
    t("Aniversário do contrato chegando? Revise antes de renovar", "Se o reajuste está próximo, este é o melhor momento para comparar alternativas. Fazemos a análise para você.", "Agende sua análise de renovação"),
  ],
  engajamento: [
    t("Enquete: você sabe quanto paga de coparticipação?", "Uma pergunta rápida para descobrir quanto você conhece do próprio plano. O resultado sai nos Stories.", "Vote nos comentários: SIM ou NÃO"),
    t("Isso ou aquilo: enfermaria ou apartamento?", "Qual você escolheria — e por quê? Vamos ver o que a maioria prefere.", "Comente sua escolha"),
    t("Complete a frase: “O que mais me incomoda no plano de saúde é…”", "Queremos ouvir você: as respostas viram conteúdo nas próximas semanas.", "Complete nos comentários"),
    t("Quiz: verdadeiro ou falso sobre carência", "Três afirmações, uma é falsa. Teste seus conhecimentos antes de ver a resposta.", "Responda antes de ver o gabarito"),
    t("Caixinha de perguntas sobre planos de saúde", "As dúvidas enviadas serão respondidas em um post especial. Pergunte sem medo.", "Deixe sua pergunta"),
    t("Marque alguém que precisa revisar o plano de saúde", "Todo mundo conhece alguém que paga caro ou está sem plano. Ajude essa pessoa a encontrar uma opção melhor.", "Marque um amigo"),
  ],
  lancamento: [
    t("Lançamento: {produto}", "Chegou! Apresentamos {produto}, as condições desta semana e como garantir a sua análise.", "Chame no WhatsApp e garanta a sua"),
    t("{produto}: respostas às principais dúvidas", "Reunimos as perguntas mais frequentes desde a abertura. Se ainda ficou alguma, é só perguntar.", "Mande sua dúvida no direct ou WhatsApp"),
    t("Últimos dias: {produto}", "As condições especiais estão acabando. Veja quem já aproveitou e o que muda depois do prazo.", "Fale conosco antes do encerramento"),
  ],
};

const GENERIC_BANK: Bank = {
  educativo: [
    t("5 mitos sobre {nicho} que atrapalham {publico}", "Desmistificamos as crenças mais comuns da área. Salve para consultar quando precisar.", "Salve para consultar depois"),
    t("Guia rápido: como começar em {nicho}", "O passo a passo essencial, sem enrolação, para quem está começando.", "Salve e compartilhe"),
    t("3 erros comuns em {nicho} e como evitar", "Os deslizes que mais vemos no dia a dia e o que fazer no lugar.", "Comente qual erro você já cometeu"),
    t("Checklist: o que avaliar antes de decidir", "Uma lista prática para comparar opções com segurança.", "Salve o checklist"),
    t("Perguntas frequentes sobre {nicho}", "Respondemos as dúvidas que mais recebemos, de forma direta.", "Deixe sua dúvida nos comentários"),
    t("Tutorial: resolva um problema comum em 3 passos", "Um passo a passo aplicável hoje mesmo.", "Teste e conte o resultado"),
    t("Glossário: termos de {nicho} explicados", "Os termos que confundem, explicados em linguagem simples.", "Envie para quem precisa"),
    t("Antes e depois: o impacto de fazer do jeito certo", "Um exemplo prático mostrando a diferença que boas escolhas fazem.", "Salve para se inspirar"),
  ],
  conexao: [
    t("Minha história com {nicho}", "Como comecei, o que aprendi e por que faço o que faço.", "Conte a sua história nos comentários"),
    t("Bastidores de um dia de trabalho", "O que acontece por trás do conteúdo e do atendimento.", "Quer mais bastidores? Comente SIM"),
    t("Minha opinião sincera sobre uma tendência do mercado", "Um ponto de vista honesto sobre o que está em alta.", "Concorda? Comente"),
    t("Uma lição que aprendi com um cliente", "Uma história real, com autorização, que mudou a forma como trabalho.", "Já viveu algo parecido?"),
    t("Conheça quem está por trás da marca", "Apresentamos a equipe e os valores que guiam o trabalho.", "Deixe um oi"),
  ],
  venda: [
    t("{produto}: para quem é e como funciona", "Apresentamos {produto}: o que inclui, para quem faz sentido e como começar.", "Comente QUERO"),
    t("Depoimento de cliente", "Um cliente conta o resultado que alcançou com a nossa ajuda.", "Quer o mesmo? Fale conosco"),
    t("Por que escolher {produto}", "Os diferenciais que fazem diferença no dia a dia de {publico}.", "Envie uma mensagem"),
    t("Oferta da semana", "Condição especial por tempo limitado para quem quer começar agora.", "Garanta pelo link da bio"),
  ],
  engajamento: [
    t("Enquete: qual é o seu maior desafio em {nicho}?", "Queremos entender o que mais trava você hoje.", "Vote nos comentários"),
    t("Isso ou aquilo?", "Duas opções do universo de {nicho}: qual você escolhe?", "Comente sua escolha"),
    t("Complete a frase sobre {nicho}", "Suas respostas viram conteúdo nas próximas semanas.", "Complete nos comentários"),
    t("Quiz rápido: verdadeiro ou falso", "Teste seus conhecimentos antes de ver a resposta.", "Responda nos comentários"),
    t("Marque alguém que precisa ver isso", "Compartilhe com quem vai se beneficiar deste conteúdo.", "Marque um amigo"),
  ],
  lancamento: [
    t("Lançamento: {produto}", "Chegou! Apresentamos {produto} e as condições de lançamento.", "Garanta pelo link da bio"),
    t("{produto}: respostas às principais dúvidas", "As perguntas mais frequentes desde a abertura, respondidas.", "Mande sua dúvida no direct"),
    t("Últimos dias: {produto}", "As condições de lançamento estão acabando.", "Garanta antes do encerramento"),
  ],
};

function fill(text: string, input: EditorialInput, health: boolean) {
  const product = input.product?.trim() || (health ? "a análise gratuita do seu plano de saúde" : "nossa solução");
  return text
    .replace(/\{produto\}/g, product)
    .replace(/\{nicho\}/g, input.niche.trim() || "sua área")
    .replace(/\{publico\}/g, input.audience.trim() || "seu público")
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

function weeklyPlan(input: EditorialInput, health: boolean): EditorialWeek[] {
  const product = input.product?.trim() || (health ? "o diagnóstico gratuito do plano" : "a oferta do mês");
  const L = input.launchWeek;
  return [1, 2, 3, 4].map((week) => {
    if (L >= 1 && L <= 4) {
      if (week === L) return { week, focus: "Lançamento", goal: `Abrir ${product}: apresentação, prova social, respostas às objeções e chamada direta para o atendimento.` };
      if (week === L - 1) return { week, focus: "Aquecimento", goal: "Despertar o desejo: mostrar o problema, bastidores da novidade e formar a lista de interessados." };
      if (week > L) return { week, focus: "Prova social e últimas chamadas", goal: "Depoimentos, dúvidas frequentes e encerramento das condições especiais do lançamento." };
      return { week, focus: "Autoridade e alcance", goal: "Conteúdo educativo que responde às dúvidas mais comuns e atrai novos seguidores qualificados." };
    }
    return [
      { week, focus: "Autoridade e alcance", goal: "Conteúdo educativo que responde às dúvidas mais comuns e atrai novos seguidores qualificados." },
      { week, focus: "Conexão e confiança", goal: "Bastidores e histórias para humanizar a marca e gerar identificação." },
      { week, focus: "Conversão", goal: `Prova social e ofertas indiretas para transformar audiência em conversas sobre ${product}.` },
      { week, focus: "Relacionamento e fechamento do mês", goal: "Interação, respostas às dúvidas da audiência e chamada final para atendimento." },
    ][week - 1];
  });
}

function storyIdeas(health: boolean): string[] {
  return health
    ? [
        "Enquete do dia: uma pergunta de sim/não ligada ao post do feed (ex.: “Você sabe quando seu plano reajusta?”).",
        "Dica rápida em uma tela: uma regra de plano explicada em 15 segundos (carência, reembolso, dependentes…).",
        "Bastidor: comparativo sendo montado, reunião ou visita — sem expor dados de clientes.",
        "Caixinha de perguntas na quarta, com respostas em vídeo curto na quinta.",
        "Prova social: feedback autorizado de cliente ou o “número da semana” (análises feitas, empresas atendidas).",
      ]
    : [
        "Enquete do dia ligada ao post do feed.",
        "Dica rápida em uma tela (15 segundos).",
        "Bastidor do trabalho ou da rotina.",
        "Caixinha de perguntas com respostas no dia seguinte.",
        "Prova social: feedback de cliente ou resultado da semana.",
      ];
}

function reelIdeas(input: EditorialInput, health: boolean): string[] {
  return health
    ? [
        "“Quanto custa um plano de saúde?” — os 3 fatores que mais mudam o preço, em 30 segundos.",
        "Mito ou verdade com placas: carência, coparticipação e reajuste.",
        "POV: você descobriu que pagava caro no plano há anos — o antes e depois de um diagnóstico.",
      ]
    : [
        `Tutorial em 3 passos sobre o tema que ${input.audience.trim() || "seu público"} mais pergunta.`,
        `Mito ou verdade sobre ${input.niche.trim() || "sua área"}, com placas e respostas rápidas.`,
        "POV / bastidor: um dia de trabalho em 30 segundos, com uma lição no final.",
      ];
}

const PLATFORM_TIPS: Record<EditorialPlatform, string[]> = {
  instagram: [
    "Feed: 11h–13h e 18h–21h nos dias úteis; teste 7h–9h para quem trabalha fora.",
    "Stories ao longo do dia (manhã, almoço e noite) mantêm o perfil em evidência.",
    "Reels: publique 1–2 h antes do pico do seu público (Insights › Público › Horários).",
  ],
  linkedin: ["Terça a quinta, 7h30–9h e 12h–13h — horário comercial do público B2B.", "Evite fins de semana e responda os comentários na primeira hora: o alcance depende disso."],
  tiktok: ["18h–22h nos dias úteis e no meio da tarde aos fins de semana.", "Constância vale mais que horário: publique sempre no mesmo período."],
  facebook: ["12h–15h nos dias úteis; quarta e quinta costumam ter mais alcance.", "Público acima de 35 anos é mais ativo à noite (19h–21h)."],
  youtube: ["Shorts: 12h–15h e 18h–21h.", "Vídeo longo: publique 2–3 h antes do pico da audiência (quinta a sábado)."],
};

function schedulingTips(platform: EditorialPlatform, health: boolean): string[] {
  return [
    ...PLATFORM_TIPS[platform],
    ...(health ? ["Para empresas (sócios, RH, gestores), prefira o horário comercial; para pessoa física e famílias, almoço e noite."] : []),
    "Depois de 2 semanas, compare o alcance por horário nos dados da própria conta e ajuste o calendário.",
  ];
}

export function editorialDistribution(slots: Pick<EditorialSlot, "pillar">[]) {
  const total = slots.length || 1;
  return EDITORIAL_PILLARS.map((pillar) => {
    const count = slots.filter((s) => s.pillar === pillar).length;
    return { pillar, count, pct: Math.round((count / total) * 100) };
  });
}

/** Calendário completo no modo local (sem IA): estrutura + banco de temas. */
export function buildEditorialCalendar(input: EditorialInput): EditorialCalendar {
  const health = isHealthNiche(input.niche);
  const bank = health ? HEALTH_BANK : GENERIC_BANK;
  const { slots, offDayOccasions } = planEditorialSlots(input);
  const used: Record<EditorialPillar, number> = { educativo: 0, conexao: 0, venda: 0, engajamento: 0 };
  // Lançamento: abertura no 1º post de venda da semana; “últimos dias” no último post de venda depois dela
  // (ou no último da própria semana, se houver 3 ou mais); dúvidas frequentes nos demais.
  const launchSlots = slots.filter((s) => s.launch);
  const afterLaunch = slots.filter((s) => s.pillar === "venda" && input.launchWeek >= 1 && s.week > input.launchWeek);
  const lastCall = afterLaunch.at(-1) ?? (launchSlots.length >= 3 ? launchSlots.at(-1) : undefined);
  const posts = slots.map((s) => {
    let tpl: Template;
    if (s === lastCall) tpl = bank.lancamento[2];
    else if (s.launch) tpl = bank.lancamento[s === launchSlots[0] ? 0 : 1];
    else {
      const list = bank[s.pillar];
      tpl = list[used[s.pillar]++ % list.length];
    }
    return { ...s, theme: fill(tpl.theme, input, health), caption: fill(tpl.caption, input, health), cta: tpl.cta };
  });
  return {
    posts,
    weeks: weeklyPlan(input, health),
    stories: storyIdeas(health),
    reels: reelIdeas(input, health),
    schedulingTips: schedulingTips(input.platform, health),
    distribution: editorialDistribution(slots),
    offDayOccasions,
  };
}

/** Tabela em Markdown (para colar no Notion, Docs, WhatsApp Web…). */
export function editorialMarkdown(cal: EditorialCalendar, platform: EditorialPlatform): string {
  const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s*\n\s*/g, " ");
  const rows = cal.posts.map((p) => `| ${p.day} (${formatDateBR(p.date).slice(0, 5)}) | ${p.weekday} | ${EDITORIAL_PILLAR_LABELS[p.pillar]} | ${cell(p.format)} | ${cell(p.occasion ? `${p.theme} — ${p.occasion}` : p.theme)} | ${cell(p.caption)} | ${cell(p.cta)} |`);
  return [
    `# Calendário editorial — ${EDITORIAL_PLATFORM_LABELS[platform]} (${formatDateBR(cal.posts[0]?.date)} a ${formatDateBR(cal.posts[cal.posts.length - 1]?.date)})`,
    "",
    "| Dia | Dia da semana | Pilar | Formato | Tema do post | Resumo da legenda | CTA |",
    "|-----|---------------|-------|---------|--------------|-------------------|-----|",
    ...rows,
    "",
    `Distribuição: ${cal.distribution.map((d) => `${EDITORIAL_PILLAR_LABELS[d.pillar]} ${d.count} (${d.pct}%)`).join(" · ")}`,
    "",
    "## Resumo semanal",
    ...cal.weeks.map((w) => `- **Semana ${w.week}: ${w.focus}** — ${w.goal}`),
    ...(cal.offDayOccasions.length ? ["", "## Datas em dias sem post (use os Stories)", ...cal.offDayOccasions.map((o) => `- ${formatDateBR(o.date)} ${o.label}`)] : []),
    "",
    "## 5 ideias de Stories diários",
    ...cal.stories.map((s) => `- ${s}`),
    "",
    "## 3 ideias de Reels",
    ...cal.reels.map((s) => `- ${s}`),
    "",
    "## Dicas de horário",
    ...cal.schedulingTips.map((s) => `- ${s}`),
  ].join("\n");
}

/** Linhas do CSV (cabeçalho + dados). */
export function editorialCsvRows(cal: EditorialCalendar) {
  const header = ["Dia", "Data", "Dia da semana", "Semana", "Pilar", "Formato", "Tema do post", "Resumo da legenda", "CTA", "Data especial"];
  const rows = cal.posts.map((p) => [p.day, formatDateBR(p.date), p.weekday, p.week, EDITORIAL_PILLAR_LABELS[p.pillar], p.format, p.theme, p.caption, p.cta, p.occasion ?? ""]);
  return { header, rows };
}
