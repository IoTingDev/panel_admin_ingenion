// Flujos que funcionan HOY. Deben pasar antes y después de cada fase del encargo v2.
import { test, expect, type Page } from "@playwright/test";

async function entrar(page: Page) {
  await page.clock.install({ time: new Date("2026-11-12T10:00:00-05:00") });
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("login: entra al panel y una ruta privada sin sesión redirige", async ({ page }) => {
  await page.goto("/clientes");
  await page.waitForURL(/\/login/);
  await entrar(page);
  await expect(page.getByText("Juan Camilo").first()).toBeVisible();
});

test("clientes: crear y editar", async ({ page }) => {
  await entrar(page);
  await page.goto("/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Razón social", { exact: true })
    .fill("Cliente Prueba E2E S.A.S.");
  await page.getByRole("dialog").getByLabel("NIT", { exact: true }).fill("900.111.222-3");
  await page.getByRole("dialog").getByLabel("Ciudad", { exact: true }).fill("Santa Marta");
  await page
    .getByRole("dialog")
    .getByLabel("Nombre de contacto", { exact: true })
    .fill("Ana Prueba");
  await page
    .getByRole("dialog")
    .getByLabel("Correo de contacto", { exact: true })
    .fill("ana@prueba.co");
  await page.getByRole("dialog").getByLabel("Teléfono", { exact: true }).fill("3001234567");
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByText("Cliente Prueba E2E S.A.S.").first()).toBeVisible();

  await page.getByRole("button", { name: "Editar Cliente Prueba E2E S.A.S." }).click();
  await page.getByRole("dialog").getByLabel("Ciudad", { exact: true }).fill("Barranquilla");
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByText("Barranquilla").first()).toBeVisible();
});

test("usuarios: invitar y dar de baja", async ({ page }) => {
  await entrar(page);
  await page.goto("/usuarios");
  await page.getByRole("button", { name: /invitar usuario/i }).click();
  await page.locator("#i-cl").selectOption({ index: 1 });
  await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Usuario E2E");
  await page
    .getByRole("dialog")
    .getByLabel("Correo", { exact: true })
    .fill("usuario.e2e@prueba.co");
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  const fila = page.getByRole("row", { name: /Usuario E2E/ });
  await expect(fila).toBeVisible();
  await fila.getByTitle("Dar de baja").click();
  await page.getByRole("alertdialog").getByRole("textbox").fill("Prueba E2E");
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("row", { name: /Usuario E2E/ })).toContainText(/baja/i);
});

test("proyectos: crear y mover en el kanban (drag & drop)", async ({ page }) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page.getByRole("button", { name: /nuevo proyecto/i }).click();
  await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Proyecto E2E");
  await page.locator("#p-cliente").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(page.getByText("Proyecto E2E").first()).toBeVisible();

  await page.getByTitle("Vista tablero").click();
  const tarjeta = page.locator("article", { hasText: "Proyecto E2E" });
  const columnas = page.locator("section.min-h-80");
  const antes = await columnas.nth(3).locator("article").count();
  const o = (await tarjeta.boundingBox())!;
  const d = (await columnas.nth(3).boundingBox())!;
  await page.mouse.move(o.x + 20, o.y + 20);
  await page.mouse.down();
  await page.mouse.move(o.x + 40, o.y + 40, { steps: 5 });
  await page.mouse.move(d.x + 60, d.y + 60, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up(); // Finalizado
  await expect(columnas.nth(3).locator("article")).toHaveCount(antes + 1);
  await expect(columnas.nth(3).locator("article", { hasText: "Proyecto E2E" })).toBeVisible();
});

test("inventario: salida y entrada recalculan el stock", async ({ page }) => {
  await entrar(page);
  await page.goto("/inventario/SEN-002"); // stock inicial 10
  const stock = async () =>
    Number(
      await page
        .locator("xpath=//p[normalize-space()='Stock actual']/following-sibling::p[1]")
        .innerText(),
    );
  const inicial = await stock();
  expect(inicial).toBeGreaterThan(3);
  await page
    .getByRole("button", { name: /registrar movimiento/i })
    .first()
    .click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Salida" }).click();
  await dlg.locator('input[type="number"]').first().fill("3");
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect.poll(stock).toBe(inicial - 3);
  await page
    .getByRole("button", { name: /registrar movimiento/i })
    .first()
    .click();
  await dlg.getByRole("button", { name: "Entrada" }).click();
  await dlg.locator('input[type="number"]').first().fill("2");
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect.poll(stock).toBe(inicial - 3 + 2);
});

test("inventario: exportar Excel, PDF y JSON", async ({ page }) => {
  await entrar(page);
  await page.goto("/inventario");
  for (const nombre of ["Excel", "PDF", "JSON"]) {
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: nombre, exact: true }).click(),
    ]);
    expect(descarga.suggestedFilename().length).toBeGreaterThan(3);
  }
});

test("inventario: importar movimientos CSV", async ({ page }) => {
  await entrar(page);
  await page.goto("/inventario");
  await page.getByRole("button", { name: "Importar CSV" }).click();
  const csv = "fecha,sku,tipo,cantidad,proyecto,nota\n2026-11-01,SEN-002,Salida,1,,e2e\n";
  await page
    .getByLabel("Archivo CSV")
    .setInputFiles({ name: "mov.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const dlg = page.getByRole("dialog");
  await expect(dlg).toContainText("SEN-002");
  await expect(dlg.getByRole("cell", { name: "OK", exact: true })).toBeVisible();
  await dlg.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(dlg).toBeHidden();
});

test("búsqueda global (cmdk) con Ctrl+K", async ({ page }) => {
  await entrar(page);
  await expect(page.getByText("Juan Camilo").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Buscar en IoTing…").fill("Invent");
  await page.getByRole("option", { name: "Inventario", exact: true }).click();
  await expect(page).toHaveURL(/\/inventario$/);
});

test("tema: cambia entre claro y oscuro", async ({ page }) => {
  await entrar(page);
  await page.goto("/configuracion");
  await page.getByRole("button", { name: /oscuro/i }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: /claro/i }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
