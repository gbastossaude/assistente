/** Validação do cabeçalho X-Hub-Signature-256 da Meta (HMAC-SHA256 do corpo bruto com o App Secret). */
/** Comparação em tempo constante para não vazar informação por tempo de resposta. */
export declare function timingSafeEqual(a: string, b: string): boolean;
export declare function computeSignature(rawBody: Uint8Array | string, appSecret: string): Promise<string>;
export declare function verifyMetaSignature(rawBody: Uint8Array | string, header: string | null, appSecret: string): Promise<boolean>;
