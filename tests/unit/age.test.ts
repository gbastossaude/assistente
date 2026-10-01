import { describe, expect, it } from "vitest";
import { ageAt, ageBandFor, bandKey, DEFAULT_ANS_AGE_BANDS, normalizeBandLabel, validateAgeBands } from "@/lib/domain/age";
import { addDays, addMonths, diffDays, nextAnniversary } from "@/lib/domain/dates";

describe("idade e faixas ANS", () => {
  it("calcula idade considerando aniversário no ano", () => {
    expect(ageAt("1990-10-02", "2026-10-01")).toBe(35);
    expect(ageAt("1990-10-01", "2026-10-01")).toBe(36);
    expect(ageAt("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageAt("2030-01-01", "2026-10-01")).toBe(null);
  });
  it("enquadra nas 10 faixas da RN 63", () => {
    expect(ageBandFor(0)?.label).toBe("00 a 18");
    expect(ageBandFor(18)?.label).toBe("00 a 18");
    expect(ageBandFor(19)?.label).toBe("19 a 23");
    expect(ageBandFor(58)?.label).toBe("54 a 58");
    expect(ageBandFor(59)?.label).toBe("59 ou mais");
    expect(ageBandFor(102)?.label).toBe("59 ou mais");
    expect(ageBandFor(null)).toBe(null);
  });
  it("normaliza rótulos de faixa informados na planilha", () => {
    expect(normalizeBandLabel("0 a 18 anos")).toBe("0-18");
    expect(normalizeBandLabel("19-23")).toBe("19-23");
    expect(normalizeBandLabel("59+")).toBe("59-");
    expect(normalizeBandLabel("59 ou mais")).toBe("59-");
    expect(bandKey(DEFAULT_ANS_AGE_BANDS[9])).toBe("59-");
  });
  it("valida configuração de faixas", () => {
    expect(validateAgeBands(DEFAULT_ANS_AGE_BANDS)).toBe(null);
    expect(validateAgeBands([{ label: "x", min: 0, max: 10 }, { label: "y", min: 12, max: null }])).toMatch(/Lacuna/);
  });
});

describe("datas", () => {
  it("soma dias e meses", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
  });
  it("próximo aniversário", () => {
    expect(nextAnniversary("2020-03-15", "2026-10-01")).toBe("2027-03-15");
    expect(nextAnniversary("2020-12-01", "2026-10-01")).toBe("2026-12-01");
  });
});
