// Panel v3 — nombres («Servicios técnicos», «Proyectos I+D+I») y tres grupos de inventario.
import { test, expect } from "@playwright/test";
import { entrar, leerDbV3 } from "./ayudas";

test("el menú y los títulos usan «Servicios técnicos» y «Proyectos I+D+I»", async ({ page }) => {
  await entrar(page);
  const menu = page.locator("aside nav");
  await expect(menu.getByRole("link", { name: "Servicios técnicos" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Proyectos I+D+I" })).toBeVisible();
  await expect(menu.getByRole("link", { name: /^Trabajos$/ })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: /^Proyectos$/ })).toHaveCount(0);

  await page.goto("/servicios-tecnicos");
  await expect(page.getByRole("heading", { name: "Servicios técnicos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo servicio técnico" })).toBeVisible();
  await page.goto("/proyectos");
  await expect(page.getByRole("heading", { name: "Proyectos I+D+I" })).toBeVisible();
});

test("Inicio: «Servicios en curso» y «Programados esta semana»; ningún «Trabajos» visible", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/");
  const cuerpo = page.locator("main");
  await expect(cuerpo).toContainText("Servicios en curso");
  await expect(cuerpo).toContainText("Programados esta semana");
  await expect(cuerpo).toContainText("Servicios vencidos sin iniciar");
  await expect(cuerpo).not.toContainText(/Trabajos? (en curso|vencidos?)/);
});

test("las rutas viejas /trabajos redirigen a /servicios-tecnicos (lista y ficha)", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/trabajos");
  await expect(page).toHaveURL(/\/servicios-tecnicos$/);
  const db = await leerDbV3(page);
  const t = db.trabajos[0]!;
  await page.goto(`/trabajos/${t.id}`);
  await expect(page).toHaveURL(new RegExp(`/servicios-tecnicos/${t.id}$`));
  await expect(page.getByRole("heading", { name: t.titulo })).toBeVisible();
});

test("Ctrl+K encuentra «Servicios técnicos» y lleva a la ruta nueva", async ({ page }) => {
  await entrar(page);
  await expect(page.getByText("Juan Camilo").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Buscar en IoTing…").fill("Servicios");
  await page.getByRole("option", { name: "Servicios técnicos", exact: true }).click();
  await expect(page).toHaveURL(/\/servicios-tecnicos$/);
});

test("alta de un servicio técnico: textos nuevos y el código conserva el prefijo TT-", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/servicios-tecnicos");
  await page.getByRole("button", { name: "Nuevo servicio técnico" }).click();
  const hoja = page.getByRole("dialog");
  await expect(hoja).toContainText("Nuevo servicio técnico");
  await hoja.getByLabel("Cliente").selectOption({ index: 1 });
  await hoja.getByLabel("Título").fill("Servicio de prueba v3");
  await hoja.getByRole("button", { name: "Guardar servicio técnico" }).click();
  await expect(page.locator("body")).toContainText("Servicio técnico TT-0004 guardado");
  await expect(page.getByRole("row", { name: /TT-0004/ })).toBeVisible();
});

test("Inventario: tres grupos (106/36/8) y las categorías de seguridad dentro de Componentes", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario");
  const pestanas = page.getByRole("tab");
  await expect(pestanas).toHaveText(["Componentes", "Herramientas", "Equipos"]);
  await expect(page.getByRole("tab", { name: /Seguridad/ })).toHaveCount(0);
  // Referencias por grupo contra la base guardada (106 / 36 / 8).
  const db = await leerDbV3(page);
  const porGrupo = (g: string) => db.items.filter((i) => i.grupo === g).length;
  expect([porGrupo("componentes"), porGrupo("herramientas"), porGrupo("equipos")]).toEqual([
    106, 36, 8,
  ]);
  const referencias = async () =>
    Number(
      (
        await page
          .locator("div", { hasText: /^Referencias/i })
          .last()
          .innerText()
      ).match(/\d+/)?.[0],
    );
  await expect.poll(referencias).toBe(106);
  await page.getByRole("tab", { name: "Herramientas" }).click();
  await expect.poll(referencias).toBe(36);
  await page.getByRole("tab", { name: "Equipos" }).click();
  await expect.poll(referencias).toBe(8);
  // Las categorías de seguridad y telecom se ofrecen dentro de Componentes.
  await page.getByRole("tab", { name: "Componentes" }).click();
  const categorias = await page
    .getByLabel("Categoría", { exact: true })
    .locator("option")
    .allInnerTexts();
  for (const c of [
    "Instrumentación",
    "Cámaras",
    "Grabadores (DVR/NVR)",
    "Alarmas y sensores",
    "Cableado y conectividad",
    "Redes y telecom",
    "Energía y respaldo",
    "Accesorios de instalación",
  ])
    expect(categorias).toContain(c);
});

test("Valor del inventario: el filtro de grupo ofrece solo tres grupos y las gráficas no tienen «Seguridad»", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario/valor");
  await expect(page.getByLabel("Grupo", { exact: true })).toBeVisible();
  const opciones = await page
    .getByLabel("Grupo", { exact: true })
    .locator("option")
    .allInnerTexts();
  expect(opciones).toEqual(["Grupo", "Componentes", "Herramientas", "Equipos"]);
  await expect(page.locator("body")).not.toContainText("Seguridad");
});

test("Configuración: depreciación por grupo solo para tres grupos", async ({ page }) => {
  await entrar(page);
  await page.goto("/configuracion");
  await expect(page.getByText(/^Vida útil · /)).toHaveText([
    "Vida útil · Componentes",
    "Vida útil · Herramientas",
    "Vida útil · Equipos",
  ]);
  await expect(page.getByRole("heading", { name: /Seguridad/ })).toHaveCount(0);
});

test("un CSV viejo con grupo «seguridad» se acepta, se toma como componentes y la vista previa avisa", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario/valor");
  await page.getByRole("button", { name: "Importar valores" }).click();
  const csv = [
    "sku,descripcion,marca_referencia,grupo_propuesto,categoria_propuesta,cantidad_inicial,anio_compra,valor_unitario",
    "CAB-003,Alambre para alarmas,,seguridad,Cableado y conectividad,1,2025,8000",
  ].join("\n");
  const dlg = page.getByRole("dialog");
  await dlg
    .getByLabel("Archivo de valores")
    .setInputFiles({ name: "viejo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(dlg.getByTestId("resumen-previa")).toHaveText(
    "1 filas · 1 con cambios · 0 con error",
  );
  await expect(dlg.getByTestId("aviso-fila")).toContainText("«seguridad» ya no existe");
  await dlg.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(dlg).toBeHidden();
  const db = await leerDbV3(page);
  const it = db.items.find((i) => i.sku === "CAB-003")!;
  expect([it.grupo, it.valorUnitario]).toEqual(["componentes", 8000]);
});
