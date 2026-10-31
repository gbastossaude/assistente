export interface FormattableSource {
    rank: number;
    title: string;
    operator_name?: string | null;
    page_from?: number | null;
    page_to?: number | null;
    valid_until?: string | null;
}
export declare function formatSourceLine(s: FormattableSource): string;
/** Texto final para o WhatsApp (formatação nativa *negrito* / _itálico_), limitado ao tamanho permitido. */
export declare function formatAnswerForWhatsApp(answer: {
    content: string;
    warnings?: string[] | null;
}, sources: FormattableSource[], maxChars?: number): string;
