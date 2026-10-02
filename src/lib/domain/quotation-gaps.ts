/**
 * Pendências de DADOS da cotação (seção 5 do prompt mestre): lista o que falta preencher antes de enviar
 * às operadoras. Complementa o checklist documental (motor de checklist), olhando campo a campo.
 */
export interface QuotationGapInput {
  stipulantName: string | null;
  estimatedLives: number | null;
  holdersCount: number | null;
  dependentsCount: number | null;
  livesImported: number;
  modality: string | null;
  hasCopay: boolean | null;
  accommodation: string | null;
  coverageArea: string | null;
  employeeContributionType: string | null;
  desiredStartDate: string | null;
  targetDate: string | null;
  clientDeadline: string | null;
  quotationCnpjs: number;
  company: { legalName: string | null; tradeName: string | null; mainCnpj: string | null; segment: string | null; address: string | null; city: string | null; uf: string | null };
  primaryContact: { name: string | null; phone: string | null; email: string | null } | null;
  currentContract: { insurer: string | null; plans: number; monthlyCost: number | null; startDate: string | null; anniversaryDate: string | null } | null;
  documents: string[];
}

export interface QuotationGap {
  group: "Empresa" | "Cotação" | "Contrato atual" | "Documentos";
  field: string;
  /** Link relativo para corrigir (tab da Central da Cotação ou edição da empresa). */
  fix: "empresa" | "wizard2" | "wizard3" | "wizard1" | "documentos" | "base";
}

export function quotationDataGaps(q: QuotationGapInput): QuotationGap[] {
  const g: QuotationGap[] = [];
  const add = (group: QuotationGap["group"], field: string, fix: QuotationGap["fix"]) => g.push({ group, field, fix });
  const c = q.company;
  if (!q.stipulantName?.trim()) add("Empresa", "Nome do estipulante", "wizard1");
  if (!c.mainCnpj) add("Empresa", "CNPJ principal", "empresa");
  if (q.quotationCnpjs === 0) add("Empresa", "CNPJs participantes", "wizard1");
  if (!c.legalName?.trim()) add("Empresa", "Razão social", "empresa");
  if (!c.tradeName?.trim()) add("Empresa", "Nome fantasia", "empresa");
  if (!c.segment?.trim()) add("Empresa", "Ramo de atividade", "empresa");
  if (!c.address?.trim()) add("Empresa", "Endereço", "empresa");
  if (!c.city?.trim() || !c.uf) add("Empresa", "Cidade/Estado", "empresa");
  if (!q.primaryContact?.name) add("Empresa", "Responsável pela empresa (contato principal)", "empresa");
  else {
    if (!q.primaryContact.phone) add("Empresa", "Telefone do responsável", "empresa");
    if (!q.primaryContact.email) add("Empresa", "E-mail do responsável", "empresa");
  }

  if (!q.estimatedLives) add("Cotação", "Quantidade total de vidas", "wizard1");
  if (q.livesImported === 0 && (q.holdersCount === null || q.dependentsCount === null)) add("Cotação", "Titulares e dependentes (ou importar a base de vidas)", "wizard2");
  if (q.livesImported === 0) add("Cotação", "Faixa etária (importar a base de vidas)", "base");
  if (!q.modality) add("Cotação", "Compulsoriedade (opcional/compulsório)", "wizard2");
  if (q.hasCopay === null) add("Cotação", "Coparticipação (sim/não)", "wizard3");
  if (!q.accommodation) add("Cotação", "Acomodação (enfermaria/apartamento)", "wizard2");
  if (!q.coverageArea) add("Cotação", "Abrangência (regional/estadual/nacional)", "wizard2");
  if (!q.employeeContributionType) add("Cotação", "Contributário ou não contributário", "wizard3");
  if (!q.desiredStartDate) add("Cotação", "Data desejada para início", "wizard2");
  if (!q.clientDeadline && !q.targetDate) add("Cotação", "Prazo esperado pelo cliente", "wizard2");

  const cc = q.currentContract;
  if (!cc) add("Contrato atual", "Operadora, plano, valor e vigência atuais (cadastrar contrato da empresa)", "empresa");
  else {
    if (!cc.insurer) add("Contrato atual", "Operadora atual", "empresa");
    if (cc.plans === 0) add("Contrato atual", "Plano atual", "empresa");
    if (cc.monthlyCost === null) add("Contrato atual", "Valor atual", "empresa");
    if (!cc.startDate && !cc.anniversaryDate) add("Contrato atual", "Vigência atual", "empresa");
  }

  const has = (t: string) => q.documents.includes(t);
  if (!has("contrato_social")) add("Documentos", "Cartão CNPJ e contrato social", "documentos");
  if (!has("base_vidas") && q.livesImported === 0) add("Documentos", "Relação de vidas", "base");
  if (!has("fatura")) add("Documentos", "Fatura atual", "documentos");
  if (!has("comprovante_endereco")) add("Documentos", "Comprovante de endereço", "documentos");
  return g;
}
