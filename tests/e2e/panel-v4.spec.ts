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

test("F — el valor depreciado es opcional: oculto por defecto, se muestra al pedirlo y se recuerda", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario");
  const interruptor = page.getByTestId("alternar-depreciado");
  await expect(interruptor).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("detalle-depreciado")).toHaveCount(0);
  await expect(page.getByTestId("depreciado-herramientas")).toHaveCount(0);
  await expect(page.getByTestId("valor-tipo-componentes")).toBeVisible();
  await interruptor.click();
  await expect(interruptor).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("depreciado-herramientas")).toContainText("Depreciado:");
  await expect(page.getByTestId("depreciado-equipos")).toContainText("conserva");
  await expect(page.getByTestId("depreciado-componentes")).toHaveCount(0);
  await expect(page.getByTestId("detalle-depreciado")).toContainText("conserva como mínimo 30 %");
  await page.reload();
  await expect(page.getByTestId("alternar-depreciado")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("alternar-depreciado").click();
  await expect(page.getByTestId("depreciado-herramientas")).toHaveCount(0);
});

const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();
const pesos = (n: number) =>
  normaliza(
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(n),
  );

test("Ingresos — pantalla por tipo de trabajo y por sector, con cifras que coinciden con la base", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/servicios-tecnicos");
  await page.getByRole("link", { name: "Ingresos" }).click();
  await expect(page.getByRole("heading", { name: "Ingresos por servicios" })).toBeVisible();
  const db = await leerDb(page);
  type T = { id: string; tipo: string; clienteId: string; estado: string; valorPactado?: number };
  const ts = (db.trabajos as unknown as T[]).filter((x) => x.estado === "completado");
  const total = ts.reduce((s, x) => s + (x.valorPactado ?? 0), 0);
  expect(total).toBeGreaterThan(0);
  await expect(page.getByText("Ingresos (valor pactado)")).toBeVisible();
  await expect(page.locator("main")).toContainText(pesos(total));
  // por tipo: la fila del tipo con más ingresos va primero y su suma coincide
  const porTipo = new Map<string, number>();
  for (const x of ts) porTipo.set(x.tipo, (porTipo.get(x.tipo) ?? 0) + (x.valorPactado ?? 0));
  const [mejor, suma] = [...porTipo.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const filas = page.getByTestId("ingresos-por-tipo").locator("tbody tr");
  await expect(filas.first()).toHaveAttribute("data-testid", `tipo-${mejor}`);
  await expect(filas.first()).toContainText(pesos(suma));
  // por sector: ordenado por servicios solicitados
  const sectorDe = new Map(db.clientes.map((c) => [c.id, c.sector]));
  const porSector = new Map<string, number>();
  for (const x of ts) {
    const s = sectorDe.get(x.clienteId) ?? "Sin sector";
    porSector.set(s, (porSector.get(s) ?? 0) + 1);
  }
  const maxServicios = Math.max(...porSector.values());
  const primera = page.getByTestId("ingresos-por-sector").locator("tbody tr").first();
  await expect(primera.locator("td").nth(1)).toHaveText(String(maxServicios));
  // los sectores se muestran con la primera letra en mayúscula
  const sectores = await page
    .getByTestId("ingresos-por-sector")
    .locator("tbody tr td:first-child")
    .allTextContents();
  for (const s of sectores) expect(s[0]).toBe(s[0]?.toLocaleUpperCase("es"));
  await expect(page.getByTestId("nota-ingresos")).toContainText("Alegra");
  // el filtro de estado cambia las cifras (programados y en curso)
  await page.getByLabel("Estado de los servicios").selectOption("pendientes");
  await expect(page.locator("main")).not.toContainText(pesos(total));
});

test("Etiquetas — sectores y estados con la primera letra en mayúscula (el valor guardado no cambia)", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/clientes");
  await expect(page.locator('select[aria-label="Todos los estados"]')).toBeVisible();
  const estados = await page
    .locator('select[aria-label="Todos los estados"] option')
    .allTextContents();
  expect(estados).toEqual(["Todos los estados", "Activo", "Suspendido", "Baja"]);
  const sectores = await page
    .locator('select[aria-label="Todos los sectores"] option')
    .allTextContents();
  for (const s of sectores.slice(1)) expect(s[0]).toBe(s[0]?.toLocaleUpperCase("es"));
  expect(sectores).toContain("Agroindustrial");
  expect(sectores).toContain("Residencial");
  // el formulario de cliente también
  await page
    .getByRole("button", { name: /Nuevo cliente/ })
    .first()
    .click();
  const opciones = await page.locator("#sector option").allTextContents();
  for (const s of opciones) expect(s[0]).toBe(s[0]?.toLocaleUpperCase("es"));
  // lo guardado sigue en minúscula (solo cambió lo que se ve)
  const db = await leerDb(page);
  expect(db.config.sectores).toContain("residencial");
  expect(db.config.sectores).not.toContain("Residencial");
  // usuarios: mismo filtro de estados
  await page.goto("/usuarios");
  await expect(page.locator('select[aria-label="Todos los estados"]')).toBeVisible();
  expect(
    await page.locator('select[aria-label="Todos los estados"] option').allTextContents(),
  ).toEqual(["Todos los estados", "Activo", "Suspendido", "Baja"]);
  // Inicio: el gráfico «Clientes por sector»
  await page.goto("/");
  const grafico = page.locator("main").getByText("Clientes por sector").locator("..");
  await expect(grafico).toContainText("Agroindustrial");
  await expect(grafico).toContainText("Otro");
});

test("Proyectos — el valor pactado se registra en el formulario, se ve en el detalle y entra en la pantalla de ingresos", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page
    .getByRole("button", { name: /Nuevo proyecto/ })
    .first()
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Proyecto de prueba con valor");
  await page.locator("#p-cliente").selectOption({ index: 1 });
  await page.getByLabel("Valor pactado (COP, informativo)").fill("8500000");
  await page
    .getByRole("button", { name: /Guardar|Crear/ })
    .last()
    .click();
  await expect(page.locator("body")).toContainText("Proyecto guardado");
  const db = await leerDb(page);
  const nuevo = (
    db.proyectos as unknown as { id: string; nombre: string; valorPactado?: number }[]
  ).find((p) => p.nombre === "Proyecto de prueba con valor");
  expect(nuevo?.valorPactado).toBe(8_500_000);
  await page.goto(`/proyectos/${nuevo?.id}`);
  await expect(page.getByTestId("valor-pactado-proyecto")).toContainText(pesos(8_500_000));
  await page.goto("/servicios-tecnicos/ingresos");
  const vig = page.getByTestId("proyectos-vigentes");
  await expect(vig).toContainText(pesos(8_500_000));
  await expect(page.getByTestId("proyectos-total")).toContainText(pesos(8_500_000));
});
