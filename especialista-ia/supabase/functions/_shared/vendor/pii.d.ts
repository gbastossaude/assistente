/**
 * Minimização de dados pessoais (LGPD). Remove identificadores antes de armazenar a pergunta
 * ou enviá-la ao modelo. O sistema responde dúvidas sobre regras de produtos — não precisa de
 * CPF, contatos, carteirinhas ou nomes de beneficiários.
 */
export type PiiType = "cpf" | "cnpj" | "email" | "telefone" | "cns" | "rg" | "nascimento" | "numero_longo" | "nome";
export interface PiiFinding {
    type: PiiType;
    count: number;
}
export interface RedactionResult {
    text: string;
    findings: PiiFinding[];
    /** Verdadeiro quando há identificadores pessoais removidos. */
    hasSensitive: boolean;
    /** Verdadeiro quando a pergunta parece descrever o estado de saúde de uma pessoa específica. */
    healthContext: boolean;
}
export declare function isValidCpf(digits: string): boolean;
export declare function redactSensitive(input: string): RedactionResult;
