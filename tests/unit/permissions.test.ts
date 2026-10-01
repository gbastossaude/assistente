import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/permissions";

describe("RBAC", () => {
  it("dados sensíveis só para admin, head e analista", () => {
    expect(can("admin", "sensitive:read")).toBe(true);
    expect(can("head", "sensitive:read")).toBe(true);
    expect(can("analista", "sensitive:read")).toBe(true);
    expect(can("comercial", "sensitive:read")).toBe(false);
    expect(can("leitura", "sensitive:read")).toBe(false);
  });
  it("somente leitura não altera dados", () => {
    for (const p of ["company:write", "quotation:write", "document:write", "task:write", "delete", "settings:manage", "assistant:act"] as const) {
      expect(can("leitura", p)).toBe(false);
    }
    expect(can("leitura", "read")).toBe(true);
  });
  it("override de prontidão restrito a Head/Admin", () => {
    expect(can("head", "quotation:override_ready")).toBe(true);
    expect(can("analista", "quotation:override_ready")).toBe(false);
  });
  it("gestão de usuários somente admin", () => {
    expect(can("admin", "users:manage")).toBe(true);
    expect(can("head", "users:manage")).toBe(false);
    expect(can(null, "read")).toBe(false);
  });
});
