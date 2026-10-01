import { describe, expect, it } from "vitest";
import { PLAYBOOK_DEFAULTS, PLAYBOOK_GROUPS, PLAYBOOK_SECTIONS } from "@/lib/playbook/content";
import { normalizeText, searchPlaybook } from "@/lib/playbook/search";

describe("conteúdo do Playbook", () => {
  it("cada item pertence a uma seção conhecida, sem chaves duplicadas", () => {
    const sections = new Set(PLAYBOOK_GROUPS.flatMap((g) => g.sections as readonly string[]));
    expect(Object.keys(PLAYBOOK_SECTIONS).every((s) => sections.has(s))).toBe(true);
    const keys = new Set<string>();
    for (const e of PLAYBOOK_DEFAULTS) {
      expect(sections.has(e.section)).toBe(true);
      expect(e.body.trim().length).toBeGreaterThan(0);
      const k = `${e.section}:${e.key}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
    for (const s of sections) expect(PLAYBOOK_DEFAULTS.some((e) => e.section === s)).toBe(true);
  });
  it("cadência de follow-up D0–D7 está completa", () => {
    const fu = PLAYBOOK_DEFAULTS.filter((e) => e.section === "followup").map((e) => e.key);
    expect(fu).toEqual(expect.arrayContaining(["d0", "d1", "d3", "d5", "d7"]));
  });
});

describe("busca no Playbook", () => {
  it("ignora acentos e caixa", () => {
    expect(normalizeText("Carência PME")).toBe("carencia pme");
  });
  it("encontra o tema pela pergunta em linguagem natural", () => {
    expect(searchPlaybook(PLAYBOOK_DEFAULTS, "Como funciona a carência no PME?")[0]).toMatchObject({ section: "pme", key: "carencia" });
    expect(searchPlaybook(PLAYBOOK_DEFAULTS, "coparticipação parcial").some((e) => e.section === "copart")).toBe(true);
    expect(searchPlaybook(PLAYBOOK_DEFAULTS, "follow-up D3")[0].section).toBe("followup");
  });
  it("sem termos relevantes não retorna nada", () => {
    expect(searchPlaybook(PLAYBOOK_DEFAULTS, "de para")).toEqual([]);
  });
});
