import { expect, test, type Page } from "@playwright/test";

/**
 * Módulo comercial (prompt mestre do assistente para Head de Planos de Saúde): CRM, reuniões com ata automática,
 * campanhas, mensagens prontas, respostas rápidas, hierarquia e assistente. Requer o seed de desenvolvimento.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? "Besmart@2026";
const RUN = Date.now().toString().slice(-6);
const CLIENT = `E2E Comercial ${RUN}`;

async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.describe.serial("Módulo comercial", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("dashboard mostra indicadores comerciais e alertas", async ({ page }) => {
    await login(page, "head@besmart.local");
    await go(page, "/");
    await expect(page.getByText("Indicadores comerciais")).toBeVisible();
    for (const label of ["Total de leads", "Clientes ativos", "Propostas enviadas", "Vendas fechadas no mês", "Valor em negociação", "Taxa de conversão (12 meses)", "Reuniões da semana", "Campanhas ativas"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Compromissos de hoje")).toBeVisible();
  });

  test("CRM: criar oportunidade, perder exige motivo e voltar etapa", async ({ page }) => {
    await login(page, "corretor@besmart.local");
    await go(page, "/crm?nova=1");
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Cliente ou empresa").fill(CLIENT);
    await dlg.getByLabel("Contato", { exact: true }).fill("Joana Teste");
    await dlg.getByLabel("Quantidade de vidas").fill("40");
    await dlg.getByLabel("Valor estimado (R$/mês)").fill("25.000,00");
    await dlg.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(CLIENT).first()).toBeVisible();

    await go(page, `/crm?q=${encodeURIComponent(CLIENT)}&view=tabela`);
    await go(page, (await page.getByRole("link", { name: CLIENT }).getAttribute("href"))!);
    await expect(page.getByText("Próximos passos sugeridos")).toBeVisible();
    await page.getByRole("button", { name: "Mover etapa" }).click();
    await dlg.getByLabel("Nova etapa").selectOption("perdido");
    await dlg.getByRole("button", { name: "Confirmar" }).click();
    await expect(dlg.getByText("Informe o motivo da perda").first()).toBeVisible();
    await dlg.getByLabel("Motivo da perda").fill("Preço");
    await dlg.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Etapa atualizada")).toBeVisible();

    await page.getByRole("button", { name: "Mover etapa" }).click();
    await dlg.getByLabel("Nova etapa").selectOption("primeiro_contato");
    await dlg.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Perdido → Primeiro contato").first()).toBeVisible();

    await page.getByRole("button", { name: "Copiar" }).first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Joana");
  });

  test("reunião: roteiro de perguntas, ata, WhatsApp e tarefa de retorno", async ({ page }) => {
    await login(page, "corretor@besmart.local");
    await go(page, `/crm?q=${encodeURIComponent(CLIENT)}&view=tabela`);
    await go(page, (await page.getByRole("link", { name: CLIENT }).getAttribute("href"))!);
    await go(page, (await page.getByRole("link", { name: "Nova", exact: true }).getAttribute("href"))!);
    await expect(page.getByText("Roteiro de perguntas")).toBeVisible();
    await page.getByLabel("Resposta para: Qual a operadora atual?").fill("Unimed");
    await page.getByRole("radiogroup", { name: "Resposta: Qual a operadora atual?" }).getByRole("radio", { name: "Resposta recebida" }).click();
    await page.getByRole("radiogroup", { name: "Resposta: Qual o valor pago atualmente?" }).getByRole("radio", { name: "Resposta pendente" }).click();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page).toHaveURL(/\/reunioes\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Finalizar: ata + tarefa de retorno" }).click();
    await expect(page.getByText("Qual a operadora atual? Unimed")).toBeVisible();
    await expect(page.getByText("Mensagem de follow-up (WhatsApp)")).toBeVisible();
    await expect(page.getByText(`Retorno pós-reunião — ${CLIENT}`).first()).toBeVisible();
  });

  test("mensagens prontas: variáveis preenchidas ao copiar; respostas rápidas com aviso", async ({ page }) => {
    await login(page, "head@besmart.local");
    await go(page, "/mensagens");
    await page.getByLabel("Nome do cliente/contato").fill("Ana");
    await page.getByLabel("Empresa", { exact: true }).fill("ACME");
    const card = page.locator("div.rounded-lg", { hasText: "Primeiro contato — empresa" }).first();
    await expect(card.getByText("Olá, Ana!")).toBeVisible();
    await card.getByRole("button", { name: "Copiar" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("ACME");
    await go(page, "/respostas");
    await page.getByLabel("Buscar").fill("portabilidade");
    await expect(page.getByText("variar conforme operadora").first()).toBeVisible();
  });

  test("assistente propõe campanha e só cria após confirmação", async ({ page }) => {
    await login(page, "head@besmart.local");
    await go(page, "/assistente");
    await page.getByPlaceholder(/Quais documentos ainda faltam/).fill("Criar campanha para plano dental PME em dezembro");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Campanha sugerida").first()).toBeVisible();
    await page.getByRole("button", { name: "Confirmar e executar" }).last().click();
    await expect(page.getByText("Ação executada")).toBeVisible();
    await go(page, "/campanhas");
    await expect(page.getByText(/Plano dental PME — dezembro/).first()).toBeVisible();
  });

  test("hierarquia: corretor não vê carteira alheia nem telas de visão global", async ({ page }) => {
    await login(page, "corretor@besmart.local");
    await go(page, "/crm");
    await expect(page.getByText("Construtora Alfa (DEMO)").first()).toBeVisible();
    await expect(page.getByText("Família Souza (DEMO)")).toHaveCount(0);
    await go(page, "/pendencias");
    await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
    const res = await page.request.get("/api/export/oportunidades");
    expect(res.status()).toBe(403);
  });
});
