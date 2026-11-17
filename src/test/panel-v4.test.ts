// Panel v4 — sectores (migración v3 → v4), servicios por cliente, columna «Fin», orden de servicios y valor por tipo.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { FinProyecto } from "@/components/panel/proyectos";
import { VERSION_DB, migrarADbActual, migrarV3aV4 } from "@/lib/api/mock/migracion";
import { buildSeed, type MockDb } from "@/lib/api/mock/seed";
import { mockApi, resetMemoria } from "@/lib/api/mock";
import { SECTOR_AGROINDUSTRIAL, SECTORES_RETIRADOS, compararServicios } from "@/lib/dominio";
import { CONFIG_INVENTARIO_DEFECTO } from "@/lib/config-inventario";
import { valorPorTipo } from "@/lib/valoracion";
import type { ItemInventario, MovimientoInventario, TrabajoTecnico } from "@/lib/api";

type Laxo = Record<string, unknown>;

/** Una base v3 «de usuario»: sectores antiguos en clientes y en la lista, con proyectos finalizados. */
function baseV3(): MockDb {
  const s = buildSeed();
  const viejos = ["cacao", "café", "mango", "residencial", "comercial"];
  s.clientes.forEach((c, i) => {
    c.sector = viejos[i % viejos.length] ?? "otro";
  });
  s.config.sectores = [
    "cacao",
    "café",
    "mango",
    "residencial",
    "comercial",
    "industrial",
    "institucional",
    "otro",
  ];
  s.version = 3;
  return s;
}

/** Lo que la migración NO debe tocar: devuelve las violaciones (lista vacía = se conservó todo). */
function violacionesDeConservacion(antes: MockDb, despues: MockDb): string[] {
  const v: string[] = [];
  for (const k of [
    "clientes",
    "usuarios",
    "proyectos",
    "trabajos",
    "items",
    "movimientos",
  ] as const)
    if (antes[k].length !== despues[k].length)
      v.push(`${k}: ${antes[k].length} → ${despues[k].length}`);
  for (const k of ["usuarios", "proyectos", "trabajos", "items", "movimientos"] as const)
    if (JSON.stringify(antes[k]) !== JSON.stringify(despues[k])) v.push(`${k}: valores distintos`);
  antes.clientes.forEach((c, i) => {
    const { sector: _a, ...resto } = c;
    const { sector: _b, ...restoD } = despues.clientes[i] ?? ({} as typeof c);
    if (JSON.stringify(resto) !== JSON.stringify(restoD))
      v.push(`cliente ${c.id}: campos distintos`);
  });
  const cola = despues.auditoria.slice(despues.auditoria.length - antes.auditoria.length);
  if (JSON.stringify(cola) !== JSON.stringify(antes.auditoria))
    v.push("auditoría anterior alterada");
  if (JSON.stringify(antes.config.inventario) !== JSON.stringify(despues.config.inventario))
    v.push("config.inventario alterada");
  if (JSON.stringify(antes.secuencias) !== JSON.stringify(despues.secuencias))
    v.push("secuencias alteradas");
  return v;
}

describe("Parte C — migración v3 → v4 (sectores)", () => {
  it("conserva conteos y valores no tocados; solo cambia el sector y deja el valor anterior en la auditoría", () => {
    const antes = baseV3();
    const retirados = antes.clientes.filter((c) => SECTORES_RETIRADOS.includes(c.sector));
    expect(retirados.length).toBeGreaterThanOrEqual(3);
    const copia = structuredClone(antes);
    const despues = migrarV3aV4(structuredClone(antes) as unknown as Laxo);

    expect(violacionesDeConservacion(copia, despues)).toEqual([]);
    expect(despues.version).toBe(VERSION_DB);
    for (const c of despues.clientes) expect(SECTORES_RETIRADOS).not.toContain(c.sector);
    despues.clientes.forEach((c, i) => {
      const a = copia.clientes[i]?.sector ?? "";
      expect(c.sector).toBe(SECTORES_RETIRADOS.includes(a) ? SECTOR_AGROINDUSTRIAL : a);
    });
    expect(despues.config.sectores).toEqual([
      SECTOR_AGROINDUSTRIAL,
      "residencial",
      "comercial",
      "industrial",
      "institucional",
      "otro",
    ]);
    const nuevas = despues.auditoria.slice(0, despues.auditoria.length - copia.auditoria.length);
    expect(nuevas).toHaveLength(retirados.length + 2);
    for (const c of retirados)
      expect(nuevas.find((x) => x.entidadId === c.id)?.detalle).toContain(`«${c.sector}»`);
    expect(
      nuevas.some(
        (x) =>
          x.accion === "configuracion.sectores" && x.detalle?.includes("antes: cacao, café, mango"),
      ),
    ).toBe(true);
  });

  it("CONTRAPRUEBA: una migración que borre, recorte o altere datos rompe la prueba de conservación", () => {
    const antes = baseV3();
    const ok = migrarV3aV4(structuredClone(antes) as unknown as Laxo);
    expect(violacionesDeConservacion(antes, ok)).toEqual([]); // control positivo
    const borra = structuredClone(ok);
    borra.clientes.pop();
    expect(violacionesDeConservacion(antes, borra).length).toBeGreaterThan(0);
    const recorta = structuredClone(ok);
    recorta.items = recorta.items.slice(1);
    expect(violacionesDeConservacion(antes, recorta).length).toBeGreaterThan(0);
    const altera = structuredClone(ok);
    if (altera.clientes[0]) altera.clientes[0].razonSocial = "X";
    expect(violacionesDeConservacion(antes, altera).length).toBeGreaterThan(0);
    const pierde = structuredClone(ok);
    pierde.auditoria = pierde.auditoria.slice(0, -1);
    expect(violacionesDeConservacion(antes, pierde).length).toBeGreaterThan(0);
  });

  it("es idempotente: una base v4 no cambia ni agrega auditoría", () => {
    const una = migrarV3aV4(structuredClone(baseV3()) as unknown as Laxo);
    expect(migrarV3aV4(structuredClone(una) as unknown as Laxo)).toEqual(una);
    expect(migrarADbActual(structuredClone(una) as unknown as Laxo)).toEqual(una);
  });

  it("una base v3 sin sectores retirados recibe «Agroindustrial» en la lista y no cambia clientes", () => {
    const b = baseV3();
    b.clientes.forEach((c) => (c.sector = "comercial"));
    b.config.sectores = ["residencial", "comercial", "otro"];
    const r = migrarV3aV4(structuredClone(b) as unknown as Laxo);
    expect(r.config.sectores).toEqual([SECTOR_AGROINDUSTRIAL, "residencial", "comercial", "otro"]);
    expect(r.clientes.map((c) => c.sector)).toEqual(b.clientes.map((c) => c.sector));
  });

  describe("carga desde localStorage con una base v3 modificada por el usuario", () => {
    beforeEach(() => {
      window.localStorage.clear();
      resetMemoria();
    });
    it("la migra al leer, la guarda como v4 y la v3 queda intacta como respaldo", async () => {
      const v3 = baseV3();
      v3.proyectos.forEach((p) => {
        p.estado = "finalizado";
      });
      const original = JSON.stringify(v3);
      window.localStorage.setItem("ioting.mock.db.v3", original);
      const clientes = await mockApi.clientes.list();
      expect(clientes).toHaveLength(v3.clientes.length);
      for (const c of clientes) expect(SECTORES_RETIRADOS).not.toContain(c.sector);
      const guardada = JSON.parse(window.localStorage.getItem("ioting.mock.db.v4") ?? "null");
      expect(guardada?.version).toBe(4);
      expect(guardada.proyectos).toHaveLength(v3.proyectos.length);
      expect(window.localStorage.getItem("ioting.mock.db.v3")).toBe(original); // intacta
      const cfg = await mockApi.configuracion.get();
      expect(cfg.sectores).toContain("Agroindustrial");
      for (const s of SECTORES_RETIRADOS) expect(cfg.sectores).not.toContain(s);
    });
  });
});

describe("Parte B — servicios por cliente (derivados)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMemoria();
  });
  it("cuenta completados y en curso solo del propio cliente; el servicio de otro cliente no cuenta", async () => {
    const [a, b] = await mockApi.clientes.list();
    expect(a && b).toBeTruthy();
    if (!a || !b) return;
    const crear = (clienteId: string, estado: TrabajoTecnico["estado"]) =>
      mockApi.trabajos.create({
        clienteId,
        tipo: "cctv",
        titulo: `Servicio ${estado}`,
        estado,
      });
    const antes = new Map((await mockApi.clientes.list()).map((c) => [c.id, c]));
    await crear(a.id, "completado");
    await crear(a.id, "completado");
    await crear(a.id, "en_curso");
    await crear(a.id, "programado");
    await crear(b.id, "completado");
    const lista = new Map((await mockApi.clientes.list()).map((c) => [c.id, c]));
    expect(lista.get(a.id)?.serviciosCompletados).toBe(
      (antes.get(a.id)?.serviciosCompletados ?? 0) + 2,
    );
    expect(lista.get(a.id)?.serviciosEnCurso).toBe((antes.get(a.id)?.serviciosEnCurso ?? 0) + 1);
    expect(lista.get(b.id)?.serviciosCompletados).toBe(
      (antes.get(b.id)?.serviciosCompletados ?? 0) + 1,
    );
  });
  it("los derivados no se persisten ni se escriben aunque el cliente los envíe de vuelta", async () => {
    const [c] = await mockApi.clientes.list();
    if (!c) throw new Error("sin clientes");
    await mockApi.clientes.update(c.id, { ciudad: "Cali", serviciosCompletados: 99 });
    const guardada = JSON.parse(window.localStorage.getItem("ioting.mock.db.v4") ?? "{}") as {
      clientes: Record<string, unknown>[];
    };
    const g = guardada.clientes.find((x) => x["id"] === c.id);
    expect(g?.["ciudad"]).toBe("Cali");
    expect("serviciosCompletados" in (g ?? {})).toBe(false);
    expect("serviciosEnCurso" in (g ?? {})).toBe(false);
  });
});

describe("Parte D — columna «Fin» de proyectos", () => {
  const html = (p: Parameters<typeof FinProyecto>[0]["p"]) =>
    renderToStaticMarkup(FinProyecto({ p }));
  it("finalizado con fecha muestra la fecha; vigente muestra «Vigente»; finalizado sin fecha muestra «Sin fecha»", () => {
    expect(html({ estado: "finalizado", fechaFin: "2026-08-28T12:00:00-05:00" })).toContain("28");
    expect(html({ estado: "finalizado", fechaFin: "2026-08-28T12:00:00-05:00" })).not.toContain(
      "Vigente",
    );
    for (const e of ["en_desarrollo", "activo", "pausado"] as const)
      expect(html({ estado: e })).toContain("Vigente");
    expect(html({ estado: "finalizado" })).toContain("Sin fecha");
    // nunca una fecha inventada: «Sin fecha» no lleva dígitos de fecha
    expect(html({ estado: "finalizado" })).not.toMatch(/\d{1,2}\s*(de|\/|-)/);
  });
  it("la API rechaza una fecha de fin anterior al inicio", async () => {
    window.localStorage.clear();
    resetMemoria();
    const [p] = await mockApi.proyectos.list();
    if (!p) throw new Error("sin proyectos");
    await expect(
      mockApi.proyectos.update(p.id, {
        fechaInicio: "2026-05-10T12:00:00-05:00",
        fechaFin: "2026-05-01T12:00:00-05:00",
      }),
    ).rejects.toThrow(/fin no puede ser anterior/i);
  });
});

describe("Parte E — orden por defecto de servicios técnicos", () => {
  const s = (
    codigo: string,
    estado: TrabajoTecnico["estado"],
    fechaProgramada?: string,
    fechaFin?: string,
  ) => ({ codigo, estado, fechaProgramada, fechaFin });
  it("más reciente primero por fecha de entrega; sin ella, por programada; sin ninguna, al final por código descendente", () => {
    const lista = [
      s("TT-0001", "completado", "2026-01-10", "2026-01-12"),
      s("TT-0002", "completado", "2026-03-01", "2026-03-05"),
      s("TT-0003", "programado", "2026-04-01"),
      s("TT-0004", "programado"),
      s("TT-0005", "programado"),
      s("TT-0006", "completado", "2026-02-01", "2026-02-02"),
    ];
    const orden = [...lista].sort(compararServicios).map((x) => x.codigo);
    // programado 04-01 (clave programada) > entrega 03-05 > 02-02 > 01-12; sin fecha al final por código desc.
    expect(orden).toEqual(["TT-0003", "TT-0002", "TT-0006", "TT-0001", "TT-0005", "TT-0004"]);
  });
  it("el código TT- no determina el orden cuando hay fechas (una entrega antigua con código alto va después)", () => {
    const orden = [
      s("TT-0099", "completado", "2020-01-01", "2020-01-02"),
      s("TT-0001", "completado", "2026-11-01", "2026-11-09"),
    ]
      .sort(compararServicios)
      .map((x) => x.codigo);
    expect(orden).toEqual(["TT-0001", "TT-0099"]);
  });
});

describe("Parte F — valor del inventario por tipo", () => {
  const params = CONFIG_INVENTARIO_DEFECTO.depreciacion;
  const item = (
    sku: string,
    grupo: ItemInventario["grupo"],
    cant: number,
    valor: number | null,
    estado: ItemInventario["estado"] = "Disponible",
  ): ItemInventario => ({
    sku,
    grupo,
    categoria: "x",
    subcategoria: "y",
    descripcion: sku,
    marca_referencia: "",
    cantidad_inicial: cant,
    unidad: "und",
    estado,
    ubicacion: "",
    stock_minimo: null,
    notas: "",
    valorUnitario: valor,
  });
  const movs: MovimientoInventario[] = [];
  it("suma existencia a costo por tipo, calcula porcentajes y cuenta aparte los ítems sin valor", () => {
    const r = valorPorTipo({
      items: [
        item("A-1", "componentes", 10, 1000), // 10.000
        item("A-2", "componentes", 5, 2000), // 10.000
        item("H-1", "herramientas", 2, 5000), // 10.000
        item("E-1", "equipos", 1, 20000), // 20.000
        item("A-3", "componentes", 99, null), // sin valor: no suma
        item("H-2", "herramientas", 3, null),
        item("E-2", "equipos", 1, 999999, "Baja"), // dado de baja: no cuenta
      ],
      movs,
      params,
      anioActual: 2026,
    });
    expect(r.total).toBe(50000);
    expect(r.filas.map((f) => [f.grupo, f.valor])).toEqual([
      ["componentes", 20000],
      ["herramientas", 10000],
      ["equipos", 20000],
    ]);
    expect(r.filas.map((f) => Math.round(f.pct))).toEqual([40, 20, 40]);
    expect(r.filas.reduce((s, f) => s + f.pct, 0)).toBeCloseTo(100, 5);
    expect(r.conValor).toBe(4);
    expect(r.totalItems).toBe(6); // 4 con valor + 2 sin valor; el dado de baja no entra
  });
  it("sin ningún valor cargado el total es 0, los porcentajes 0 (no NaN) y el aviso lo dice", () => {
    const r = valorPorTipo({
      items: [item("A-1", "componentes", 4, null), item("H-1", "herramientas", 2, null)],
      movs,
      params,
      anioActual: 2026,
    });
    expect(r.total).toBe(0);
    for (const f of r.filas) expect(f.pct).toBe(0);
    expect([r.conValor, r.totalItems]).toEqual([0, 2]);
  });
  it("las tres barras tienen colores DISTINTOS ya resueltos (no solo nombres distintos), en tema claro y oscuro", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const bloque = (inicio: string) => {
      const i = css.indexOf(inicio);
      return css.slice(i, css.indexOf("\n}", i));
    };
    const valorDe = (b: string, nombre: string) =>
      new RegExp(`${nombre}:\\s*([^;]+);`).exec(b)?.[1]?.trim();
    for (const b of [bloque(":root {"), bloque(".dark {")]) {
      const colores = ["--primary", "--warning", "--success"].map(
        (n) => valorDe(b, n) ?? valorDe(bloque(":root {"), n),
      );
      expect(colores.every(Boolean)).toBe(true);
      expect(new Set(colores).size).toBe(3);
    }
  });
});
