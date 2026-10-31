/**
 * Telefones no formato usado pela WhatsApp Cloud API (apenas dígitos, com DDI, sem "+").
 * Para celulares brasileiros a Meta pode entregar o wa_id sem o nono dígito; por isso a
 * autorização compara todas as variantes.
 */
export declare function digitsOnly(value: string): string;
/** Normaliza um telefone digitado (ex.: "(11) 98765-4321") para "5511987654321". */
export declare function normalizePhoneBR(value: string): string | null;
/** Variantes equivalentes (com e sem o nono dígito) para números móveis brasileiros. */
export declare function phoneVariants(value: string): string[];
/** Mascara o telefone para exibição/logs: 55119****4321. */
export declare function maskPhone(value: string): string;
