// PRUEBA INTEGRAL — un solo flujo de extremo a extremo (encargo v2).
// Cada paso comprueba contra la base guardada (localStorage), con valores derivados aquí y no
// copiados del código de la aplicación, y cuenta las aserciones ejecutadas al final.
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { RUTAS } from "../visual/rutas";
import { arrastrar, entrar, leerDb, numDe, sinDesborde } from "./ayudas";

const PLANTILLA = readFileSync("public/plantillas/plantilla_valores_inventario.csv", "utf8");
const VALOR = 12_500;

test("flujo completo: valores → trabajo → proyecto → kanban → limpiar demo → respaldo → recarga → móvil", async ({
  page,
}) => {
  test.setTimeout(240_000);
  let aserciones = 0;
  const ok = <T>(valor: T, esperado: T, que: string) => {
    expect(valor, que).toEqual(esperado);
    aserciones++;
  };

  // 1) Inicio de sesión
  await entrar(page);
  await expect(page.locator("header")).toContainText("JV");
  aserciones++;

  // 2) Importar la plantilla con valores y ver el valor del inventario
  await page.goto("/inventario/valor");
  await leerDb(page);
  const [cab, ...filas] = PLANTILLA.trim().split("\n");
  const csv = [cab, ...filas.map((f) => f.replace(/,,$/, `,2025,${VALOR}`))].join("\n");
  await page.getByRole("button", { name: "Importar valores" }).click();
  await page.getByLabel("Archivo de valores").setInputFiles({
    name: "valores.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByTestId("resumen-previa")).toHaveText(
    "150 filas · 150 con cambios · 0 con error",
  );
  aserciones++;
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  const db1 = await leerDb(page);
  const stock = (sku: string, db = db1) =>
    db.movimientos.reduce(
      (a, m) => (m.sku !== sku ? a : m.tipo === "Entrada" ? a + m.cantidad : a - m.cantidad),
      db.items.find((i) => i.sku === sku)!.cantidad_inicial,
    );
  const existenciaEsperada = db1.items.reduce((a, i) => a + stock(i.sku) * VALOR, 0);
  await expect
    .poll(async () => numDe(await page.getByTestId("cifra-existencia").innerText()))
    .toBe(existenciaEsperada);
  aserciones++;
  ok(
    numDe(await page.getByTestId("cifra-invertido").innerText()),
    401 * VALOR,
    "invertido = 401 uds × valor",
  );

  // 3) Salida con destino a un trabajo y fecha pasada
  const trabajo = db1.trabajos.find((t) => t.codigo === "TT-0003")!;
  await page.goto(`/servicios-tecnicos/${trabajo.id}`);
  await page.getByRole("tab", { name: "Materiales usados" }).click();
  await page.getByRole("button", { name: "Registrar material usado" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Ítem de inventario").fill("SEN-002");
  await dlg.getByLabel("Cantidad", { exact: true }).fill("2");
  await dlg.getByLabel("Fecha").fill("2026-10-20");
  await expect(dlg.getByLabel("Destino (opcional)")).toHaveValue(`trabajo:${trabajo.id}`);
  aserciones++;
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(dlg).toBeHidden();
  await expect
    .poll(async () => numDe(await page.getByTestId("costo-material-valor").innerText()))
    .toBe(2 * VALOR);
  aserciones++;
  const db2 = await leerDb(page);
  const salida = db2.movimientos.find((m) => m.destinoId === trabajo.id)!;
  ok(
    [salida.fecha.slice(0, 10), salida.costoAlSalir, salida.cantidad],
    ["2026-10-20", VALOR, 2],
    "salida con fecha pasada y costo vigente",
  );

  // 4) Crear un proyecto con fecha pasada en «En desarrollo»
  await page.goto("/proyectos");
  await page.getByRole("button", { name: /nuevo proyecto/i }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Nombre", { exact: true }).fill("Proyecto integral");
  await hoja.locator("#p-cliente").selectOption({ index: 1 });
  await hoja.getByLabel("Fecha de inicio").fill("2026-01-20");
  await expect(hoja.getByLabel("Estado")).toHaveValue("en_desarrollo");
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();
  const mio = (await leerDb(page)).proyectos.find((p) => p.nombre === "Proyecto integral")!;
  ok(
    [mio.estado, mio.fechaInicio!.slice(0, 10)],
    ["en_desarrollo", "2026-01-20"],
    "proyecto creado en desarrollo con fecha pasada",
  );

  // 5) Moverlo en el kanban («En operación»)
  await page.getByTitle("Vista tablero").click();
  const columnas = page.locator("section.min-h-80");
  await arrastrar(page, page.locator("article", { hasText: "Proyecto integral" }), columnas.nth(1));
  await expect
    .poll(async () => (await leerDb(page)).proyectos.find((p) => p.id === mio.id)?.estado)
    .toBe("activo");
  aserciones++;

  // 6) Eliminar un proyecto de demostración con motivo
  const demo = db2.proyectos.find((p) => p.esDemo && p.estado === "pausado")!;
  await page.goto(`/proyectos/${demo.id}`);
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("textbox").fill("Demostración que ya no sirve");
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
  await page.waitForURL(/\/proyectos$/);
  const db3 = await leerDb(page);
  ok(
    db3.proyectos.some((p) => p.id === demo.id),
    false,
    "el proyecto demo eliminado ya no existe",
  );
  ok(
    db3.auditoria.some((a) => a.accion === "proyecto.eliminar" && a.entidadId === demo.id),
    true,
    "la eliminación quedó auditada",
  );

  // 7) Limpiar datos de demostración (solo lo marcado; lo creado aquí se conserva)
  const noDemoAntes = {
    movs: db3.movimientos.filter((m) => !m.esDemo).length,
    proyectos: db3.proyectos.filter((p) => !p.esDemo).map((p) => p.id),
  };
  await page.goto("/configuracion");
  await page.getByRole("button", { name: "Limpiar datos de demostración" }).click();
  await page.getByLabel(/Escriba/).fill("ELIMINAR DEMO");
  await page.getByRole("button", { name: "Eliminar datos de demostración" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const db4 = await leerDb(page);
  ok(db4.trabajos.length, 0, "no quedan trabajos de demostración");
  ok(db4.movimientos.filter((m) => m.esDemo).length, 0, "no quedan movimientos demo");
  ok(db4.movimientos.length, noDemoAntes.movs, "los movimientos creados por mí siguen");
  ok(
    db4.proyectos.map((p) => p.id),
    noDemoAntes.proyectos,
    "mi proyecto sigue y los demo se fueron",
  );
  ok(db4.items.length, 150, "el inventario real no se toca");
  // El movimiento hacia el trabajo demo eliminado conserva su rótulo en el historial del ítem.
  await page.goto("/inventario/SEN-002");
  await expect(page.getByRole("row", { name: /TT-0003/ })).toBeVisible();
  aserciones++;

  // 8) Exportar el respaldo
  await page.goto("/configuracion");
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar respaldo (JSON)" }).click(),
  ]);
  const respaldo = JSON.parse(readFileSync((await descarga.path())!, "utf8"));
  ok(respaldo.formato, "ioting-panel-respaldo", "formato del respaldo");
  ok(
    [
      respaldo.datos.clientes.length,
      respaldo.datos.proyectos.length,
      respaldo.datos.items.length,
      respaldo.datos.movimientos.length,
    ],
    [db4.clientes.length, db4.proyectos.length, 150, db4.movimientos.length],
    "el respaldo trae lo mismo que hay guardado",
  );

  // 9) Recargar y verificar que todo persiste
  await page.reload();
  const db5 = await leerDb(page);
  ok(
    db5.proyectos.find((p) => p.id === mio.id)?.estado,
    "activo",
    "tras recargar, mi proyecto sigue en operación",
  );
  ok(
    db5.items.every((i) => i.valorUnitario === VALOR),
    true,
    "tras recargar, los valores siguen",
  );
  await page.goto("/proyectos");
  await expect(page.getByRole("link", { name: "Proyecto integral" })).toBeVisible();
  aserciones++;
  await page.goto("/inventario/valor");
  await expect
    .poll(async () => numDe(await page.getByTestId("cifra-existencia").innerText()))
    // Stock real al final: la salida al trabajo (−2) y la limpieza de los movimientos demo (devuelve
    // lo que consumían) cambian el stock; se recalcula desde la base, no se arrastra el valor inicial.
    .toBe(db5.items.reduce((a, i) => a + stock(i.sku, db5) * VALOR, 0));

  // 10) Revisión de desbordamiento a 390 px en todas las rutas
  await page.setViewportSize({ width: 390, height: 844 });
  await sinDesborde(
    page,
    RUTAS.map((r) => r.ruta).filter(
      (r) => !r.includes("t6000000") && !r.includes("p3000000") && !r.includes("c1000000"),
    ),
  );
  aserciones++;

  // Conteo final: si el guion abortara antes, no llegaría aquí (y la ejecución fallaría).
  console.log(`=== ${aserciones} aserciones ejecutadas ===`);
  expect(aserciones).toBeGreaterThanOrEqual(20);
});
