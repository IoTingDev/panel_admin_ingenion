// Ingresos por servicios (por tipo y por sector) y etiquetas con la primera letra en mayúscula.
import { describe, expect, it } from "vitest";
import { capitalizar } from "@/lib/format";
import { resumenIngresos, resumenIngresosProyectos } from "@/lib/ingresos";
import { mockApi, resetMemoria } from "@/lib/api/mock";
import type { MovimientoInventario, Proyecto, TrabajoTecnico } from "@/lib/api";

const cliente = (id: string, sector: string) => ({ id, sector });
const clientes = [
  cliente("c1", "comercial"),
  cliente("c2", "residencial"),
  cliente("c3", "industrial"),
];
let n = 0;
const t = (
  clienteId: string,
  tipo: TrabajoTecnico["tipo"],
  estado: TrabajoTecnico["estado"],
  valorPactado: number | undefined,
  fechas: { fechaFin?: string; fechaProgramada?: string } = {},
): TrabajoTecnico => ({
  id: `t${++n}`,
  codigo: `TT-${String(n).padStart(4, "0")}`,
  clienteId,
  tipo,
  titulo: `Servicio ${n}`,
  estado,
  valorPactado,
  registradoEn: "2026-01-01T12:00:00-05:00",
  ...fechas,
});
const salida = (
  destinoId: string,
  cantidad: number,
  costoAlSalir: number | null,
): MovimientoInventario => ({
  id: `m${++n}`,
  fecha: "2026-05-01T12:00:00-05:00",
  sku: "X-1",
  tipo: "Salida",
  cantidad,
  destinoTipo: "trabajo",
  destinoId,
  costoAlSalir,
});

const trabajos = [
  t("c1", "cctv", "completado", 1_000_000, { fechaFin: "2026-03-10T12:00:00-05:00" }),
  t("c1", "cctv", "completado", 3_000_000, { fechaFin: "2026-04-10T12:00:00-05:00" }),
  t("c2", "mantenimiento", "completado", 200_000, { fechaFin: "2025-12-01T12:00:00-05:00" }),
  t("c2", "cctv", "completado", undefined, { fechaFin: "2026-02-01T12:00:00-05:00" }), // sin valor pactado
  t("c3", "alarmas", "programado", 500_000, { fechaProgramada: "2026-12-01" }),
  t("c3", "alarmas", "cancelado", 999_999, { fechaProgramada: "2026-01-01" }),
];

describe("resumenIngresos", () => {
  it("suma el valor pactado de los completados por tipo y por sector, ordenados", () => {
    const r = resumenIngresos({
      trabajos,
      clientes,
      movs: [],
      filtro: { estado: "completados", anio: "" },
    });
    expect(r.servicios).toBe(4);
    expect(r.conValor).toBe(3);
    expect(r.sinValor).toBe(1);
    expect(r.ingresos).toBe(4_200_000);
    expect(r.ticket).toBe(1_400_000);
    expect(r.porTipo.map((f) => [f.tipo, f.servicios, f.ingresos])).toEqual([
      ["cctv", 3, 4_000_000],
      ["mantenimiento", 1, 200_000],
    ]);
    // sector: por servicios solicitados (comercial 2, residencial 2) y, en empate, por ingresos
    expect(r.porSector.map((f) => [f.sector, f.servicios, f.ingresos, f.clientes])).toEqual([
      ["comercial", 2, 4_000_000, 1],
      ["residencial", 2, 200_000, 1],
    ]);
    expect(r.porTipo[0]?.pctIngresos).toBeCloseTo((4_000_000 / 4_200_000) * 100, 6);
  });

  it("un servicio sin valor pactado cuenta como servicio pero no suma ingresos; el cancelado nunca entra", () => {
    const r = resumenIngresos({
      trabajos,
      clientes,
      movs: [],
      filtro: { estado: "todos", anio: "" },
    });
    expect(r.servicios).toBe(5); // 4 completados + 1 programado; el cancelado no
    expect(r.ingresos).toBe(4_700_000);
    expect(r.ingresos).not.toBe(4_700_000 + 999_999);
  });

  it("estado «pendientes» solo cuenta programados y en curso; el filtro de año usa la entrega o la fecha programada", () => {
    const p = resumenIngresos({
      trabajos,
      clientes,
      movs: [],
      filtro: { estado: "pendientes", anio: "" },
    });
    expect([p.servicios, p.ingresos]).toEqual([1, 500_000]);
    const a26 = resumenIngresos({
      trabajos,
      clientes,
      movs: [],
      filtro: { estado: "completados", anio: "2026" },
    });
    expect(a26.ingresos).toBe(4_000_000);
    const a25 = resumenIngresos({
      trabajos,
      clientes,
      movs: [],
      filtro: { estado: "completados", anio: "2025" },
    });
    expect(a25.ingresos).toBe(200_000);
    expect(
      resumenIngresos({ trabajos, clientes, movs: [], filtro: { estado: "completados", anio: "" } })
        .anios,
    ).toEqual(["2026", "2025"]);
  });

  it("sin materiales registrados no hay margen (null, no un 100 % inventado); con materiales resta solo el costo asociado al servicio", () => {
    const sin = resumenIngresos({
      trabajos,
      clientes,
      movs: [],
      filtro: { estado: "completados", anio: "" },
    });
    expect(sin.materiales).toBe(0);
    expect(sin.margenPct).toBeNull();
    const [s1, s2] = trabajos;
    const movs = [
      salida(s1?.id ?? "", 2, 100_000), // 200.000 al servicio 1 (cctv, 1.000.000)
      salida(s2?.id ?? "", 1, 500_000), // 500.000 al servicio 2 (cctv, 3.000.000)
      salida("otro-servicio", 9, 9_000_000), // de un servicio fuera del alcance: no cuenta
      salida(s1?.id ?? "", 1, null), // salida sin costo: se avisa, no suma
    ];
    const r = resumenIngresos({
      trabajos,
      clientes,
      movs,
      filtro: { estado: "completados", anio: "" },
    });
    expect(r.materiales).toBe(700_000);
    expect(r.salidasSinCosto).toBe(1);
    const cctv = r.porTipo.find((f) => f.tipo === "cctv");
    expect(cctv?.materiales).toBe(700_000);
    expect(cctv?.margen).toBe(4_000_000 - 700_000);
    expect(cctv?.margenPct).toBeCloseTo(((4_000_000 - 700_000) / 4_000_000) * 100, 6);
    expect(r.porTipo.find((f) => f.tipo === "mantenimiento")?.margenPct).toBeNull();
  });

  it("sin datos: ceros y listas vacías, sin NaN", () => {
    const r = resumenIngresos({
      trabajos: [],
      clientes: [],
      movs: [],
      filtro: { estado: "completados", anio: "" },
    });
    expect([r.servicios, r.ingresos, r.ticket, r.margenPct]).toEqual([0, 0, null, null]);
    expect(r.porTipo).toEqual([]);
    expect(r.porSector).toEqual([]);
  });
});

describe("capitalizar (solo para mostrar)", () => {
  it("pone la primera letra en mayúscula y no toca el resto ni el valor guardado", () => {
    expect(capitalizar("residencial")).toBe("Residencial");
    expect(capitalizar("Agroindustrial")).toBe("Agroindustrial");
    expect(capitalizar("activo")).toBe("Activo");
    expect(capitalizar("café")).toBe("Café");
    expect(capitalizar("óptica")).toBe("Óptica");
    expect(capitalizar("")).toBe("");
  });
});

describe("Ingresos por proyectos I+D+I (por tipo y por sector)", () => {
  const p = (
    id: string,
    clienteId: string,
    estado: Proyecto["estado"],
    valorPactado: number | undefined,
    extra: Partial<Proyecto> = {},
  ): Proyecto => ({ id, clienteId, nombre: `Proyecto ${id}`, estado, valorPactado, ...extra });
  const proyectos = [
    p("a", "c1", "finalizado", 10_000_000, {
      tipo: "software",
      fechaInicio: "2025-01-01",
      fechaFin: "2026-03-01",
    }),
    p("b", "c1", "finalizado", 4_000_000, {
      tipo: "iot",
      fechaInicio: "2024-01-01",
      fechaFin: "2025-06-01",
    }),
    p("c", "c2", "finalizado", 6_000_000, {
      tipo: "software",
      fechaInicio: "2025-02-01",
      fechaFin: "2026-08-01",
    }),
    p("d", "c2", "finalizado", 1_000_000, { fechaInicio: "2025-02-01", fechaFin: "2026-09-01" }), // sin tipo
    p("e", "c3", "activo", 7_000_000, { tipo: "monitoreo", fechaInicio: "2026-02-01" }),
    p("f", "c3", "en_desarrollo", undefined, { tipo: "automatizacion", fechaInicio: "2026-05-01" }),
    p("g", "c1", "baja", 99_000_000, { tipo: "software", fechaInicio: "2026-01-01" }),
  ];
  const filtro = (estado: "finalizados" | "vigentes" | "todos", anio = "") => ({ estado, anio });
  const salida = (destinoId: string, cantidad: number, costo: number): MovimientoInventario => ({
    id: `mp${destinoId}`,
    fecha: "2026-05-01T12:00:00-05:00",
    sku: "X-1",
    tipo: "Salida",
    cantidad,
    destinoTipo: "proyecto",
    destinoId,
    costoAlSalir: costo,
  });

  it("por tipo de proyecto: suma el valor pactado de los finalizados, ordenado por ingresos, con «Sin tipo» al final", () => {
    const r = resumenIngresosProyectos({
      proyectos,
      clientes,
      movs: [],
      filtro: filtro("finalizados"),
    });
    expect([r.proyectos, r.conValor, r.ingresos]).toEqual([4, 4, 21_000_000]);
    expect(r.porTipo.map((f) => [f.tipo, f.proyectos, f.ingresos])).toEqual([
      ["software", 2, 16_000_000],
      ["iot", 1, 4_000_000],
      ["sin_tipo", 1, 1_000_000],
    ]);
    expect(r.porTipo[0]?.pctIngresos).toBeCloseTo((16_000_000 / 21_000_000) * 100, 6);
    expect(r.porTipo[0]?.ticket).toBe(8_000_000);
  });

  it("«Sin tipo» va siempre al final, aunque tenga más ingresos que los clasificados", () => {
    const r = resumenIngresosProyectos({
      proyectos: [
        p("x", "c1", "finalizado", 9_000_000, { fechaFin: "2026-01-01" }), // sin tipo, el mayor
        p("y", "c1", "finalizado", 1_000_000, { tipo: "iot", fechaFin: "2026-01-01" }),
      ],
      clientes,
      movs: [],
      filtro: filtro("finalizados"),
    });
    expect(r.porTipo.map((f) => f.tipo)).toEqual(["iot", "sin_tipo"]);
  });

  it("por sector del cliente: ordenado por proyectos solicitados; la baja nunca cuenta", () => {
    const r = resumenIngresosProyectos({ proyectos, clientes, movs: [], filtro: filtro("todos") });
    expect(r.proyectos).toBe(6); // 7 menos el dado de baja
    expect(r.ingresos).toBe(28_000_000);
    expect(r.ingresos).not.toBe(28_000_000 + 99_000_000);
    expect(r.porSector.map((f) => [f.sector, f.proyectos, f.ingresos, f.clientes])).toEqual([
      ["comercial", 2, 14_000_000, 1], // c1: a, b
      ["residencial", 2, 7_000_000, 1], // c2: c, d
      ["industrial", 2, 7_000_000, 1], // c3: e, f (f sin valor)
    ]);
  });

  it("vigentes = en desarrollo, en operación y pausados; el año usa la fecha de fin (finalizados) o de inicio (vigentes)", () => {
    const v = resumenIngresosProyectos({
      proyectos,
      clientes,
      movs: [],
      filtro: filtro("vigentes"),
    });
    expect([v.proyectos, v.conValor, v.sinValor, v.ingresos]).toEqual([2, 1, 1, 7_000_000]);
    const a26 = resumenIngresosProyectos({
      proyectos,
      clientes,
      movs: [],
      filtro: filtro("finalizados", "2026"),
    });
    expect(a26.ingresos).toBe(10_000_000 + 6_000_000 + 1_000_000);
    const a25 = resumenIngresosProyectos({
      proyectos,
      clientes,
      movs: [],
      filtro: filtro("finalizados", "2025"),
    });
    expect(a25.ingresos).toBe(4_000_000);
    expect(
      resumenIngresosProyectos({ proyectos, clientes, movs: [], filtro: filtro("finalizados") })
        .anios,
    ).toEqual(["2026", "2025"]);
  });

  it("el material asociado al proyecto resta del margen; sin materiales no hay margen inventado", () => {
    const sin = resumenIngresosProyectos({
      proyectos,
      clientes,
      movs: [],
      filtro: filtro("finalizados"),
    });
    expect(sin.margenPct).toBeNull();
    const r = resumenIngresosProyectos({
      proyectos,
      clientes,
      movs: [salida("a", 4, 500_000), salida("z-fuera", 9, 9_000_000)],
      filtro: filtro("finalizados"),
    });
    expect(r.materiales).toBe(2_000_000);
    const sw = r.porTipo.find((f) => f.tipo === "software");
    expect(sw?.margen).toBe(16_000_000 - 2_000_000);
    expect(sw?.margenPct).toBeCloseTo((14_000_000 / 16_000_000) * 100, 6);
    expect(r.porTipo.find((f) => f.tipo === "iot")?.margenPct).toBeNull();
  });
});

describe("Proyectos: valor pactado y tipo en la API", () => {
  it("acepta un valor pactado entero ≥ 0 y rechaza uno negativo o con decimales", async () => {
    window.localStorage.clear();
    resetMemoria();
    const [c] = await mockApi.clientes.list();
    if (!c) throw new Error("sin clientes");
    const ok = await mockApi.proyectos.create({
      clienteId: c.id,
      nombre: "Proyecto con valor",
      estado: "en_desarrollo",
      valorPactado: 8_500_000,
    });
    expect((await mockApi.proyectos.get(ok.id))?.valorPactado).toBe(8_500_000);
    await expect(
      mockApi.proyectos.create({
        clienteId: c.id,
        nombre: "Negativo",
        estado: "activo",
        valorPactado: -1,
      }),
    ).rejects.toThrow(/valor pactado/i);
    await expect(mockApi.proyectos.update(ok.id, { valorPactado: 10.5 })).rejects.toThrow(
      /valor pactado/i,
    );
    expect((await mockApi.proyectos.get(ok.id))?.valorPactado).toBe(8_500_000);
  });
  it("el tipo es opcional y solo admite software, iot, monitoreo o automatización", async () => {
    window.localStorage.clear();
    resetMemoria();
    const [c] = await mockApi.clientes.list();
    if (!c) throw new Error("sin clientes");
    const sin = await mockApi.proyectos.create({
      clienteId: c.id,
      nombre: "Sin tipo",
      estado: "activo",
    });
    expect(sin.tipo).toBeUndefined();
    for (const tipo of ["software", "iot", "monitoreo", "automatizacion"] as const) {
      const x = await mockApi.proyectos.create({
        clienteId: c.id,
        nombre: `Tipo ${tipo}`,
        estado: "activo",
        tipo,
      });
      expect((await mockApi.proyectos.get(x.id))?.tipo).toBe(tipo);
    }
    await expect(
      mockApi.proyectos.create({
        clienteId: c.id,
        nombre: "Inventado",
        estado: "activo",
        tipo: "hardware" as never,
      }),
    ).rejects.toThrow(/Tipo de proyecto inválido/);
    await expect(mockApi.proyectos.update(sin.id, { tipo: "otro" as never })).rejects.toThrow(
      /Tipo de proyecto inválido/,
    );
    expect((await mockApi.proyectos.get(sin.id))?.tipo).toBeUndefined();
  });
});
