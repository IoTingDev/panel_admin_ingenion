// Fase 2.2 — migración de la base guardada v1 → v2.
import { beforeEach, describe, expect, it } from "vitest";
import { migrarV1aV2 as migrarV1aV2Real } from "@/lib/api/mock/migracion";
import { buildSeed, type MockDb as MockDbActual } from "@/lib/api/mock/seed";
import { mockApi, resetMemoria } from "@/lib/api/mock";

/**
 * Reconstruye una base tal como la guardaba la v1: sin grupo, sin valoración, sin config, con las
 * categorías viejas («Cableado» para todo CAB-*, «Equipos» para EQP-008/009) y sin contador.
 * Las expectativas de abajo son números literales del encargo, no calculados con el código.
 */
/** Forma de la base en la etapa v2 (cuatro grupos): esta etapa de la cadena se sigue probando. */
interface MockDb {
  items: {
    sku: string;
    grupo: string;
    categoria: string;
    cantidad_inicial: number;
    ubicacion: string;
  }[];
  movimientos: {
    id: string;
    sku: string;
    destinoTipo?: string;
    destinoId?: string;
    proyecto?: string;
  }[];
  auditoria: { accion: string }[];
  secuencias: Record<string, number>;
  proyectos: { id: string; nombre: string }[];
  config: {
    inventario: {
      categorias: Record<string, string[]>;
      prefijos: Record<string, string>;
      depreciacion: { residualPct: number; aniosPorGrupo: Record<string, number | null> };
    };
  };
}
const migrarV1aV2 = (raw: Record<string, unknown>) => migrarV1aV2Real(raw) as unknown as MockDb;

function comoV1(db: MockDbActual): Record<string, unknown> {
  const v1 = structuredClone(db) as unknown as Record<string, unknown>;
  const items = v1["items"] as Record<string, unknown>[];
  for (const i of items) {
    const sku = String(i["sku"]);
    delete i["grupo"];
    delete i["anioCompra"];
    delete i["valorUnitario"];
    delete i["costoInicial"];
    delete i["vidaUtilAnios"];
    delete i["proveedor"];
    if (sku.startsWith("CAB-")) i["categoria"] = "Cableado";
    if (sku === "EQP-008" || sku === "EQP-009") i["categoria"] = "Equipos";
  }
  delete v1["secuencias"];
  delete v1["config"];
  delete v1["version"];
  return v1;
}
const porGrupo = (db: MockDb) =>
  Object.fromEntries(
    ["componentes", "herramientas", "equipos", "seguridad"].map((g) => [
      g,
      db.items.filter((i) => i["grupo"] === g).length,
    ]),
  );
const unidades = (db: MockDb) => db.items.reduce((a, i) => a + i.cantidad_inicial, 0);

describe("migración v1 → v2 con la semilla limpia", () => {
  const v2 = migrarV1aV2(comoV1(buildSeed()));
  it("150 referencias, 401 unidades, grupos 100/36/8/6", () => {
    expect(v2.items).toHaveLength(150);
    expect(unidades(v2)).toBe(401);
    expect(porGrupo(v2)).toEqual({ componentes: 100, herramientas: 36, equipos: 8, seguridad: 6 });
  });
  it("solo cambian grupo y categoría; los SKU no cambian", () => {
    const original = buildSeed();
    expect(v2.items.map((i) => i["sku"])).toEqual(original.items.map((i) => i["sku"]));
    const cab = (sku: string) => v2.items.find((i) => i["sku"] === sku)!;
    expect([cab("CAB-001").grupo, cab("CAB-001").categoria]).toEqual([
      "herramientas",
      "Accesorios de taller",
    ]);
    expect([cab("CAB-004").grupo, cab("CAB-004").categoria]).toEqual([
      "seguridad",
      "Cableado y conectividad",
    ]);
    expect([cab("CAB-012").grupo, cab("CAB-012").categoria]).toEqual([
      "herramientas",
      "Accesorios de taller",
    ]);
    expect([cab("EQP-008").grupo, cab("EQP-008").categoria]).toEqual([
      "herramientas",
      "Herramientas de mano",
    ]);
    expect([cab("EQP-010").grupo, cab("EQP-010").categoria]).toEqual(["equipos", "Equipos"]);
  });
  it("trae la configuración con categorías, prefijos y depreciación por defecto", () => {
    expect(v2.config.inventario.categorias["seguridad"]).toContain("Cámaras");
    expect(v2.config.inventario.prefijos["Cámaras"]).toBe("CAM");
    expect(v2.config.inventario.depreciacion.residualPct).toBe(10);
    expect(v2.config.inventario.depreciacion.aniosPorGrupo["herramientas"]).toBe(5);
    expect(v2.config.inventario.depreciacion.aniosPorGrupo["componentes"]).toBeNull();
  });
});

describe("migración v1 → v2 con una base v1 ya modificada", () => {
  const base = buildSeed();
  const v1 = comoV1(base);
  const items = v1["items"] as Record<string, unknown>[];
  const movs = v1["movimientos"] as Record<string, unknown>[];
  const movsAntes = movs.length;
  const audAntes = (v1["auditoria"] as unknown[]).length;
  // 1) un ítem eliminado que dejó movimientos huérfanos
  movs.push({
    id: "h1",
    fecha: "2026-05-01T10:00:00.000Z",
    sku: "SEN-099",
    tipo: "Entrada",
    cantidad: 4,
  });
  movs.push({
    id: "h2",
    fecha: "2026-05-02T10:00:00.000Z",
    sku: "SEN-099",
    tipo: "Salida",
    cantidad: 1,
  });
  // 2) un ítem creado por el usuario en la categoría vieja «Cableado»
  items.push({
    sku: "CAB-013",
    categoria: "Cableado",
    subcategoria: "x",
    descripcion: "Cable nuevo",
    marca_referencia: "",
    cantidad_inicial: 7,
    unidad: "und",
    estado: "Disponible",
    ubicacion: "",
    stock_minimo: null,
    notas: "",
  });
  // 3) movimientos nuevos, uno con un proyecto por nombre
  movs.push({
    id: "m9",
    fecha: "2026-06-01T10:00:00.000Z",
    sku: "CAB-005",
    tipo: "Salida",
    cantidad: 2,
    proyecto: "Monitoreo de fermentación de cacao",
  });
  // 4) un ítem editado por el usuario
  items.find((i) => i["sku"] === "SEN-001")!["ubicacion"] = "Estante 3";
  const v2 = migrarV1aV2(v1);

  it("conserva todos los movimientos y la auditoría (y añade el evento de migración)", () => {
    expect(v2.movimientos).toHaveLength(movsAntes + 3);
    expect(v2.movimientos.filter((m) => m.sku === "SEN-099")).toHaveLength(2);
    expect(v2.auditoria.length).toBe(audAntes + 1);
    expect(v2.auditoria[0]?.accion).toBe("sistema.migracion");
  });
  it("el ítem de usuario en «Cableado» cae en herramientas/Accesorios de taller, sin perder datos", () => {
    const n = v2.items.find((i) => i["sku"] === "CAB-013")!;
    expect([n.grupo, n.categoria, n.cantidad_inicial]).toEqual([
      "herramientas",
      "Accesorios de taller",
      7,
    ]);
  });
  it("sus ediciones sobreviven", () => {
    expect(v2.items.find((i) => i["sku"] === "SEN-001")!.ubicacion).toBe("Estante 3");
  });
  it("el contador respeta los SKU huérfanos: el siguiente SEN no es 047 ni 099", () => {
    expect(v2.secuencias["SEN"]).toBe(99);
    expect(v2.secuencias["CAB"]).toBe(13);
  });
  it("las unidades suman lo que había más el ítem nuevo; los grupos se actualizan", () => {
    expect(unidades(v2)).toBe(401 + 7);
    expect(porGrupo(v2)).toEqual({ componentes: 100, herramientas: 37, equipos: 8, seguridad: 6 });
  });
  it("el proyecto escrito por nombre queda enlazado por id", () => {
    const m = v2.movimientos.find((x) => x.id === "m9")!;
    const p = v2.proyectos.find((x) => x.nombre === "Monitoreo de fermentación de cacao")!;
    expect(m.destinoTipo).toBe("proyecto");
    expect(m.destinoId).toBe(p.id);
    expect(m.proyecto).toBe("Monitoreo de fermentación de cacao"); // el texto original no se pierde
  });
  it("migrar dos veces da lo mismo (idempotente)", () => {
    const otra = migrarV1aV2(structuredClone(v2) as unknown as Record<string, unknown>);
    expect(otra.items).toEqual(v2.items);
    expect(otra.auditoria.length).toBe(v2.auditoria.length);
  });
});

describe("carga desde localStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMemoria();
  });
  it("una base v1 guardada se migra al leer (v1 → v2 → v3), se guarda como v3 y la v1 queda de respaldo", async () => {
    window.localStorage.setItem("ioting.mock.db.v1", JSON.stringify(comoV1(buildSeed())));
    const items = await mockApi.inventario.listItems();
    expect(items).toHaveLength(150);
    expect(items.filter((i) => i["grupo"] === "componentes")).toHaveLength(106);
    const v2 = JSON.parse(window.localStorage.getItem("ioting.mock.db.v3") ?? "null");
    expect(v2?.items).toHaveLength(150);
    expect(window.localStorage.getItem("ioting.mock.db.v1")).not.toBeNull();
  });
});
