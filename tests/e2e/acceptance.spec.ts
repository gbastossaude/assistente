import { expect, test, type Page } from "@playwright/test";
import { buildBaseWorkbook, sampleLivesRows, syntheticCnpj } from "../../scripts/sample-data";
import { formatCnpj } from "../../src/lib/domain/cnpj";

const EMAIL = process.env.E2E_EMAIL ?? "head@besmart.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "Besmart@2026";
const RUN = Date.now().toString().slice(-6);
const COMPANY = `E2E Indústria ${RUN}`;
const CNPJ = syntheticCnpj(Number(RUN));

/** Navega e aguarda a hidratação (rede ociosa) antes de interagir. */
async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.describe.serial("Critérios de aceite da primeira versão utilizável", () => {
  let quotationUrl = "";

  test.beforeEach(async ({ page }) => login(page));

  test("1. cadastrar uma empresa", async ({ page }) => {
    await go(page, "/empresas/nova");
    await page.getByLabel("Razão social").fill(COMPANY);
    await page.getByLabel("CNPJ principal").fill(formatCnpj(CNPJ));
    await page.getByLabel("Quantidade estimada de vidas").fill("320");
    await page.getByRole("button", { name: "Cadastrar empresa" }).click();
    await expect(page.getByRole("heading", { name: COMPANY })).toBeVisible();
  });

  test("2-4. criar cotação +99, escolher NEW e ver checklist automático", async ({ page }) => {
    await go(page, "/cotacoes/nova");
    await page.getByLabel("Empresa").selectOption({ label: COMPANY });
    await page.getByRole("button", { name: /NEW — Nova contratação/ }).click();
    await page.getByLabel("Número estimado de vidas").fill("320");
    await page.getByLabel("Motivo da cotação").fill("Redução de custo");
    await page.getByRole("button", { name: /Abrir cotação/ }).click();
    await expect(page).toHaveURL(/wizard\?step=2/);
    quotationUrl = page.url().replace(/\/wizard.*$/, "");
    await go(page, `${quotationUrl}?tab=checklist`);
    await expect(page.getByText("Sinistralidade completa e atualizada").or(page.getByText("Fatura do plano atual")).first()).toBeVisible();
    await page.getByRole("button", { name: /Todos \(/ }).click();
    await expect(page.getByText("CNPJ(s) participantes")).toBeVisible();
  });

  test("5. anexar documentos", async ({ page }) => {
    await go(page, `${quotationUrl}?tab=documentos`);
    await page.getByLabel("Tipo do documento").selectOption("fatura");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "fatura-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    await expect(page.getByText("fatura-e2e.pdf")).toBeVisible();
  });

  test("6-8. importar planilha de vidas, ver erros antes e distribuição depois", async ({ page }) => {
    await go(page, `${quotationUrl}?tab=base`);
    const rows = sampleLivesRows({ companyName: COMPANY, cnpjs: [CNPJ], insurer: "OPERADORA X", plans: ["PLANO A", "PLANO B"], rows: 40, withErrors: true, seed: 3 });
    await page.locator('input[type="file"][accept=".xlsx,.xlsm"]').setInputFiles({ name: "BASE E2E.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12", buffer: await buildBaseWorkbook(rows) });
    await expect(page.getByText(/Pré-visualização: BASE E2E\.xlsm/)).toBeVisible();
    await expect(page.getByText("CNPJ inválido (12.345.678/0001-00)")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar importação" }).click();
    await expect(page.getByText("Total de vidas")).toBeVisible();
    await expect(page.getByText("Vidas por faixa etária (ANS)")).toBeVisible();
  });

  test("9-10. visualizar pendências e bloquear 'Pronta para mercado' com obrigatório pendente", async ({ page }) => {
    await go(page, `${quotationUrl}?tab=visao`);
    await expect(page.getByText("Pendências críticas").first()).toBeVisible();
    await page.getByRole("button", { name: "Alterar status" }).click();
    await page.getByLabel("Novo status").selectOption("pronta_para_mercado");
    await expect(page.getByText(/item\(ns\) obrigatório\(s\) pendente\(s\)/)).toBeVisible();
    await page.getByRole("button", { name: "Confirmar mudança" }).click();
    await expect(page.getByText(/Justificativa|override/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await go(page, `/pendencias`);
    await expect(page.getByText(COMPANY).first()).toBeVisible();
  });

  test("11-12. selecionar operadoras e controlar envio por operadora", async ({ page }) => {
    await go(page, `${quotationUrl}?tab=operadoras`);
    await page.getByRole("button", { name: "Selecionar operadoras" }).click();
    await page.getByLabel("Amil").check();
    await page.getByRole("button", { name: /^Adicionar/ }).click();
    await expect(page.getByText("Não enviada")).toBeVisible();
    await page.getByRole("button", { name: "Registrar envio" }).click();
    await page.getByLabel("Protocolo").fill(`E2E-${RUN}`);
    await page.getByRole("button", { name: "Registrar envio" }).last().click();
    await expect(page.getByText(`Protocolo E2E-${RUN}`)).toBeVisible();
    await expect(page.getByText("Enviada", { exact: true })).toBeVisible();
  });

  test("13. criar tarefas e follow-ups", async ({ page }) => {
    await go(page, `${quotationUrl}?tab=tarefas`);
    await expect(page.getByText(/Follow-up Amil/).first()).toBeVisible(); // criado automaticamente pelo envio
    await page.getByRole("button", { name: "Nova tarefa" }).click();
    await page.getByLabel("Título").fill(`Ligar para o RH ${RUN}`);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(`Ligar para o RH ${RUN}`, { exact: true })).toBeVisible();
  });

  test("14. ver tudo no dashboard do dia", async ({ page }) => {
    await go(page, "/?escopo=equipe");
    await expect(page.getByText("Prioridades do dia")).toBeVisible();
    await expect(page.getByText("Grandes contas em andamento")).toBeVisible();
  });

  test("15. pesquisar empresa/cotação rapidamente", async ({ page }) => {
    await page.getByLabel("Busca global").fill(RUN);
    await page.getByLabel("Busca global").press("Enter");
    await expect(page.getByText(COMPANY).first()).toBeVisible();
  });

  test("assistente responde com dados reais (modo local ou Claude)", async ({ page }) => {
    await go(page, "/assistente");
    await page.getByLabel("Pergunta ao assistente").fill(`O que está pendente na cotação da empresa ${COMPANY}?`);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/não informado|não enviado|Nenhuma pendência/).first()).toBeVisible({ timeout: 90_000 });
  });
});
