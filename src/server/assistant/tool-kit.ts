import type { z } from "zod";
import type { CurrentUser } from "../auth";

export interface ToolResult {
  /** Texto pronto para exibir (modo local) — também enviado ao modelo. */
  text: string;
  data?: unknown;
  /** Ação proposta que exige confirmação explícita do usuário. */
  actionId?: string;
}

export interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  jsonSchema: Record<string, unknown>;
  /** Respeita o escopo de dados (pode ser usada por Corretor/Supervisor). */
  scopeSafe?: boolean;
  run: (input: z.infer<S>, user: CurrentUser) => Promise<ToolResult>;
}

export const str = (description: string) => ({ type: "string", description });
export const int = (description: string) => ({ type: "integer", description });
export const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
