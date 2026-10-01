import { sql } from "drizzle-orm";

/**
 * Colunas sempre qualificadas para subconsultas correlacionadas. Em SELECT de tabela única o Drizzle
 * renderiza `"id"` sem o nome da tabela — dentro de uma subconsulta isso se ligaria à tabela interna.
 */
export const Q_ID = sql.raw(`"quotations"."id"`);
export const C_ID = sql.raw(`"companies"."id"`);
export const QI_ID = sql.raw(`"quotation_insurers"."id"`);
