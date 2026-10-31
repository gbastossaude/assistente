/** Utilidades de texto independentes de plataforma. */
/** Minúsculas, sem acentos e com espaços normalizados — usado em comparações e detecção de termos. */
export declare function normalizeText(input: string): string;
/** Escapa um termo para uso em RegExp. */
export declare function escapeRegExp(value: string): string;
/** Verifica se `term` aparece como palavra/expressão inteira em `normalizedText` (ambos normalizados). */
export declare function containsTerm(normalizedText: string, term: string): boolean;
export declare function truncate(text: string, max: number, suffix?: string): string;
/** Formata AAAA-MM-DD como DD/MM/AAAA sem depender de fuso horário. */
export declare function formatDateBR(isoDate: string | null | undefined): string;
/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export declare function todayISO(timeZone?: string, now?: Date): string;
export declare function daysBetween(fromISO: string, toISO: string): number;
