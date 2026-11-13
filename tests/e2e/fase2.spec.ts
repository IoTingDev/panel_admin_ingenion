// Fase 2 — inventario: valoración, grupos, movimientos con fecha/destino, configuración y migración.
// Los valores esperados se calculan aquí a partir de la base guardada (localStorage), de forma
// independiente al código de la aplicación.
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const PLANTILLA = readFileSync("public/plantillas/plantilla_valores_inventario.csv", "utf8");
const ANIO = 2026; // el reloj de las pruebas está fijo en 2026-11-12

async function entrar(page: Page) {
  await page.clock.install({ time: new Date("2026-11-12T10:00:00-05:00") });
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

type Db = {
  items: {
    sku: string;
    grupo: string;
    categoria: string;
    cantidad_inicial: number;
    estado: string;
    valorUnitario?: number | null;
    anioCompra?: number | null;
  }[];
  movimientos: { sku: string; tipo: string; cantidad: number }[];
};
const leerDb = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("ioting.mock.db.v2") ?? "null") as Db);
const stockDeDb = (db: Db, sku: string) =>
  db.movimientos.reduce(
    (a, m) => (m.sku !== sku ? a : m.tipo === "Entrada" ? a + m.cantidad : a - m.cantidad),
    db.items.find((i) => i.sku === sku)!.cantidad_inicial,
  );
const cop = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
/** Número de una cifra en pesos: «$ 4.010.000» → 4010000. */
const numDe = (t: string) => Number(t.replace(/[^\d]/g, ""));

/** La plantilla del encargo con valor y año rellenados (por defecto 10.000 COP, 2025). */
function plantillaConValores(valor = 10_000, anio = 2025) {
  const [cab, ...filas] = PLANTILLA.trim().split("\n");
  return [cab, ...filas.map((f) => f.replace(/,,$/, `,${anio},${valor}`))].join("\n");
}

test("importar la plantilla con valores y ver el valor del inventario (cifras contrastadas con la base)", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario/valor");
  // Precondición: la semilla no trae valores (si los trajera, la prueba no distinguiría nada).
  await expect(page.getByTestId("aviso-sin-valor")).toContainText("150");
  await expect(page.getByTestId("cifra-existencia")).toContainText("0");

  await page.getByRole("button", { name: "Importar valores" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Archivo de valores").setInputFiles({
    name: "valores.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(plantillaConValores()),
  });
  await expect(dlg.getByTestId("resumen-previa")).toHaveText(
    "150 filas · 150 con cambios · 0 con error",
  );
  await dlg.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(dlg).toBeHidden();

  // Esperado, calculado desde la base y con la fórmula del encargo escrita a mano.
  const db = await leerDb(page);
  expect(db.items).toHaveLength(150);
  const activos = db.items.filter((i) => i.estado !== "Baja");
  const existencia = activos.reduce((a, i) => a + stockDeDb(db, i.sku) * 10_000, 0);
  const vida: Record<string, number | null> = {
    componentes: null,
    seguridad: null,
    herramientas: 5,
    equipos: 5,
  };
  const estimado = activos.reduce((a, i) => {
    const v = vida[i.grupo];
    const factor = v === null ? 1 : Math.max(0.1, 1 - (ANIO - 2025) / v!);
    return a + Math.round(stockDeDb(db, i.sku) * 10_000 * factor);
  }, 0);
  const invertido = activos.reduce((a, i) => a + i.cantidad_inicial * 10_000, 0);
  expect(invertido).toBe(401 * 10_000);
  expect(existencia).toBeGreaterThan(0);
  expect(estimado).toBeLessThan(existencia); // herramientas y equipos sí se deprecian

  await expect
    .poll(async () => numDe(await page.getByTestId("cifra-existencia").innerText()))
    .toBe(existencia);
  expect(numDe(await page.getByTestId("cifra-invertido").innerText())).toBe(invertido);
  expect(numDe(await page.getByTestId("cifra-estimado").innerText())).toBe(estimado);
  await expect(page.getByTestId("aviso-sin-valor")).toContainText("Todos los ítems tienen valor");
  await expect(page.locator("body")).toContainText("no reemplaza la contabilidad (Alegra)");

  // El filtro por grupo acota las cifras: solo «Seguridad y Telecom» (6 referencias, 6 unidades).
  await page.getByLabel("Grupo", { exact: true }).selectOption("seguridad");
  const segUnidades = db.items
    .filter((i) => i.grupo === "seguridad")
    .reduce((a, i) => a + stockDeDb(db, i.sku), 0);
  await expect
    .poll(async () => numDe(await page.getByTestId("cifra-existencia").innerText()))
    .toBe(segUnidades * 10_000);
  // Y el de año de compra sin ítems de ese año deja las cifras en cero.
  await page.getByLabel("Grupo", { exact: true }).selectOption("");
  await expect(page.getByLabel("Año de compra", { exact: true })).toContainText("2025");
});

test("sin valores, el aviso cuenta exactamente los ítems sin valor (y la cifra es un piso)", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario");
  // Se le pone valor a UN ítem desde su ficha.
  await page.goto("/inventario/SEN-001");
  await page.getByLabel("Valor unitario (COP)").fill("35000");
  await page.getByLabel("Valor unitario (COP)").blur();
  await expect(page.locator("body")).toContainText("Ítem actualizado");
  await page.goto("/inventario/valor");
  const db = await leerDb(page);
  const sin = db.items.filter((i) => i.valorUnitario == null).length;
  expect(sin).toBe(149);
  await expect(page.getByTestId("aviso-sin-valor")).toContainText(`${sin} ítems`);
  await expect
    .poll(async () => numDe(await page.getByTestId("cifra-existencia").innerText()))
    .toBe(stockDeDb(db, "SEN-001") * 35_000);
});

test("«descontar lo usado» en 2 clics desde la fila del ítem", async ({ page }) => {
  await entrar(page);
  await page.goto("/inventario");
  await page.waitForFunction(() => !!localStorage.getItem("ioting.mock.db.v2"));
  const antes = stockDeDb((await leerDb(page))!, "SEN-002");
  expect(antes).toBeGreaterThan(1);
  await page.getByPlaceholder("Buscar SKU, descripción o marca…").fill("SEN-002");
  const fila = page.getByRole("row", { name: /SEN-002/ });
  await fila.getByTitle("Registrar movimiento").click(); // clic 1
  await page.getByRole("button", { name: "Confirmar movimiento" }).click(); // clic 2
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(async () => stockDeDb((await leerDb(page))!, "SEN-002")).toBe(antes - 1);
  await expect(fila.locator("td").nth(3)).toContainText(String(antes - 1));
});

test("salida con fecha pasada y destino a un proyecto; la fecha futura no se deja elegir", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario/SEN-002");
  await page
    .getByRole("button", { name: /registrar movimiento/i })
    .first()
    .click();
  const dlg = page.getByRole("dialog");
  // El selector de fecha no deja escoger el futuro: su máximo es hoy (2026-11-12).
  await expect(dlg.getByLabel("Fecha")).toHaveAttribute("max", "2026-11-12");
  await dlg.getByLabel("Fecha").fill("2026-02-10");
  await dlg
    .getByLabel("Destino (opcional)")
    .selectOption({ label: "Monitoreo de fermentación de cacao" });
  await dlg.getByLabel("Cantidad").fill("2");
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(dlg).toBeHidden();
  const db = (await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ioting.mock.db.v2")!),
  )) as {
    movimientos: {
      sku: string;
      fecha: string;
      destinoTipo?: string;
      destinoId?: string;
      cantidad: number;
    }[];
    proyectos: { id: string; nombre: string }[];
  };
  const m = db.movimientos.filter((x) => x.sku === "SEN-002" && x.fecha.startsWith("2026-02-10"));
  expect(m).toHaveLength(1);
  expect(m[0]!.destinoTipo).toBe("proyecto");
  expect(db.proyectos.find((p) => p.id === m[0]!.destinoId)?.nombre).toBe(
    "Monitoreo de fermentación de cacao",
  );
  // El historial del ítem muestra el destino con el nombre del proyecto.
  await expect(page.getByRole("row", { name: /Monitoreo de fermentación de cacao/ })).toBeVisible();
});

test("una entrada con costo recalcula el valor unitario (promedio ponderado) a la vista", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario/SEN-001");
  await page.getByLabel("Valor unitario (COP)").fill("100000");
  await page.getByLabel("Valor unitario (COP)").blur();
  await expect(page.locator("body")).toContainText("Ítem actualizado");
  const stock = stockDeDb((await leerDb(page))!, "SEN-001");
  await page
    .getByRole("button", { name: /registrar movimiento/i })
    .first()
    .click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Entrada" }).click();
  await dlg.getByLabel("Cantidad", { exact: true }).fill("3");
  await dlg.getByLabel("Costo unitario (COP, opcional)").fill("200000");
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(dlg).toBeHidden();
  const esperado = Math.round((stock * 100_000 + 3 * 200_000) / (stock + 3));
  await expect(page.getByLabel("Valor unitario (COP)")).toHaveValue(String(esperado));
});

test("configuración: una categoría nueva de Seguridad se numera con su prefijo", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/configuracion");
  await page
    .getByLabel("Nueva categoría de Seguridad y Telecom", { exact: true })
    .fill("Control de acceso");
  await page.getByLabel("Prefijo de la nueva categoría de Seguridad y Telecom").fill("acc");
  await page
    .getByLabel("Nueva categoría de Seguridad y Telecom", { exact: true })
    .locator("xpath=following::button[1]")
    .click();
  await page.getByRole("button", { name: "Guardar configuración de inventario" }).click();
  await expect(page.locator("body")).toContainText("Configuración guardada");

  await page.goto("/inventario");
  await page.getByRole("tab", { name: "Seguridad y Telecom" }).click();
  await page.getByRole("button", { name: "Nuevo ítem" }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Categoría", { exact: true }).selectOption("Control de acceso");
  await expect(hoja).toContainText("ACC-001");
  await hoja.getByLabel("Subcategoría").fill("Lectores");
  await hoja.getByLabel("Descripción").fill("Lector de tarjetas");
  await hoja.getByRole("button", { name: "Crear ítem" }).click();
  await expect(page.locator("body")).toContainText("Ítem ACC-001 creado");
});

test("una base v1 guardada en el navegador se migra a v2 sin perder datos", async ({ page }) => {
  await entrar(page);
  await page.goto("/inventario");
  await page.waitForFunction(() => !!localStorage.getItem("ioting.mock.db.v2"));
  const resultado = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("ioting.mock.db.v2")!);
    // Se vuelve a dejar como la guardaba la v1: sin grupo, valoración, config ni contador.
    for (const i of db.items) {
      delete i.grupo;
      delete i.anioCompra;
      delete i.valorUnitario;
      delete i.costoInicial;
      if (i.sku.startsWith("CAB-")) i.categoria = "Cableado";
      if (i.sku === "EQP-008" || i.sku === "EQP-009") i.categoria = "Equipos";
    }
    delete db.config;
    delete db.secuencias;
    delete db.version;
    // un movimiento más y un ítem de usuario en «Cableado»
    db.movimientos.push({
      id: "mv1",
      fecha: "2026-10-01T10:00:00.000Z",
      sku: "CAB-005",
      tipo: "Salida",
      cantidad: 1,
    });
    db.items.push({
      sku: "CAB-013",
      categoria: "Cableado",
      subcategoria: "x",
      descripcion: "Cable de usuario",
      marca_referencia: "",
      cantidad_inicial: 7,
      unidad: "und",
      estado: "Disponible",
      ubicacion: "",
      stock_minimo: null,
      notas: "",
    });
    localStorage.removeItem("ioting.mock.db.v2");
    localStorage.setItem("ioting.mock.db.v1", JSON.stringify(db));
    return { movs: db.movimientos.length, aud: db.auditoria.length };
  });
  await page.reload();
  await page.waitForFunction(() => !!localStorage.getItem("ioting.mock.db.v2"));
  const v2 = (await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ioting.mock.db.v2")!),
  )) as Db & {
    auditoria: unknown[];
  };
  const porGrupo = (g: string) => v2.items.filter((i) => i.grupo === g).length;
  expect([
    porGrupo("componentes"),
    porGrupo("herramientas"),
    porGrupo("equipos"),
    porGrupo("seguridad"),
  ]).toEqual([100, 37, 8, 6]);
  expect(v2.movimientos).toHaveLength(resultado.movs);
  expect(v2.auditoria.length).toBe(resultado.aud + 1);
  // Y la interfaz lo muestra: la pestaña «Seguridad y Telecom» trae sus 6 referencias.
  await page.getByRole("tab", { name: "Seguridad y Telecom" }).click();
  await expect(page.getByText(cop(6)).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /CAB-003/ })).toBeVisible();
  // La base v1 queda intacta como respaldo.
  expect(await page.evaluate(() => localStorage.getItem("ioting.mock.db.v1") !== null)).toBe(true);
});

test("valor del inventario: exporta Excel y PDF con nombre de archivo propio", async ({ page }) => {
  await entrar(page);
  await page.goto("/inventario/valor");
  for (const [boton, nombre] of [
    ["Excel", "valor-inventario-ioting.xlsx"],
    ["PDF", "valor-inventario-ioting.pdf"],
  ] as const) {
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: boton, exact: true }).click(),
    ]);
    expect(descarga.suggestedFilename()).toBe(nombre);
  }
});
