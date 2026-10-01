/** Campos Zod reutilizáveis (aceitam valores vindos de formulários: "" → null, "1.234,56" → 1234.56). */
import { z } from "zod";
import { canonicalCnpj } from "@/lib/domain/cnpj";
import { isValidISODate } from "@/lib/domain/dates";

export function parseLocaleNumber(v: unknown): number | null | typeof NaN {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/\s|R\$|%/g, "");
  if (s === "") return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export const optStr = (max = 2000) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const s = (v ?? "").trim();
      return s === "" ? null : s;
    })
    .refine((v) => v === null || v.length <= max, { message: `Máximo de ${max} caracteres` });

export const reqStr = (label: string, max = 300) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length > 0, { message: `${label} é obrigatório` })
    .refine((v) => v.length <= max, { message: `${label}: máximo de ${max} caracteres` });

export const optNum = (opts: { min?: number; max?: number; int?: boolean; label?: string } = {}) =>
  z.union([z.number(), z.string(), z.null()]).optional().transform((v, ctx) => {
    const n = parseLocaleNumber(v);
    if (n === null) return null;
    const label = opts.label ?? "Valor";
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: `${label}: número inválido` });
      return z.NEVER;
    }
    if (opts.int && !Number.isInteger(n)) ctx.addIssue({ code: "custom", message: `${label}: deve ser inteiro` });
    if (opts.min !== undefined && n < opts.min) ctx.addIssue({ code: "custom", message: `${label}: mínimo ${opts.min}` });
    if (opts.max !== undefined && n > opts.max) ctx.addIssue({ code: "custom", message: `${label}: máximo ${opts.max}` });
    return n;
  });

export const reqNum = (label: string, opts: { min?: number; max?: number; int?: boolean } = {}) =>
  optNum({ ...opts, label }).refine((v) => v !== null, { message: `${label} é obrigatório` }).transform((v) => v as number);

export const optDate = (label = "Data") =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const s = (v ?? "").trim();
      return s === "" ? null : s.slice(0, 10);
    })
    .refine((v) => v === null || isValidISODate(v), { message: `${label} inválida` });

export const reqDate = (label: string) =>
  optDate(label)
    .refine((v) => v !== null, { message: `${label} é obrigatória` })
    .transform((v) => v as string);

export const optBool = () =>
  z.union([z.boolean(), z.string(), z.null()]).optional().transform((v) => {
    if (v === true || v === "true" || v === "sim" || v === "on") return true;
    if (v === false || v === "false" || v === "nao") return false;
    return null;
  });

export const optCnpj = (label = "CNPJ") =>
  z.union([z.string(), z.null()]).optional().transform((v, ctx) => {
    const s = (v ?? "").trim();
    if (!s) return null;
    const c = canonicalCnpj(s);
    if (!c) {
      ctx.addIssue({ code: "custom", message: `${label} inválido` });
      return z.NEVER;
    }
    return c;
  });

export const reqCnpj = (label = "CNPJ") =>
  optCnpj(label)
    .refine((v) => v !== null, { message: `${label} é obrigatório` })
    .transform((v) => v as string);

export const optUuid = () =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), { message: "Identificador inválido" });

export const uuid = () => z.string().uuid("Identificador inválido");

export const optEmail = () =>
  optStr(200).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "E-mail inválido" });

export const enumOf = <T extends readonly [string, ...string[]]>(values: T, label = "Valor") =>
  z.enum(values, { error: `${label} inválido` });

export const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? (v as T[number]) : null));
