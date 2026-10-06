import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";

/** Carrossel para Instagram: briefing → slides editáveis → prévia PNG → ZIP. Requer o seed de desenvolvimento. */
const PASSWORD = process.env.E2E_PASSWORD ?? "Besmart@2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.describe.serial("Carrossel Instagram", () => {
  test("gera pelo modelo pronto, atualiza a prévia ao editar e baixa o ZIP", async ({ page }) => {
    await login(page, "comercial@besmart.local");
    await page.goto(`/carrossel?tema=${encodeURIComponent("Coparticipação vale a pena?")}`);
    await expect(page.getByLabel("Tema do carrossel")).toHaveValue("Coparticipação vale a pena?");
    await page.getByLabel("@ do perfil").fill("besmart.saude");
    await page.getByRole("button", { name: "Gerar carrossel" }).click();
    await expect(page.getByText("07/07 · CTA final")).toBeVisible();

    const previews = page.locator('img[alt^="Slide "]');
    await expect(previews).toHaveCount(7, { timeout: 90_000 });
    await expect(page.getByText("Atualizando…")).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByLabel("Pendente")).toHaveCount(0);

    // editar um título re-renderiza só aquele slide
    const before = await previews.nth(1).getAttribute("src");
    await page.getByLabel("Título", { exact: true }).nth(1).fill("Mensalidade mais baixa");
    await expect(previews.nth(1)).toHaveAttribute("alt", "Slide 2: Mensalidade mais baixa");
    await expect.poll(async () => (await previews.nth(1).getAttribute("src")) !== before, { timeout: 60_000 }).toBe(true);

    // texto que não cabe nem com a fonte reduzida é apontado no slide e no checklist
    const body = page.getByLabel("Texto", { exact: true }).first();
    const list = page.getByLabel("Lista", { exact: true }).first();
    const original = await body.inputValue();
    await body.fill("Texto muito longo para o slide. ".repeat(9));
    await list.fill(Array.from({ length: 5 }, (_, i) => `Item ${i + 1} com bastante texto para ocupar mais de uma linha no quadro do carrossel`).join("\n"));
    await expect(page.getByText("Texto longo demais para o quadro")).toBeVisible();
    await expect(page.getByText("Encurte os slides 02")).toBeVisible();
    await list.fill("");
    await body.fill(original);
    await expect(page.getByText("Texto longo demais para o quadro")).toHaveCount(0);

    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), page.getByRole("button", { name: "Baixar ZIP" }).click()]);
    expect(download.suggestedFilename()).toBe("carrossel-coparticipacao-vale-a-pena.zip");
    const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!));
    expect(Object.keys(zip.files).sort()).toEqual(["legenda.txt", ...Array.from({ length: 7 }, (_, i) => `slide_0${i + 1}.png`)]);
    const png = await zip.file("slide_01.png")!.async("nodebuffer");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1080]);
  });

  test("calendário editorial abre o carrossel com o tema do post", async ({ page }) => {
    await login(page, "comercial@besmart.local");
    await page.goto("/calendario-editorial");
    await page.getByRole("button", { name: "Gerar calendário" }).click();
    const link = page.getByRole("link", { name: "Criar carrossel" }).first();
    await expect(link).toBeVisible({ timeout: 60_000 });
    await link.click();
    await expect(page).toHaveURL(/\/carrossel\?tema=/);
    await expect(page.getByLabel("Tema do carrossel")).not.toHaveValue("");
  });

  test("assistente monta o roteiro e indica a tela do carrossel", async ({ page }) => {
    await login(page, "comercial@besmart.local");
    await page.goto("/assistente");
    await page.getByPlaceholder(/Quais documentos ainda faltam/).fill("Crie um carrossel sobre portabilidade de carências com 5 slides");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Palavra-chave: \**PORTAR/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/\/carrossel\?tema=/).first()).toBeVisible();
  });

  test("API exige login", async ({ request }) => {
    const res = await request.post("/api/carrossel/zip", { data: {}, headers: { Origin: process.env.E2E_BASE_URL ?? "http://localhost:3000" } });
    expect(res.status()).toBe(401);
  });
});
