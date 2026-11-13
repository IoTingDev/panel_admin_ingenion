// Flujo visible de 1.2: con movimientos el ítem se da de baja (conserva historial);
// sin movimientos se elimina. Las cifras se leen de la pantalla y se contrastan con el flujo.
import { test, expect, type Page } from "@playwright/test";

async function entrar(page: Page) {
  await page.clock.install({ time: new Date("2026-11-12T10:00:00-05:00") });
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Cifra de la tarjeta «Referencias» del inventario (componentes). */
async function referencias(page: Page): Promise<number> {
  const tarjeta = page.locator("div", { hasText: /^Referencias/i }).last();
  const texto = await tarjeta.innerText();
  const n = Number((texto.match(/\d+/) ?? [])[0]);
  if (Number.isNaN(n)) throw new Error(`No se pudo leer Referencias de: ${texto}`);
  return n;
}

async function crearItem(page: Page, descripcion: string, cantidad: string): Promise<string> {
  await page.getByRole("button", { name: "Nuevo ítem" }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Subcategoría").fill("Prueba");
  await hoja.getByLabel("Descripción").fill(descripcion);
  await hoja.getByLabel("Cantidad inicial").fill(cantidad);
  await hoja.getByRole("button", { name: "Crear ítem" }).click();
  await expect(hoja).toBeHidden();
  await page.getByPlaceholder("Buscar SKU, descripción o marca…").fill(descripcion);
  const fila = page.getByRole("row", { name: new RegExp(descripcion) });
  await expect(fila).toHaveCount(1);
  const sku = (await fila.locator(".code-id").innerText()).trim();
  expect(sku).toMatch(/^[A-Z]{3}-\d{3}$/);
  return sku;
}

test("ítem con movimientos: se da de baja, conserva historial y sale del listado", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario");
  const antes = await referencias(page);
  const sku = await crearItem(page, "Ítem E2E con historial", "5");
  await page.getByPlaceholder("Buscar SKU, descripción o marca…").fill("");
  await expect.poll(() => referencias(page)).toBe(antes + 1);

  // Un movimiento: desde ese momento el ítem ya no se puede eliminar.
  await page.goto(`/inventario/${sku}`);
  await expect(page.getByRole("button", { name: "Eliminar" })).toBeVisible();
  await page
    .getByRole("button", { name: /registrar movimiento/i })
    .first()
    .click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Salida" }).click();
  await dlg.locator('input[type="number"]').first().fill("2");
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(dlg).toBeHidden();

  await page.reload();
  await expect(page.getByRole("button", { name: "Eliminar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Dar de baja" }).click();
  const confirmar = page.getByRole("alertdialog");
  await expect(confirmar).toContainText(/conserva su historial/i);
  // Sin motivo no se puede confirmar.
  await expect(confirmar.getByRole("button", { name: "Dar de baja" })).toBeDisabled();
  await confirmar.getByRole("textbox").fill("Ya no se usa");
  await confirmar.getByRole("button", { name: "Dar de baja" }).click();
  await expect(confirmar).toBeHidden();

  // Sigue existiendo, en estado Baja, con su movimiento en el historial.
  await page.reload();
  await expect(page.locator("#d-estado")).toHaveValue("Baja");
  await expect(page.getByRole("row").filter({ hasText: /Salida/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Dar de baja" })).toHaveCount(0);

  // Sale del listado y de la cifra de referencias; reaparece al filtrar por «Baja».
  await page.goto("/inventario");
  await expect.poll(() => referencias(page)).toBe(antes);
  await page.getByPlaceholder("Buscar SKU, descripción o marca…").fill("Ítem E2E con historial");
  await expect(page.getByRole("row", { name: /Ítem E2E con historial/ })).toHaveCount(0);
  await page.getByLabel("Estado", { exact: true }).selectOption("Baja");
  await expect(page.getByRole("row", { name: /Ítem E2E con historial/ })).toHaveCount(1);

  // Queda en auditoría.
  await page.goto("/auditoria");
  await expect(page.locator("body")).toContainText("inventario.baja");
  await expect(page.locator("body")).toContainText(sku);
});

test("ítem sin movimientos: se elimina definitivamente, con motivo", async ({ page }) => {
  await entrar(page);
  await page.goto("/inventario");
  const antes = await referencias(page);
  const sku = await crearItem(page, "Ítem E2E sin historial", "1");
  await page.goto(`/inventario/${sku}`);
  await expect(page.getByRole("button", { name: "Dar de baja" })).toHaveCount(0);
  await page.getByRole("button", { name: "Eliminar" }).click();
  const confirmar = page.getByRole("alertdialog");
  await expect(confirmar.getByRole("button", { name: "Eliminar" })).toBeDisabled();
  await confirmar.getByRole("textbox").fill("Creado por error");
  await confirmar.getByRole("button", { name: "Eliminar" }).click();
  await page.waitForURL(/\/inventario$/);
  await expect.poll(() => referencias(page)).toBe(antes);
  // Eliminado de verdad: ni siquiera aparece filtrando por «Baja».
  await page.getByLabel("Estado", { exact: true }).selectOption("Baja");
  await page.getByPlaceholder("Buscar SKU, descripción o marca…").fill("Ítem E2E sin historial");
  await expect(page.getByRole("row", { name: /Ítem E2E sin historial/ })).toHaveCount(0);
  await page.goto("/auditoria");
  await expect(page.locator("body")).toContainText("inventario.eliminar");
});
