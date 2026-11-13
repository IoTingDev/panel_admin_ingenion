// Fases 3 y 4 — proyectos, trabajos técnicos, clientes, sectores, respaldo y datos de demostración.
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { arrastrar, entrar, leerDb, numDe } from "./ayudas";

test("proyectos: columnas «En desarrollo / En operación / Pausado / Finalizado» y creación con fecha pasada", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page.getByTitle("Vista tablero").click();
  const columnas = page.locator("section.min-h-80");
  await expect(columnas).toHaveCount(4);
  const rotulos = await columnas.evaluateAll((els) =>
    els.map((e) => e.querySelector("span")?.textContent?.trim()),
  );
  expect(rotulos).toEqual(["En desarrollo", "En operación", "Pausado", "Finalizado"]);
  // El tablero cuenta lo mismo que la base (2 en desarrollo en la semilla).
  const db = await leerDb(page);
  const enDesarrollo = db.proyectos.filter((p) => p.estado === "en_desarrollo").length;
  expect(enDesarrollo).toBe(2);
  await expect(columnas.nth(0).locator("article")).toHaveCount(enDesarrollo);

  await page.getByRole("button", { name: /nuevo proyecto/i }).click();
  const hoja = page.getByRole("dialog");
  await expect(hoja.getByLabel("Estado")).toHaveValue("en_desarrollo");
  await expect(hoja.getByLabel("Fecha de inicio")).toHaveValue("2026-11-12"); // por defecto hoy
  await hoja.getByLabel("Nombre", { exact: true }).fill("Proyecto con fecha real");
  await hoja.locator("#p-cliente").selectOption({ index: 1 });
  await hoja.getByLabel("Fecha de inicio").fill("2026-02-03"); // pasado permitido
  await hoja.getByLabel("Fecha de fin").fill("2026-01-01"); // anterior al inicio
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toContainText("La fecha final debe ser posterior al inicio");
  await hoja.getByLabel("Fecha de fin").fill("");
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();
  const p = (await leerDb(page)).proyectos.find((x) => x.nombre === "Proyecto con fecha real")!;
  expect(p.fechaInicio!.startsWith("2026-02-03")).toBe(true);
  expect(p.estado).toBe("en_desarrollo");
});

test("proyecto: eliminar con motivo y costo del material calculado", async ({ page }) => {
  await entrar(page);
  // Un valor al ítem y una salida hacia el proyecto desde su ficha.
  await page.goto("/inventario/SEN-002");
  await page.getByLabel("Valor unitario (COP)").fill("2000");
  await page.getByLabel("Valor unitario (COP)").blur();
  await expect(page.locator("body")).toContainText("Ítem actualizado");
  const db0 = await leerDb(page);
  const demo = db0.proyectos.find((x) => x.esDemo && x.estado !== "baja")!;
  await page.goto(`/proyectos/${demo.id}`);
  await page.getByRole("tab", { name: "Materiales de inventario" }).click();
  const antes = numDe(await page.getByTestId("costo-material-valor").innerText());
  await page.getByRole("button", { name: /registrar salida para este proyecto/i }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Ítem de inventario").fill("SEN-002");
  await dlg.getByLabel("Cantidad", { exact: true }).fill("3");
  await expect(dlg.getByLabel("Destino (opcional)")).toHaveValue(`proyecto:${demo.id}`);
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(dlg).toBeHidden();
  await expect
    .poll(async () => numDe(await page.getByTestId("costo-material-valor").innerText()))
    .toBe(antes + 3 * 2000);

  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  const confirmar = page.getByRole("alertdialog");
  await expect(confirmar.getByRole("button", { name: "Eliminar" })).toBeDisabled();
  await confirmar.getByRole("textbox").fill("Proyecto de demostración");
  await confirmar.getByRole("button", { name: "Eliminar" }).click();
  await page.waitForURL(/\/proyectos$/);
  const db = await leerDb(page);
  expect(db.proyectos.some((x) => x.id === demo.id)).toBe(false);
  expect(
    db.auditoria.some((a) => a.accion === "proyecto.eliminar" && a.entidadId === demo.id),
  ).toBe(true);
  // Los movimientos hacia el proyecto no se pierden.
  expect(db.movimientos.some((m) => m.destinoId === demo.id)).toBe(true);
});

test("trabajos: alta, código consecutivo sin reutilización, filtros y tablero", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/trabajos");
  await expect(page.getByRole("row", { name: /TT-0001/ })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo trabajo" }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Cliente").selectOption({ index: 1 });
  await hoja.getByLabel("Tipo", { exact: true }).selectOption("alarmas");
  await hoja.getByLabel("Título").fill("Alarma de prueba E2E");
  await hoja.getByLabel("Fecha programada").fill("2026-03-02"); // pasado: permitido
  await hoja.getByLabel("Valor pactado (COP, informativo)").fill("500000");
  await hoja.getByRole("button", { name: "Guardar trabajo" }).click();
  await expect(hoja).toBeHidden();
  await expect(page.getByRole("row", { name: /TT-0004/ })).toBeVisible();

  // Filtros: el número de filas coincide con lo que dice la base.
  const db = await leerDb(page);
  await page.getByLabel("Todos los estados").selectOption("completado");
  await expect(page.getByRole("row", { name: /TT-000\d/ })).toHaveCount(
    db.trabajos.filter((t) => t.estado === "completado").length,
  );
  await page.getByLabel("Todos los estados").selectOption("");
  await page.getByLabel("Todos los tipos").selectOption("alarmas");
  await expect(page.getByRole("row", { name: /TT-000\d/ })).toHaveCount(1);
  await page.getByLabel("Todos los tipos").selectOption("");
  await page.getByLabel("Programado hasta").fill("2026-03-31");
  await expect(page.getByRole("row", { name: /TT-000\d/ })).toHaveCount(1); // solo el de marzo

  // Tablero: arrastrar a «En curso» cambia el estado y completa la fecha real de inicio.
  await page.getByLabel("Programado hasta").fill("");
  await page.getByTitle("Vista tablero").click();
  const tarjeta = page.locator("article", { hasText: "TT-0004" });
  await arrastrar(page, tarjeta, page.locator('section[data-columna="en_curso"]'));
  await expect
    .poll(async () => (await leerDb(page)).trabajos.find((t) => t.codigo === "TT-0004")?.estado)
    .toBe("en_curso");
  // Arrastrar a «Cancelado» pide motivo.
  await arrastrar(
    page,
    page.locator("article", { hasText: "TT-0004" }),
    page.locator('section[data-columna="cancelado"]'),
  );
  const confirmar = page.getByRole("alertdialog");
  await expect(confirmar).toContainText("Cancelar TT-0004");
  await expect(confirmar.getByRole("button", { name: "Cancelar trabajo" })).toBeDisabled();
  await confirmar.getByRole("textbox").fill("El cliente desistió");
  await confirmar.getByRole("button", { name: "Cancelar trabajo" }).click();
  await expect
    .poll(async () => (await leerDb(page)).trabajos.find((t) => t.codigo === "TT-0004")?.estado)
    .toBe("cancelado");

  // Eliminarlo y crear otro: el código no se reutiliza.
  await page.getByTitle("Vista tabla").click();
  await page.getByRole("link", { name: "Alarma de prueba E2E" }).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("textbox").fill("Era una prueba");
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
  await page.waitForURL(/\/trabajos$/);
  await page.getByRole("button", { name: "Nuevo trabajo" }).click();
  await hoja.getByLabel("Cliente").selectOption({ index: 1 });
  await hoja.getByLabel("Título").fill("Segundo trabajo");
  await hoja.getByRole("button", { name: "Guardar trabajo" }).click();
  await expect(page.getByRole("row", { name: /TT-0005/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /TT-0004/ })).toHaveCount(0);
});

test("clientes: sector nuevo, tipo y dirección; baja cancela trabajos y la reactivación los ofrece", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Razón social").fill("Casa Pérez");
  await hoja.getByLabel("Sector").selectOption("residencial");
  await hoja.getByLabel("Tipo de cliente").selectOption("persona");
  await hoja.getByLabel("Dirección").fill("Cra 5 # 10-20");
  await hoja.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(hoja).toBeHidden();
  const db = await leerDb(page);
  const casa = db.clientes.find((c) => c.razonSocial === "Casa Pérez")!;
  expect(casa.sector).toBe("residencial");

  // Un trabajo para ese cliente, desde su ficha (pestaña Trabajos técnicos).
  await page.goto(`/clientes/${casa.id}`);
  await expect(page.locator("body")).toContainText("Cra 5 # 10-20");
  await page.getByRole("tab", { name: "Trabajos técnicos" }).click();
  await page.getByRole("button", { name: "Nuevo trabajo" }).click();
  await page.getByRole("dialog").getByLabel("Título").fill("Cámaras de la casa");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar trabajo" }).click();
  await expect(page.getByRole("row", { name: /Cámaras de la casa/ })).toBeVisible();

  // Dar de baja: el diálogo cuenta el trabajo abierto; luego queda cancelado.
  await page.getByRole("button", { name: "Dar de baja", exact: true }).click();
  const baja = page.getByRole("alertdialog");
  await expect(baja).toContainText("1 trabajos abiertos se cancelarán");
  await baja.getByRole("textbox").fill("Cierre de prueba");
  await baja.getByRole("button", { name: "Confirmar" }).click();
  await expect
    .poll(
      async () =>
        (await leerDb(page)).trabajos.find((t) => t.titulo === "Cámaras de la casa")?.estado,
    )
    .toBe("cancelado");

  // Reactivar el cliente ofrece sus hijos; se reactiva el trabajo y vuelve a «programado».
  await page.getByRole("button", { name: "Reactivar" }).click();
  const reactivar = page.getByRole("alertdialog");
  await reactivar.getByRole("textbox").fill("Vuelve");
  await reactivar.getByRole("button", { name: "Confirmar" }).click();
  const ofrece = page.getByRole("dialog");
  await expect(ofrece).toContainText("Cámaras de la casa");
  await ofrece.getByText("Cámaras de la casa").click();
  await ofrece.getByRole("button", { name: /Reactivar \(1\)/ }).click();
  await expect
    .poll(
      async () =>
        (await leerDb(page)).trabajos.find((t) => t.titulo === "Cámaras de la casa")?.estado,
    )
    .toBe("programado");
});

test("configuración: sectores editables; uno en uso no se puede quitar", async ({ page }) => {
  await entrar(page);
  await page.goto("/configuracion");
  await page.getByLabel("Nuevo sector").fill("minería");
  await page.getByRole("button", { name: "Añadir" }).click();
  await page.getByRole("button", { name: "Guardar sectores" }).click();
  await expect(page.locator("body")).toContainText("Sectores guardados");
  expect((await leerDb(page)).config.sectores).toContain("minería");
  // «cacao» lo usa un cliente de la semilla: su botón está deshabilitado.
  await expect(page.getByRole("button", { name: "Quitar el sector cacao" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Quitar el sector minería" })).toBeEnabled();
});

test("respaldo JSON: exportar, importar con vista previa, archivo inválido y recordatorio de 7 días", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/");
  await leerDb(page);
  // Sin respaldo reciente (primer uso hace 10 días) aparece el recordatorio.
  await page.evaluate(() => {
    const hace10 = new Date(Date.now() - 10 * 86_400_000).toISOString();
    localStorage.setItem(
      "ioting.panel.respaldo.v1",
      JSON.stringify({ ultimo: null, primerUso: hace10 }),
    );
  });
  await page.reload();
  await expect(page.getByTestId("recordatorio-respaldo")).toContainText("10 días");

  await page.goto("/configuracion");
  await expect(page.getByTestId("aviso-datos-locales")).toContainText("solo en este navegador");
  await expect(page.getByTestId("ultimo-respaldo")).toContainText(
    "Aún no ha hecho ningún respaldo",
  );
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar respaldo (JSON)" }).click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/^ioting-respaldo-\d{4}-\d{2}-\d{2}\.json$/);
  const ruta = (await descarga.path())!;
  const contenido = readFileSync(ruta, "utf8");
  const archivo = JSON.parse(contenido);
  const db = await leerDb(page);
  expect(archivo.formato).toBe("ioting-panel-respaldo");
  expect(archivo.datos.clientes).toHaveLength(db.clientes.length);
  expect(archivo.datos.items).toHaveLength(150);
  await expect(page.getByTestId("ultimo-respaldo")).toContainText("Último respaldo");
  await page.goto("/");
  await expect(page.getByTestId("recordatorio-respaldo")).toHaveCount(0); // el respaldo reinicia la cuenta

  // Se crea un cliente DESPUÉS del respaldo y luego se importa: el cliente desaparece.
  await page.goto("/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  await page.getByRole("dialog").getByLabel("Razón social").fill("Cliente posterior al respaldo");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByText("Cliente posterior al respaldo").first()).toBeVisible();
  expect((await leerDb(page)).clientes).toHaveLength(db.clientes.length + 1);

  await page.goto("/configuracion");
  // Un archivo que no es un respaldo se rechaza con mensaje claro y no toca nada.
  await page.getByLabel("Archivo de respaldo").setInputFiles({
    name: "malo.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hola":1}'),
  });
  await expect(page.getByRole("alert")).toContainText("Respaldo inválido");
  expect((await leerDb(page)).clientes).toHaveLength(db.clientes.length + 1);
  // El bueno muestra la vista previa (hoy vs respaldo) y reemplaza.
  await page.getByLabel("Archivo de respaldo").setInputFiles({
    name: "bueno.json",
    mimeType: "application/json",
    buffer: Buffer.from(contenido),
  });
  const previa = page.getByTestId("previa-respaldo");
  await expect(previa.getByRole("row", { name: /clientes/ })).toContainText(
    `${db.clientes.length + 1}${db.clientes.length}`.replace(/\s/g, ""),
  );
  await page.getByRole("button", { name: "Reemplazar todos los datos" }).click();
  await expect.poll(async () => (await leerDb(page)).clientes.length).toBe(db.clientes.length);
});

test("limpiar datos de demostración: pide la frase exacta y deja lo creado por el usuario", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  await page.getByRole("dialog").getByLabel("Razón social").fill("Cliente mío");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByText("Cliente mío").first()).toBeVisible();
  const antes = await leerDb(page);
  const demoAntes = antes.clientes.filter((c) => c.esDemo).length;
  expect(demoAntes).toBe(6);

  await page.goto("/configuracion");
  await page.getByRole("button", { name: "Limpiar datos de demostración" }).click();
  const dlg = page.getByRole("dialog");
  const boton = dlg.getByRole("button", { name: "Eliminar datos de demostración" });
  await dlg.getByLabel(/Escriba/).fill("eliminar demo");
  await expect(boton).toBeDisabled();
  await dlg.getByLabel(/Escriba/).fill("ELIMINAR DEMO");
  await expect(boton).toBeEnabled();
  await boton.click();
  await expect(dlg).toBeHidden();
  const despues = await leerDb(page);
  expect(despues.clientes.map((c) => c.razonSocial)).toEqual(["Cliente mío"]);
  expect(despues.proyectos).toHaveLength(0);
  expect(despues.trabajos).toHaveLength(0);
  expect(despues.usuarios).toHaveLength(0);
  expect(despues.movimientos.some((m) => m.esDemo)).toBe(false);
  expect(despues.items).toHaveLength(150); // el inventario real no se toca
  expect(despues.auditoria.some((a) => a.accion === "sistema.limpiar_demo")).toBe(true);
});
