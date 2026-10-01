/**
 * Layout padrão da aba "BASE SAÚDE" (EXEMPLO BASE 1.xlsm) — 13 colunas — mais a coluna opcional SEXO,
 * exigida pelas operadoras na relação de vidas de grupos +99 (Playbook Be Smart, PJ +99 → Documentação).
 */
export const LIFE_FIELDS = [
  "empresa",
  "cnpj",
  "data_nascimento",
  "idade",
  "faixa_etaria",
  "titularidade",
  "grau_parentesco",
  "situacao",
  "cid",
  "cidade",
  "uf",
  "seguradora_atual",
  "plano_atual",
  "sexo",
] as const;
export type LifeField = (typeof LIFE_FIELDS)[number];

export const LIFE_FIELD_LABELS: Record<LifeField, string> = {
  empresa: "EMPRESA",
  cnpj: "CNPJ",
  data_nascimento: "DATA DE NASCIMENTO",
  idade: "IDADE",
  faixa_etaria: "FAIXA ETÁRIA",
  titularidade: "TITULARIDADE",
  grau_parentesco: "GRAU DE PARENTESCO",
  situacao: "SITUAÇÃO",
  cid: "CID",
  cidade: "CIDADE",
  uf: "UF",
  seguradora_atual: "SEGURADORA ATUAL",
  plano_atual: "PLANO ATUAL",
  sexo: "SEXO",
};

/** Sinônimos aceitos no cabeçalho (comparados após normalização: sem acento, maiúsculas, espaços simples). */
export const HEADER_SYNONYMS: Record<LifeField, string[]> = {
  empresa: ["EMPRESA", "RAZAO SOCIAL", "NOME EMPRESA", "ESTIPULANTE", "SUBESTIPULANTE"],
  cnpj: ["CNPJ", "CNPJ EMPRESA", "CNPJ DA EMPRESA"],
  data_nascimento: ["DATA DE NASCIMENTO", "DATA NASCIMENTO", "DT NASCIMENTO", "DT NASC", "NASCIMENTO", "DATA NASC"],
  idade: ["IDADE"],
  faixa_etaria: ["FAIXA ETARIA", "FAIXA", "FAIXA DE IDADE"],
  titularidade: ["TITULARIDADE", "TIPO BENEFICIARIO", "TIPO DE BENEFICIARIO", "TIPO", "TITULAR/DEPENDENTE"],
  grau_parentesco: ["GRAU DE PARENTESCO", "PARENTESCO", "GRAU PARENTESCO"],
  situacao: ["SITUACAO", "STATUS", "SITUACAO CADASTRAL"],
  cid: ["CID", "CID-10", "CID 10"],
  cidade: ["CIDADE", "MUNICIPIO"],
  uf: ["UF", "ESTADO"],
  seguradora_atual: ["SEGURADORA ATUAL", "OPERADORA ATUAL", "SEGURADORA", "OPERADORA"],
  plano_atual: ["PLANO ATUAL", "PLANO", "PRODUTO"],
  sexo: ["SEXO", "GENERO", "SEXO (M/F)", "SEXO M/F"],
};

/** Colunas não obrigatórias, mas recomendadas (o preview avisa quando não estão mapeadas). */
export const RECOMMENDED_LIFE_FIELDS: LifeField[] = ["sexo"];

/** Campos sem os quais a vida é considerada incompleta (erro). */
export const REQUIRED_LIFE_FIELDS: LifeField[] = ["cnpj", "titularidade", "cidade", "uf", "seguradora_atual", "plano_atual"];

export const KNOWN_SITUATIONS = [
  "ATIVO",
  "AFASTADO",
  "DEMITIDO",
  "APOSENTADO",
  "APOSENTADO POR INVALIDEZ",
  "GESTANTE",
  "HOME CARE",
  "LIMINAR",
  "AGREGADO",
  "CRONICO",
  "PRESTADOR",
] as const;

export const SHEET_NAME_CANDIDATES = ["BASE SAUDE", "BASE SAÚDE", "BASE"];

export type ColumnMapping = Record<LifeField, number | null>;
