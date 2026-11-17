// Panel v4 — Inicio por secciones (A), servicios por cliente (B), sectores (C), columna «Fin» (D),
// «Fecha de entrega» y orden (E), y valor por tipo en Inventario (F).
import { test, expect } from "@playwright/test";
import { entrar, leerDb } from "./ayudas";

test("A — Inicio: cuatro secciones en orden, «Completados (total)» y «Proyectos finalizados»", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/");
  const titulos = page.locator("main section[aria-label] h2");
  await expect(titulos).toHaveText([
    "Clientes y usuarios",
    "Proyectos I+D+I",
    "Servicios técnicos",
    "Inventario",
  ]);
  const seccion = (n: string) => page.locator(`main section[aria-label="${n}"]`);
  await expect(seccion("Clientes y usuarios")).toContainText("Clientes activos");
  await expect(seccion("Clientes y usuarios")).toContainText("Usuarios activos");
  await expect(seccion("Clientes y usuarios")).not.toContainText("Proyectos");
  for (const t of ["Proyectos en operación", "Proyectos pausados", "Proyectos finalizados"])
    await expect(seccion("Proyectos I+D+I")).toContainText(t);
  await expect(seccion("Proyectos I+D+I")).toContainText("Proyectos por estado");
  for (const t of [
    "Servicios en curso",
    "Programados esta semana",
    "Servicios vencidos sin iniciar",
    "Completados (total)",
  ])
    await expect(seccion("Servicios técnicos")).toContainText(t);
  for (const t of [
    "Referencias de inventario",
    "Unidades en stock",
    "Ítems por reponer",
    "Movimientos (30 días)",
    "Movimientos de inventario",
  ])
    await expect(seccion("Inventario")).toContainText(t);
  await expect(page.locator("main")).not.toContainText("Completados (30 días)");
  // «Completados (total)» cuenta todos los completados, no solo los de 30 días.
  const db = await leerDb(page);
  const total = db.trabajos.filter((t) => t.estado === "completado").length;
  await expect(
    seccion("Servicios técnicos").locator("p", { hasText: /^Completados/ }),
  ).toBeVisible();
  await expect(seccion("Servicios técnicos")).toContainText(String(total));
});

test("A — Inicio sin desbordes en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page);
  await page.goto("/");
  await expect(page.locator("main section[aria-label]")).toHaveCount(4);
  const ancho = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    ventana: window.innerWidth,
  }));
  expect(ancho.scroll).toBeLessThanOrEqual(ancho.ventana);
});

test("B — Clientes: columna «Servicios» con completados y «N en curso»", async ({ page }) => {
  await entrar(page);
  await page.goto("/clientes");
  await expect(page.getByRole("columnheader", { name: "Servicios" })).toBeVisible();
  const db = await leerDb(page);
  const trab = db.trabajos as { clienteId: string; estado: string }[];
  const celdas = page.getByTestId("servicios-cliente");
  await expect(celdas.first()).toBeVisible();
  // El cliente con más servicios completados muestra su número y, si hay, «N en curso».
  const conteo = new Map<string, { c: number; e: number }>();
  for (const t of trab) {
    const n = conteo.get(t.clienteId) ?? { c: 0, e: 0 };
    if (t.estado === "completado") n.c++;
    if (t.estado === "en_curso") n.e++;
    conteo.set(t.clienteId, n);
  }
  const [id, n] = [...conteo.entries()].sort((a, b) => b[1].c - a[1].c)[0] ?? ["", { c: 0, e: 0 }];
  const cliente = db.clientes.find((c) => c.id === id);
  const fila = page.getByRole("row", { name: new RegExp(cliente?.razonSocial ?? "x") }).first();
  await expect(fila.getByTestId("servicios-cliente")).toContainText(String(n.c));
  if (n.e > 0) await expect(fila.getByTestId("servicios-cliente")).toContainText(`${n.e} en curso`);
});

test("C — Sectores: Agroindustrial sí; cacao, café y mango no (formulario y filtro)", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/clientes");
  await page
    .getByRole("button", { name: /Nuevo cliente/ })
    .first()
    .click();
  const opciones = await page.locator("#sector option").allTextContents();
  expect(opciones).toContain("Agroindustrial");
  for (const s of ["cacao", "café", "mango"])
    expect(opciones.map((o) => o.toLowerCase())).not.toContain(s);
  // «Agroindustrial» es el valor por defecto del formulario (ya no «cacao»).
  await expect(page.locator("#sector")).toHaveValue("Agroindustrial");
  const db = await leerDb(page);
  expect(db.config.sectores).toContain("Agroindustrial");
  for (const s of ["cacao", "café", "mango"]) expect(db.config.sectores).not.toContain(s);
  for (const c of db.clientes) expect(["cacao", "café", "mango"]).not.toContain(c.sector);
});

test("D — Proyectos: columna «Fin» (fecha, «Vigente» o «Sin fecha»)", async ({ page }) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page
    .getByRole("button", { name: /tabla/i })
    .first()
    .click()
    .catch(() => {});
  await expect(page.getByRole("columnheader", { name: "Fin" })).toBeVisible();
  const db = await leerDb(page);
  const ps = db.proyectos as { estado: string; fechaFin?: string }[];
  const celdas = page.getByTestId("fin-proyecto");
  const textos = await celdas.allTextContents();
  expect(textos.length).toBeGreaterThan(0);
  const vigentes = ps.filter((p) =>
    ["en_desarrollo", "activo", "pausado"].includes(p.estado),
  ).length;
  expect(textos.filter((t) => t.trim() === "Vigente").length).toBeLessThanOrEqual(vigentes);
  if (ps.some((p) => p.estado === "finalizado" && p.fechaFin))
    expect(textos.some((t) => /\d/.test(t))).toBe(true);
});

test("E — Servicios técnicos: «Fecha de entrega» y orden por entrega (no por código)", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/servicios-tecnicos");
  await expect(page.getByRole("columnheader", { name: "Fecha de entrega" })).toBeVisible();
  const db = await leerDb(page);
  const ts = db.trabajos as {
    codigo: string;
    estado: string;
    fechaProgramada?: string;
    fechaFin?: string;
  }[];
  const clave = (t: (typeof ts)[number]) =>
    (t.estado === "completado" && t.fechaFin ? t.fechaFin : t.fechaProgramada)?.slice(0, 10) ?? "";
  const esperado = [...ts]
    .sort((a, b) =>
      clave(a) !== clave(b)
        ? clave(a) < clave(b)
          ? 1
          : -1
        : b.codigo.localeCompare(a.codigo, undefined, { numeric: true }),
    )
    .map((t) => t.codigo);
  const codigos = (await page.locator("tbody tr td.code-id").allTextContents()).map((x) =>
    x.trim(),
  );
  expect(codigos.length).toBeGreaterThan(2);
  expect(codigos).toEqual(esperado.slice(0, codigos.length));
});

test("F — Inventario: sin «Ítems por reponer»; con «Valor del inventario por tipo» y su aviso", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario");
  await expect(page.getByRole("heading", { name: "Inventario" }).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Ítems por reponer");
  const bloque = page.getByTestId("valor-por-tipo");
  await expect(bloque).toBeVisible();
  await expect(bloque).toContainText("Valor del inventario por tipo");
  for (const g of ["componentes", "herramientas", "equipos"])
    await expect(page.getByTestId(`valor-tipo-${g}`)).toBeVisible();
  await expect(page.getByTestId("aviso-valor-tipo")).toContainText(
    /Calculado con \d+ de \d+ ítems que tienen valor cargado/,
  );
  // Va encima de la tabla de ítems, que no cambia.
  const yBloque = (await bloque.boundingBox())?.y ?? 0;
  const yTabla = (await page.locator("table").first().boundingBox())?.y ?? 0;
  expect(yBloque).toBeLessThan(yTabla);
  const cabeceras = (await page.locator("table thead th").allTextContents()).join("|");
  for (const c of ["SKU", "Stock", "Estado"]) expect(cabeceras).toContain(c);
  // Los tres grupos siguen: Componentes, Herramientas, Equipos.
  for (const g of ["Componentes", "Herramientas", "Equipos"])
    await expect(page.getByRole("tab", { name: g })).toBeVisible();
});

test("E — un servicio sin completar muestra su fecha programada en tono secundario; el formulario y el detalle dicen «Fecha de entrega»", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/servicios-tecnicos");
  const programadas = page.getByTestId("programada-servicio");
  await expect(programadas.first()).toBeVisible();
  await expect(programadas.first()).toHaveClass(/text-muted-foreground/);
  await expect(programadas.first()).toContainText(/\d{4}/);
  // las completadas muestran su entrega en tono normal (sin la marca de «programada»)
  const completadas = page
    .getByRole("row")
    .filter({ hasText: "Completado" })
    .getByTestId("entrega-servicio");
  if ((await completadas.count()) > 0)
    await expect(completadas.first().getByTestId("programada-servicio")).toHaveCount(0);
  // formulario: la etiqueta cambió, el campo es el mismo
  await page.getByRole("button", { name: "Nuevo servicio técnico" }).click();
  await expect(page.getByLabel("Fecha de entrega")).toBeVisible();
  await expect(page.getByLabel("Fecha de fin")).toHaveCount(0);
});
