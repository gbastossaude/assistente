import { containsTerm, normalizeText } from "./text.ts";

/**
 * Categorias de dúvidas (classificação das perguntas). As palavras-chave servem apenas para
 * classificar e direcionar a busca — nunca para gerar respostas.
 */
export const TOPICS = [
  { id: "elegibilidade", label: "Elegibilidade", keywords: ["elegibilidade", "elegivel", "aceita", "aceitam", "pode contratar", "quem pode", "vinculo", "socio", "socios", "dependente", "dependentes", "agregado"] },
  { id: "vidas", label: "Quantidade de vidas", keywords: ["vidas", "vida", "minimo de vidas", "titulares", "quantidade de pessoas"] },
  { id: "mei_cnpj", label: "MEI e tempo de CNPJ", keywords: ["mei", "cnpj", "tempo de cnpj", "abertura", "microempreendedor", "empresa nova", "contrato social"] },
  { id: "carencias", label: "Carências", keywords: ["carencia", "carencias", "aproveitamento", "reducao de carencia", "compra de carencia", "isencao de carencia"] },
  { id: "portabilidade", label: "Portabilidade", keywords: ["portabilidade", "portar", "migracao", "migrar"] },
  { id: "cpt_dlp", label: "CPT e doenças preexistentes", keywords: ["cpt", "cobertura parcial temporaria", "preexistente", "preexistentes", "doenca preexistente", "dlp", "agravo"] },
  { id: "declaracao_saude", label: "Declaração de saúde", keywords: ["declaracao de saude", "ds", "entrevista qualificada", "questionario de saude"] },
  { id: "coparticipacao", label: "Coparticipação", keywords: ["coparticipacao", "copart", "coparticipativo", "fator moderador", "franquia"] },
  { id: "reembolso", label: "Reembolso", keywords: ["reembolso", "livre escolha", "tabela de reembolso", "multiplo de reembolso"] },
  { id: "rede", label: "Rede credenciada", keywords: ["rede", "credenciado", "credenciada", "hospital", "hospitais", "laboratorio", "laboratorios", "clinica", "referenciado", "prestador"] },
  { id: "abrangencia", label: "Abrangência geográfica", keywords: ["abrangencia", "nacional", "regional", "estadual", "municipal", "grupo de municipios", "area de atuacao"] },
  { id: "documentacao", label: "Documentação", keywords: ["documento", "documentos", "documentacao", "comprovante", "ficha", "proposta", "formulario", "checklist"] },
  { id: "implantacao", label: "Contratação e implantação", keywords: ["implantacao", "implantar", "contratacao", "contratar", "assinatura", "boleto", "primeira mensalidade", "cadastro da proposta"] },
  { id: "reajuste", label: "Reajuste", keywords: ["reajuste", "aumento", "sinistralidade", "aniversario do contrato", "faixa etaria", "indice"] },
  { id: "cancelamento", label: "Aviso prévio e cancelamento", keywords: ["cancelamento", "cancelar", "rescisao", "aviso previo", "multa", "inadimplencia", "suspensao"] },
  { id: "vigencia", label: "Vigência", keywords: ["vigencia", "data de vigencia", "inicio de vigencia", "data base", "fechamento", "corte"] },
  { id: "movimentacao", label: "Movimentação cadastral", keywords: ["movimentacao", "inclusao", "exclusao", "incluir", "excluir", "alteracao cadastral", "recem-nascido", "recem nascido", "casamento"] },
  { id: "comissionamento", label: "Comissionamento", keywords: ["comissao", "comissionamento", "agenciamento", "vitalicio", "bonus", "premiacao", "grade de comissao"] },
  { id: "pendencias", label: "Pendências operacionais", keywords: ["pendencia", "pendencias", "pendente", "devolvida", "recusada", "analise", "glosa"] },
  { id: "produtos", label: "Produtos e categorias", keywords: ["produto", "produtos", "plano", "planos", "categoria", "enfermaria", "apartamento", "acomodacao", "diferenca entre"] },
  { id: "ans_legislacao", label: "ANS e legislação", keywords: ["ans", "rn ", "resolucao normativa", "lei 9.656", "9656", "rol", "rol de procedimentos", "legislacao", "prazo de atendimento", "cdc"] },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];

export function topicLabel(id: string | null | undefined): string {
  return TOPICS.find((t) => t.id === id)?.label ?? "Geral";
}

/** Classifica a pergunta pelas categorias com mais termos encontrados (pode retornar mais de uma). */
export function classifyTopics(text: string): TopicId[] {
  const norm = normalizeText(text);
  const scored = TOPICS.map((t) => ({ id: t.id, score: t.keywords.filter((k) => containsTerm(norm, k)).length }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}
