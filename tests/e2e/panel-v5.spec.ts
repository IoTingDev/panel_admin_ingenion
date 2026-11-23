// Panel v5 (ADR-0047) — vínculo del cliente, cobro (horas × valor por hora), suscripción y plan de pagos.
import { test, expect } from "@playwright/test";
import { entrar, leerDb } from "./ayudas";

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  })
    .format(n)
    .replace(/\s/g, " ");
const sinEspacios = (s: string) => s.replace(/[\s ]/g, "");

test("Vínculo — se asigna en el formulario, filtra la lista y se cuenta en el Inicio sin cambiar el estado", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/clientes");
  await expect(page.getByTestId("vinculo-cliente").first()).toContainText("Sin clasificar");
  await page
    .getByRole("button", { name: /^Editar / })
    .first()
    .click();
  const hoja = page.getByRole("dialog");
  const opciones = await hoja.locator("#vinculo option").allTextContents();
  expect(opciones).toEqual(["Sin clasificar", "Recurrente", "Puntual"]);
  await hoja.locator("#vinculo").selectOption("puntual");
  await hoja.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(hoja).toBeHidden();
  const db = await leerDb(page);
  const puntuales = (db.clientes as unknown as { vinculo?: string; estado: string }[]).filter(
    (c) => c.vinculo === "puntual",
  );
  expect(puntuales).toHaveLength(1);
  expect(puntuales[0]?.estado).toBe("activo"); // puntual NO es baja ni suspensión
  // el filtro
  await page.getByLabel("Todos los vínculos").selectOption("puntual");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByTestId("vinculo-cliente")).toContainText("Puntual");
  await page.getByLabel("Todos los vínculos").selectOption("sin_clasificar");
  expect(await page.locator("tbody tr").count()).toBeGreaterThan(1);
  // el Inicio
  await page.goto("/");
  const sec = page.locator('main section[aria-label="Clientes y usuarios"]');
  await expect(sec).toContainText("Clientes recurrentes");
  await expect(sec).toContainText("Clientes puntuales");
});

test("Proyecto — horas × valor por hora, suscripción y cuotas se calculan, se guardan y se ven en el detalle", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page
    .getByRole("button", { name: /Nuevo proyecto/ })
    .first()
    .click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Nombre", { exact: true }).fill("Proyecto v5 con cobro");
  await hoja.locator("#p-cliente").selectOption({ index: 1 });
  await hoja.locator("#p-estado").selectOption("activo");
  await hoja.getByLabel("Valor pactado (COP, informativo)").fill("1000000");
  // cálculo en vivo: 2,5 h × 80.000 = 200.000
  await hoja.locator("#p-horas").fill("2,5");
  await hoja.locator("#p-valorhora").fill("80000");
  await expect(hoja.getByTestId("p-calculo-desarrollo")).toContainText(pesos(200_000));
  // suscripción mensual
  await hoja.locator("#p-modalidad").selectOption("mensual");
  await hoja.locator("#p-recurrente").fill("450000");
  // 3 cuotas sobre 1.000.000: 333.333 + 333.333 + 333.334
  await hoja.locator("#p-ncuotas").fill("3");
  await hoja.locator("#p-primera").fill("2026-12-05");
  const cuotas = await hoja.getByTestId("p-calculo-cuotas").innerText();
  expect(sinEspacios(cuotas)).toContain(sinEspacios(pesos(333_333)));
  expect(sinEspacios(cuotas)).toContain(sinEspacios(pesos(333_334)));
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();

  const db = await leerDb(page);
  const nuevo = (
    db.proyectos as unknown as {
      id: string;
      nombre: string;
      minutosTrabajo?: number;
      valorHora?: number;
      modalidad?: string;
      valorRecurrente?: number;
      planPagos?: { valor: number; vence: string }[];
    }[]
  ).find((p) => p.nombre === "Proyecto v5 con cobro");
  expect(nuevo?.minutosTrabajo).toBe(150);
  expect(nuevo?.valorHora).toBe(80_000);
  expect(nuevo?.modalidad).toBe("mensual");
  expect(nuevo?.valorRecurrente).toBe(450_000);
  expect(nuevo?.planPagos?.reduce((s, c) => s + c.valor, 0)).toBe(1_000_000);
  expect(nuevo?.planPagos?.map((c) => c.vence)).toEqual(["2026-12-05", "2027-01-05", "2027-02-05"]);

  // el detalle: desglose derivado
  await page.goto(`/proyectos/${nuevo?.id}`);
  await expect(page.getByTestId("desglose-pactado")).toHaveText(pesos(1_000_000));
  await expect(page.getByTestId("desglose-materiales")).toHaveText(pesos(0));
  await expect(page.getByTestId("desglose-desarrollo")).toHaveText(pesos(200_000));
  await expect(page.getByTestId("desglose-costo")).toHaveText(pesos(200_000));
  await expect(page.getByTestId("desglose-diferencia")).toHaveText(pesos(800_000));
  // la suscripción activa (el proyecto está «En operación»)
  await expect(page.getByTestId("suscripcion-estado")).toHaveText("Mensualidad activa");
  // el plan: marcar la primera cuota como pagada cambia lo cobrado y lo por cobrar
  await expect(page.getByTestId("plan-cobrado")).toHaveText(pesos(0));
  await page.getByTestId("cuota-1").getByRole("button", { name: "Marcar pagada" }).click();
  await expect(page.getByTestId("plan-cobrado")).toHaveText(pesos(333_333));
  await expect(page.getByTestId("plan-por-cobrar")).toHaveText(pesos(666_667));
  await expect(page.getByTestId("cuota-1-estado")).toContainText("Pagada");
  await page.getByTestId("cuota-1").getByRole("button", { name: "Quitar pago" }).click();
  await expect(page.getByTestId("plan-cobrado")).toHaveText(pesos(0));
  // la lista muestra «En operación» y la etiqueta de suscripción
  await page.goto("/proyectos");
  await expect(page.getByTestId("suscripcion-lista").first()).toHaveText("Mensualidad activa");
});

test("Proyecto — editar otra cosa conserva el plan y sus pagos; cambiar a «Pago único» limpia la suscripción", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page
    .getByRole("button", { name: /Nuevo proyecto/ })
    .first()
    .click();
  let hoja = page.getByRole("dialog");
  await hoja.getByLabel("Nombre", { exact: true }).fill("Proyecto plan estable");
  await hoja.locator("#p-cliente").selectOption({ index: 1 });
  await hoja.locator("#p-estado").selectOption("activo");
  await hoja.getByLabel("Valor pactado (COP, informativo)").fill("900000");
  await hoja.locator("#p-modalidad").selectOption("anual");
  await hoja.locator("#p-recurrente").fill("900000");
  await hoja.locator("#p-ncuotas").fill("3");
  await hoja.locator("#p-primera").fill("2026-12-05");
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();
  const buscar = async () =>
    (
      (await leerDb(page)).proyectos as unknown as {
        id: string;
        nombre: string;
        modalidad?: string;
        planPagos?: { pagadaEn?: string }[];
      }[]
    ).find((p) => p.nombre === "Proyecto plan estable");
  const id = (await buscar())?.id;
  await page.goto(`/proyectos/${id}`);
  await page.getByTestId("cuota-2").getByRole("button", { name: "Marcar pagada" }).click();
  await expect(page.getByTestId("cuota-2-estado")).toContainText("Pagada");
  // editar OTRA cosa (la descripción) NO rehace el plan ni pierde el pago
  await page
    .getByRole("button", { name: /^Editar/ })
    .first()
    .click();
  hoja = page.getByRole("dialog");
  await hoja.locator("#p-desc").fill("Descripción nueva");
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();
  expect((await buscar())?.planPagos?.[1]?.pagadaEn).toBeTruthy();
  // pasar a «Pago único» y sin cuotas limpia modalidad y plan
  await page
    .getByRole("button", { name: /^Editar/ })
    .first()
    .click();
  hoja = page.getByRole("dialog");
  await hoja.locator("#p-modalidad").selectOption("");
  await hoja.locator("#p-ncuotas").fill("");
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();
  const p = await buscar();
  expect(p?.modalidad).toBeUndefined();
  expect(p?.planPagos ?? []).toHaveLength(0);
});

test("Servicio técnico — cobro, suscripción en curso y plan de pagos", async ({ page }) => {
  await entrar(page);
  await page.goto("/servicios-tecnicos");
  await page.getByRole("button", { name: "Nuevo servicio técnico" }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Cliente").selectOption({ index: 1 });
  await hoja.getByLabel("Tipo", { exact: true }).selectOption("mantenimiento");
  await hoja.getByLabel("Título").fill("Mantenimiento anual v5");
  await hoja.getByLabel("Valor pactado (COP, informativo)").fill("600000");
  await hoja.locator("#t-horas").fill("4");
  await hoja.locator("#t-valorhora").fill("60000");
  await expect(hoja.getByTestId("t-calculo-desarrollo")).toContainText(pesos(240_000));
  await hoja.locator("#t-modalidad").selectOption("anual");
  await hoja.locator("#t-recurrente").fill("600000");
  await hoja.locator("#t-ncuotas").fill("2");
  await hoja.getByRole("button", { name: "Guardar servicio técnico" }).click();
  await expect(hoja).toBeHidden();
  const db = await leerDb(page);
  const t = (
    db.trabajos as unknown as {
      id: string;
      titulo: string;
      planPagos?: { valor: number }[];
      minutosTrabajo?: number;
    }[]
  ).find((x) => x.titulo === "Mantenimiento anual v5");
  expect(t?.minutosTrabajo).toBe(240);
  expect(t?.planPagos?.reduce((s, c) => s + c.valor, 0)).toBe(600_000);
  await page.goto(`/servicios-tecnicos/${t?.id}`);
  await expect(page.getByTestId("desglose-desarrollo")).toHaveText(pesos(240_000));
  await expect(page.getByTestId("desglose-diferencia")).toHaveText(pesos(360_000));
  // programado: la suscripción aún no corre
  await expect(page.getByTestId("suscripcion-estado")).toHaveText("Suscripción sin operar");
});

test("Desglose — cobrar por debajo del costo se marca, y sin horas no se inventa el desarrollo", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page
    .getByRole("button", { name: /Nuevo proyecto/ })
    .first()
    .click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Nombre", { exact: true }).fill("Proyecto bajo costo");
  await hoja.locator("#p-cliente").selectOption({ index: 1 });
  await hoja.getByLabel("Valor pactado (COP, informativo)").fill("100000");
  await hoja.locator("#p-horas").fill("2");
  await hoja.locator("#p-valorhora").fill("80000");
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();
  const id = ((await leerDb(page)).proyectos as unknown as { id: string; nombre: string }[]).find(
    (p) => p.nombre === "Proyecto bajo costo",
  )?.id;
  await page.goto(`/proyectos/${id}`);
  await expect(page.getByTestId("desglose-diferencia")).toHaveText(pesos(-60_000));
  await expect(page.getByTestId("desglose-diferencia")).toHaveClass(/destructive/);
  // un proyecto sin horas: el desarrollo no se inventa
  await page.goto("/proyectos");
  await page
    .getByRole("button", { name: /Nuevo proyecto/ })
    .first()
    .click();
  const h2 = page.getByRole("dialog");
  await h2.getByLabel("Nombre", { exact: true }).fill("Proyecto sin horas");
  await h2.locator("#p-cliente").selectOption({ index: 1 });
  await h2.getByLabel("Valor pactado (COP, informativo)").fill("500000");
  await h2.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(h2).toBeHidden();
  const id2 = ((await leerDb(page)).proyectos as unknown as { id: string; nombre: string }[]).find(
    (p) => p.nombre === "Proyecto sin horas",
  )?.id;
  await page.goto(`/proyectos/${id2}`);
  await expect(page.getByTestId("desglose-desarrollo")).toContainText("Sin calcular");
  await expect(page.getByTestId("desglose-diferencia")).toHaveText("—");
  await expect(page.getByTestId("desglose-sobre-materiales")).toContainText(pesos(500_000));
});

test("Ingresos — el ingreso recurrente cuenta solo las suscripciones activas hoy", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/proyectos");
  await page
    .getByRole("button", { name: /Nuevo proyecto/ })
    .first()
    .click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Nombre", { exact: true }).fill("Suscripción activa v5");
  await hoja.locator("#p-cliente").selectOption({ index: 1 });
  await hoja.locator("#p-estado").selectOption("activo");
  await hoja.locator("#p-modalidad").selectOption("mensual");
  await hoja.locator("#p-recurrente").fill("450000");
  await hoja.getByRole("button", { name: "Guardar proyecto" }).click();
  await expect(hoja).toBeHidden();
  await page.goto("/proyectos/ingresos");
  await expect(page.locator("main")).toContainText("Ingreso recurrente");
  await expect(page.locator("main")).toContainText(pesos(450_000));
  await expect(page.locator("main")).toContainText("1 suscripción(es) activa(s) hoy");
});

test("Inventario — un rollo de filamento se registra en gramos y una salida de 45 g cuesta 45 × valor por gramo", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/inventario");
  await page.getByRole("button", { name: "Nuevo ítem" }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Subcategoría").fill("Filamento");
  await hoja.getByLabel("Descripción").fill("Filamento PLA E2E 1 kg");
  const unidades = await hoja.locator("#n-unidad option").allTextContents();
  expect(unidades).toContain("Gramos (g)");
  await hoja.locator("#n-unidad").selectOption("g");
  await hoja.getByLabel("Cantidad inicial").fill("1000");
  await hoja.getByLabel("Valor unitario (COP)").fill("90");
  await hoja.getByRole("button", { name: "Crear ítem" }).click();
  await expect(hoja).toBeHidden();
  const db = await leerDb(page);
  const item = (
    db.items as unknown as {
      sku: string;
      descripcion: string;
      unidad: string;
      cantidad_inicial: number;
    }[]
  ).find((i) => i.descripcion === "Filamento PLA E2E 1 kg");
  expect(item?.unidad).toBe("g");
  expect(item?.cantidad_inicial).toBe(1000);
  // salida de 45 g hacia un proyecto
  const proyecto = (db.proyectos as unknown as { id: string; estado: string }[]).find(
    (p) => p.estado !== "baja",
  )!;
  await page.goto(`/proyectos/${proyecto.id}`);
  await page.getByRole("tab", { name: "Materiales de inventario" }).click();
  const num = (s: string) => Number(s.replace(/\D/g, ""));
  const antes = num(await page.getByTestId("costo-material-valor").innerText());
  await page.getByRole("button", { name: /registrar salida para este proyecto/i }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Ítem de inventario").fill(item!.sku);
  await dlg.getByLabel("Cantidad", { exact: true }).fill("45");
  await dlg.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(dlg).toBeHidden();
  await expect
    .poll(async () => num(await page.getByTestId("costo-material-valor").innerText()))
    .toBe(antes + 45 * 90);
  // el stock quedó en 955 g, con la unidad en la ficha
  await page.goto(`/inventario/${item!.sku}`);
  await expect(page.locator("main")).toContainText("955");
  await expect(page.locator("#d-unidad")).toHaveValue("g");
  // pasar de más se rechaza diciendo la unidad real
  await page.goto(`/proyectos/${proyecto.id}`);
  await page.getByRole("tab", { name: "Materiales de inventario" }).click();
  await page.getByRole("button", { name: /registrar salida para este proyecto/i }).click();
  const d2 = page.getByRole("dialog");
  await d2.getByLabel("Ítem de inventario").fill(item!.sku);
  await d2.getByLabel("Cantidad", { exact: true }).fill("956");
  await expect(d2).toContainText("hay 955 g");
});

test("Servicios técnicos — un servicio completado por suscripción muestra «Mensualidad activa» y las cuotas vencidas en la lista", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/servicios-tecnicos");
  const crear = async (titulo: string, estado: string, extra: () => Promise<void>) => {
    await page.getByRole("button", { name: "Nuevo servicio técnico" }).click();
    const hoja = page.getByRole("dialog");
    await hoja.getByLabel("Cliente").selectOption({ index: 1 });
    await hoja.getByLabel("Tipo", { exact: true }).selectOption("mantenimiento");
    await hoja.getByLabel("Título").fill(titulo);
    await hoja.getByLabel("Estado", { exact: true }).selectOption(estado);
    await extra();
    await hoja.getByRole("button", { name: "Guardar servicio técnico" }).click();
    await expect(hoja).toBeHidden();
  };
  const dlg = () => page.getByRole("dialog");
  await crear("Soporte mensual completado", "completado", async () => {
    await dlg().locator("#t-modalidad").selectOption("mensual");
    await dlg().locator("#t-recurrente").fill("200000");
  });
  await crear("Soporte mensual programado", "programado", async () => {
    await dlg().locator("#t-modalidad").selectOption("mensual");
    await dlg().locator("#t-recurrente").fill("200000");
  });
  await crear("Con cuotas vencidas", "completado", async () => {
    await dlg().getByLabel("Valor pactado (COP, informativo)").fill("600000");
    await dlg().locator("#t-ncuotas").fill("2");
    await dlg().locator("#t-primera").fill("2026-01-05");
  });
  const fila = (t: string) => page.getByRole("row", { name: new RegExp(t) });
  await expect(fila("Soporte mensual completado").getByTestId("suscripcion-lista")).toHaveText(
    "Mensualidad activa",
  );
  await expect(fila("Soporte mensual programado").getByTestId("suscripcion-lista")).toHaveCount(0);
  await expect(fila("Con cuotas vencidas").getByTestId("vencido-lista")).toContainText(
    pesos(600_000),
  );
  await expect(fila("Soporte mensual completado").getByTestId("vencido-lista")).toHaveCount(0);
});

test("Inventario — «Unidades en stock» cuenta 1000 g como 1 unidad, en el Inicio y en la página de inventario", async ({
  page,
}) => {
  await entrar(page);
  const leer = async (url: string) => {
    await page.goto(url);
    const tarjeta = page.getByText("Unidades en stock", { exact: true }).locator("xpath=..");
    const txt = await tarjeta.innerText();
    const m = txt.match(/unidades en stock\s*([\d.,]+)/i);
    return Number((m?.[1] ?? "NaN").replace(/\./g, "").replace(",", "."));
  };
  const antesInicio = await leer("/");
  const antesInv = await leer("/inventario");
  expect(Number.isFinite(antesInicio) && Number.isFinite(antesInv)).toBe(true);
  await page.goto("/inventario");
  await page.getByRole("button", { name: "Nuevo ítem" }).click();
  const hoja = page.getByRole("dialog");
  await hoja.getByLabel("Subcategoría").fill("Filamento");
  await hoja.getByLabel("Descripción").fill("Filamento conteo E2E");
  await hoja.locator("#n-unidad").selectOption("g");
  await hoja.getByLabel("Cantidad inicial").fill("1000");
  await hoja.getByRole("button", { name: "Crear ítem" }).click();
  await expect(hoja).toBeHidden();
  const despuesInicio = await leer("/");
  expect(despuesInicio - antesInicio).toBeCloseTo(1, 5); // 1000 g = 1 unidad, no 1000
  await expect(page.locator("main")).toContainText("Los gramos cuentan 1000 g = 1 unidad");
});
