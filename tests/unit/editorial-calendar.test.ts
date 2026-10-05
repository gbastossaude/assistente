import { describe, expect, it } from "vitest";
import { routeIntent } from "@/lib/assistant/router";
import {
  buildEditorialCalendar,
  defaultEditorialStart,
  editorialCsvRows,
  editorialMarkdown,
  parseImportantDates,
  pillarCounts,
  postingDays,
  suggestImportantDates,
  type EditorialInput,
} from "@/lib/domain/editorial-calendar";
import { editorialCalendarSchema } from "@/lib/validation/schemas";

const base: EditorialInput = {
  startDate: "2026-11-01",
  niche: "Planos de saúde (corretora)",
  platform: "instagram",
  audience: "Empresas e famílias",
  frequency: "5x_semana",
  pillars: null,
  objectives: null,
  product: "Programa Empresa Saudável",
  launchWeek: 0,
  importantDates: null,
};

describe("calendário editorial — estrutura", () => {
  it("início padrão é o primeiro dia do próximo mês", () => {
    expect(defaultEditorialStart("2026-10-05")).toBe("2026-11-01");
    expect(defaultEditorialStart("2026-12-20")).toBe("2027-01-01");
  });
  it("dias de postagem seguem a frequência em 30 dias corridos", () => {
    expect(postingDays("2026-11-01", "diaria")).toHaveLength(30);
    const weekdays = postingDays("2026-11-01", "5x_semana"); // 01/11/2026 é domingo
    expect(weekdays).toHaveLength(21);
    expect(weekdays[0]).toEqual({ day: 2, date: "2026-11-02" });
    expect(postingDays("2026-11-01", "3x_semana").map((d) => d.date).slice(0, 3)).toEqual(["2026-11-02", "2026-11-04", "2026-11-06"]);
  });
  it("distribuição 50/20/15/15 com soma exata", () => {
    expect(pillarCounts(20)).toEqual({ educativo: 10, conexao: 4, venda: 3, engajamento: 3 });
    expect(pillarCounts(30)).toEqual({ educativo: 15, conexao: 6, venda: 5, engajamento: 4 });
    for (const n of [12, 13, 21, 22, 30]) expect(Object.values(pillarCounts(n)).reduce((a, b) => a + b, 0)).toBe(n);
  });
  it("posts completos, sem dias repetidos, primeiro post educativo", () => {
    const cal = buildEditorialCalendar(base);
    expect(cal.posts).toHaveLength(21);
    expect(new Set(cal.posts.map((p) => p.day)).size).toBe(21);
    expect(cal.posts[0]).toMatchObject({ pillar: "educativo", weekday: "Seg", week: 1 });
    for (const p of cal.posts) {
      expect(p.theme && p.caption && p.cta && p.format).toBeTruthy();
      expect(p.theme + p.caption).not.toMatch(/\{(produto|nicho|publico)\}/);
    }
    expect(cal.distribution.find((d) => d.pillar === "educativo")).toMatchObject({ count: 11, pct: 52 });
    expect(cal.weeks).toHaveLength(4);
    expect(cal.stories).toHaveLength(5);
    expect(cal.reels).toHaveLength(3);
    expect(cal.schedulingTips.length).toBeGreaterThan(0);
  });
  it("lançamento concentra as vendas na semana escolhida, sem mudar a distribuição", () => {
    const without = buildEditorialCalendar(base);
    const cal = buildEditorialCalendar({ ...base, launchWeek: 3 });
    expect(cal.distribution).toEqual(without.distribution);
    const sales = cal.posts.filter((p) => p.pillar === "venda");
    expect(sales.filter((p) => p.week === 3).length).toBeGreaterThanOrEqual(2);
    expect(sales.filter((p) => p.week === 3).every((p) => p.launch)).toBe(true);
    expect(cal.posts.find((p) => p.launch)?.theme).toBe("Lançamento: Programa Empresa Saudável");
    expect(sales.filter((p) => p.launch)[1].theme).toBe("Programa Empresa Saudável: respostas às principais dúvidas");
    expect(sales.at(-1)).toMatchObject({ week: 4, theme: "Últimos dias: Programa Empresa Saudável" });
    expect(cal.weeks.map((w) => w.focus)).toEqual(["Autoridade e alcance", "Aquecimento", "Lançamento", "Prova social e últimas chamadas"]);
  });
  it("datas importantes: no dia do post viram destaque; em dia sem post vão para os Stories", () => {
    expect(parseImportantDates("15/11 Proclamação\n20/11/2026 - Consciência Negra\nlixo\n31/02 inválida\n10/10 fora da janela", "2026-11-01")).toEqual([
      { date: "2026-11-15", label: "Proclamação" },
      { date: "2026-11-20", label: "Consciência Negra" },
    ]);
    const cal = buildEditorialCalendar({ ...base, importantDates: "20/11 Consciência Negra\n15/11 Proclamação" });
    expect(cal.posts.find((p) => p.date === "2026-11-20")?.occasion).toBe("Consciência Negra"); // sexta
    expect(cal.offDayOccasions).toEqual([{ date: "2026-11-15", label: "Proclamação" }]); // domingo
  });
  it("datas sugeridas da janela (inclui campanhas de saúde só no nicho de saúde)", () => {
    expect(suggestImportantDates("2026-11-01", "planos de saúde")).toContain("01/11 Novembro Azul");
    expect(suggestImportantDates("2026-11-01", "padaria")).not.toContain("Novembro Azul");
    expect(suggestImportantDates("2026-12-15", "padaria")).toContain("01/01 Confraternização");
  });
  it("nicho genérico usa o banco genérico com as variáveis preenchidas", () => {
    const cal = buildEditorialCalendar({ ...base, niche: "Confeitaria artesanal", audience: "noivas", platform: "tiktok", frequency: "diaria" });
    expect(cal.posts).toHaveLength(30);
    expect(cal.posts[0].theme).toBe("5 mitos sobre Confeitaria artesanal que atrapalham noivas");
    expect(cal.posts[0].format).toBe("Vídeo tutorial");
  });
  it("exportações: Markdown no formato do prompt e CSV", () => {
    const cal = buildEditorialCalendar(base);
    const md = editorialMarkdown(cal, "instagram");
    expect(md).toContain("| Dia | Dia da semana | Pilar | Formato | Tema do post | Resumo da legenda | CTA |");
    expect(md).toContain("## 3 ideias de Reels");
    const { header, rows } = editorialCsvRows(cal);
    expect(header).toHaveLength(10);
    expect(rows).toHaveLength(21);
  });
});

describe("calendário editorial — validação e assistente", () => {
  it("valida o formulário", () => {
    const ok = editorialCalendarSchema.safeParse({ ...base, launchWeek: "3", pillars: "", objectives: "" });
    expect(ok.success && ok.data.launchWeek).toBe(3);
    expect(ok.success && ok.data.pillars).toBeNull();
    expect(editorialCalendarSchema.safeParse({ ...base, platform: "orkut" }).success).toBe(false);
    expect(editorialCalendarSchema.safeParse({ ...base, launchWeek: 5 }).success).toBe(false);
    expect(editorialCalendarSchema.safeParse({ ...base, niche: "" }).success).toBe(false);
  });
  it("roteador local reconhece o pedido de calendário editorial", () => {
    expect(routeIntent("Crie um calendário editorial de novembro para o LinkedIn com lançamento na semana 3", "2026-10-05")).toEqual({
      tool: "calendario_editorial",
      input: { mes: "2026-11", plataforma: "linkedin", frequencia: "5x_semana", semana_lancamento: 3, produto: "", publico: "" },
    });
    expect(routeIntent("Monte 30 posts para o Instagram, todos os dias", "2026-10-05")).toMatchObject({ tool: "calendario_editorial", input: { mes: "", plataforma: "instagram", frequencia: "diaria" } });
  });
});
