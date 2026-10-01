/**
 * Validação linha a linha da base de vidas. Não altera o arquivo original: produz registros
 * normalizados + lista de problemas (erros tornam o registro "incompleto"; avisos são informativos).
 */
import { ageAt, ageBandFor, bandKey, normalizeBandLabel, type AgeBand } from "@/lib/domain/age";
import { canonicalCnpj, normalizeCnpj } from "@/lib/domain/cnpj";
import { UFS } from "@/lib/domain/constants";
import { diffDays } from "@/lib/domain/dates";
import { KNOWN_SITUATIONS, LIFE_FIELD_LABELS, type ColumnMapping, type LifeField } from "./fields";
import { cellToISODate, cellToString, fieldValue, normalizeHolderType, normalizeSex, normalizeText } from "./normalize";

export interface LifeIssue {
  field: LifeField | "linha";
  level: "error" | "warning";
  message: string;
}

export interface NormalizedLife {
  rowNumber: number;
  companyName: string | null;
  cnpj: string | null;
  birthDate: string | null;
  age: number | null;
  ageBand: string | null;
  holderType: "TITULAR" | "DEPENDENTE" | "AGREGADO" | null;
  kinship: string | null;
  situation: string | null;
  cid: string | null;
  city: string | null;
  uf: string | null;
  insurer: string | null;
  plan: string | null;
  sex: "M" | "F" | null;
  issues: LifeIssue[];
}

export interface ValidationOptions {
  referenceDate: string;
  ageBands: AgeBand[];
  /** Número da primeira linha de dados na planilha (para mensagens "linha N"). */
  firstRowNumber: number;
}

export interface ValidationResult {
  lives: NormalizedLife[];
  skippedEmpty: number;
  missingMappedFields: LifeField[];
}

const str = (row: unknown[], m: ColumnMapping, f: LifeField) => {
  const s = cellToString(fieldValue(row, m, f));
  return s === "" ? null : s;
};

function isEmptyRow(row: unknown[], mapping: ColumnMapping) {
  return Object.values(mapping).every((idx) => idx === null || cellToString(row[idx]) === "");
}

export function validateLifeRows(rows: unknown[][], mapping: ColumnMapping, opts: ValidationOptions): ValidationResult {
  const lives: NormalizedLife[] = [];
  let skippedEmpty = 0;
  const missingMappedFields = (Object.keys(mapping) as LifeField[]).filter((f) => mapping[f] === null);
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const rowNumber = opts.firstRowNumber + i;
    if (!row || isEmptyRow(row, mapping)) {
      skippedEmpty++;
      return;
    }
    const issues: LifeIssue[] = [];
    const err = (field: LifeIssue["field"], message: string) => issues.push({ field, level: "error", message });
    const warn = (field: LifeIssue["field"], message: string) => issues.push({ field, level: "warning", message });

    // CNPJ
    const rawCnpj = str(row, mapping, "cnpj");
    let cnpj: string | null = null;
    if (!rawCnpj) err("cnpj", "CNPJ não preenchido");
    else {
      cnpj = canonicalCnpj(rawCnpj);
      if (!cnpj) {
        err("cnpj", `CNPJ inválido (${rawCnpj})`);
        cnpj = normalizeCnpj(rawCnpj) || null;
      }
    }

    // Data de nascimento / idade
    const birthRaw = fieldValue(row, mapping, "data_nascimento");
    const birthParsed = cellToISODate(birthRaw);
    let birthDate: string | null = null;
    if (birthParsed === "invalid") err("data_nascimento", `Data de nascimento inválida (${cellToString(birthRaw)})`);
    else if (birthParsed) {
      if (diffDays(birthParsed, opts.referenceDate) < 0) err("data_nascimento", "Data de nascimento no futuro");
      else birthDate = birthParsed;
    }
    const ageRaw = str(row, mapping, "idade");
    let informedAge: number | null = null;
    if (ageRaw !== null) {
      const n = Number(ageRaw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 130 || !Number.isInteger(n)) err("idade", `Idade inválida (${ageRaw})`);
      else informedAge = n;
    }
    const computedAge = birthDate ? ageAt(birthDate, opts.referenceDate) : null;
    let age: number | null = computedAge ?? informedAge;
    if (computedAge !== null && computedAge > 120) {
      err("data_nascimento", `Idade calculada improvável (${computedAge} anos)`);
      age = null;
    }
    if (computedAge !== null && informedAge !== null && computedAge !== informedAge) {
      warn("idade", `Idade informada (${informedAge}) difere da calculada pela data de nascimento (${computedAge}); considerada ${computedAge}`);
    }
    if (birthParsed === null && informedAge === null) err("data_nascimento", "Sem data de nascimento e sem idade");
    else if (birthParsed === null) warn("data_nascimento", "Data de nascimento não informada (usada a idade da planilha)");

    // Faixa etária
    const band = ageBandFor(age, opts.ageBands);
    const bandRaw = str(row, mapping, "faixa_etaria");
    if (bandRaw && band) {
      const informed = normalizeBandLabel(bandRaw);
      if (!informed) warn("faixa_etaria", `Faixa etária não reconhecida (${bandRaw}); considerada ${band.label}`);
      else if (informed !== bandKey(band)) warn("faixa_etaria", `Faixa informada (${bandRaw}) incoerente com a idade ${age}; considerada ${band.label}`);
    }

    // Titularidade / parentesco
    const holderRaw = str(row, mapping, "titularidade");
    const holderType = holderRaw ? normalizeHolderType(holderRaw) : null;
    if (!holderRaw) err("titularidade", "Titularidade não preenchida");
    else if (!holderType) err("titularidade", `Titularidade desconhecida (${holderRaw}) — use TITULAR, DEPENDENTE ou AGREGADO`);
    const kinship = str(row, mapping, "grau_parentesco");
    if ((holderType === "DEPENDENTE" || holderType === "AGREGADO") && !kinship) {
      err("grau_parentesco", `Grau de parentesco obrigatório para ${holderType.toLowerCase()}`);
    }

    // Situação
    const situationRaw = str(row, mapping, "situacao");
    const situation = situationRaw ? normalizeText(situationRaw) : null;
    if (situation && !(KNOWN_SITUATIONS as readonly string[]).includes(situation)) {
      warn("situacao", `Situação não reconhecida (${situationRaw})`);
    }

    // CID
    const cidRaw = str(row, mapping, "cid");
    const cid = cidRaw ? normalizeText(cidRaw).replace(/\s/g, "") : null;
    if (cid && !/^[A-Z]\d{2}(\.?\d{1,2})?$/.test(cid)) warn("cid", "CID em formato não reconhecido");

    // Localidade
    const city = str(row, mapping, "cidade");
    if (!city) err("cidade", "Cidade não preenchida");
    const ufRaw = str(row, mapping, "uf");
    const uf = ufRaw ? normalizeText(ufRaw) : null;
    if (!uf) err("uf", "UF não preenchida");
    else if (!(UFS as readonly string[]).includes(uf)) err("uf", `UF inválida (${ufRaw})`);

    // Operadora / plano
    const insurer = str(row, mapping, "seguradora_atual");
    if (!insurer) err("seguradora_atual", "Seguradora/operadora atual não preenchida");
    const plan = str(row, mapping, "plano_atual");
    if (!plan) err("plano_atual", "Plano atual não preenchido");

    // Sexo (opcional; recomendado para grupos +99)
    const sexRaw = str(row, mapping, "sexo");
    const sex = sexRaw ? normalizeSex(sexRaw) : null;
    if (sexRaw && !sex) warn("sexo", `Sexo não reconhecido (${sexRaw}) — use M ou F`);

    // Duplicidade (linha idêntica em todos os campos mapeados)
    const dupKey = Object.values(mapping)
      .map((idx) => (idx === null ? "" : normalizeText(cellToString(row[idx]))))
      .join("|");
    const prev = seen.get(dupKey);
    if (prev !== undefined) warn("linha", `Possível vida duplicada (idêntica à linha ${prev})`);
    else seen.set(dupKey, rowNumber);

    lives.push({
      rowNumber,
      companyName: str(row, mapping, "empresa"),
      cnpj,
      birthDate,
      age,
      ageBand: band?.label ?? null,
      holderType,
      kinship,
      situation,
      cid,
      city,
      uf,
      insurer,
      plan,
      sex,
      issues,
    });
  });

  return { lives, skippedEmpty, missingMappedFields };
}

export function hasErrors(l: { issues: { level: string }[] }) {
  return l.issues.some((i) => i.level === "error");
}

export function describeMissingColumns(fields: LifeField[]) {
  return fields.map((f) => LIFE_FIELD_LABELS[f]);
}
