// Fase 2.3 — las tres cifras se calculan, nunca se guardan.
import { describe, expect, it } from "vitest";
import {
  factorDepreciacion,
  invertidoItem,
  resumenValor,
  valorEstimado,
  valorExistencia,
  type ParametrosDepreciacion,
} from "@/lib/valoracion";
import type { ItemInventario, MovimientoInventario } from "@/lib/api/types";

const params: ParametrosDepreciacion = {
  aniosPorGrupo: { componentes: null, herramientas: 5, equipos: 5 },
  residualPct: 10,
};

const item = (over: Partial<ItemInventario> = {}): ItemInventario => ({
  sku: "MAN-001",
  grupo: "herramientas",
  categoria: "Herramientas de mano",
  subcategoria: "x",
  descripcion: "Alicate",
  marca_referencia: "",
  cantidad_inicial: 2,
  unidad: "und",
  estado: "Disponible",
  ubicacion: "",
  stock_minimo: null,
  notas: "",
  anioCompra: 2024,
  valorUnitario: 100_000,
  costoInicial: 100_000,
  ...over,
});
const mov = (
  tipo: "Entrada" | "Salida",
  cantidad: number,
  costoUnitario?: number,
  fecha = "2026-03-01T10:00:00.000Z",
): MovimientoInventario => ({
  id: `${tipo}${cantidad}${costoUnitario ?? ""}`,
  fecha,
  sku: "MAN-001",
  tipo,
  cantidad,
  costoUnitario,
});

describe("existencia a costo", () => {
  it("stock × valor unitario", () => {
    expect(valorExistencia(item(), 2)).toBe(200_000);
  });
  it("sin valor no se inventa un cero: devuelve null", () => {
    expect(valorExistencia(item({ valorUnitario: null }), 2)).toBeNull();
  });
});

describe("depreciación lineal con valor residual", () => {
  it("herramienta de 2 años sobre 5 de vida: conserva 60 %", () => {
    expect(factorDepreciacion(item(), 2026, params)).toBeCloseTo(0.6, 10);
    expect(valorEstimado(item(), 2, 2026, params)).toBe(120_000);
  });
  it("pasada la vida útil no baja del residual (10 %)", () => {
    expect(factorDepreciacion(item({ anioCompra: 2017 }), 2026, params)).toBeCloseTo(0.1, 10);
    expect(valorEstimado(item({ anioCompra: 2017 }), 2, 2026, params)).toBe(20_000);
  });
  it("los componentes no se deprecian por defecto", () => {
    const c = item({ grupo: "componentes", anioCompra: 2010 });
    expect(factorDepreciacion(c, 2026, params)).toBe(1);
    expect(valorEstimado(c, 2, 2026, params)).toBe(200_000);
  });
  it("la vida útil propia del ítem manda sobre la del grupo", () => {
    expect(factorDepreciacion(item({ vidaUtilAnios: 10 }), 2026, params)).toBeCloseTo(0.8, 10);
    // y un componente con vida útil propia sí se deprecia
    expect(
      factorDepreciacion(item({ grupo: "componentes", vidaUtilAnios: 4 }), 2026, params),
    ).toBeCloseTo(0.5, 10);
  });
  it("sin año de compra no se puede deprecar: se deja a costo, no se inventa una edad", () => {
    expect(factorDepreciacion(item({ anioCompra: null }), 2026, params)).toBe(1);
  });
  it("el residual es un parámetro", () => {
    expect(
      factorDepreciacion(item({ anioCompra: 2000 }), 2026, { ...params, residualPct: 25 }),
    ).toBeCloseTo(0.25, 10);
  });
});

describe("invertido incluye lo ya consumido", () => {
  it("cantidad inicial × costo inicial + Σ entradas con costo", () => {
    const it = item({ cantidad_inicial: 10, costoInicial: 1000, valorUnitario: 1000 });
    // 8 salen: el invertido NO baja
    const movs = [mov("Salida", 8), mov("Entrada", 5, 2000)];
    expect(invertidoItem(it, movs)).toBe(10 * 1000 + 5 * 2000);
  });
  it("entradas sin costo no suman, y un ítem sin nada costeado da null", () => {
    expect(
      invertidoItem(item({ costoInicial: null, valorUnitario: null }), [mov("Entrada", 3)]),
    ).toBeNull();
  });
});

describe("resumen de valor del inventario", () => {
  const a = item({ sku: "MAN-001", cantidad_inicial: 2 });
  const b = item({
    sku: "SEN-001",
    grupo: "componentes",
    categoria: "Instrumentación",
    cantidad_inicial: 3,
    valorUnitario: 50_000,
    costoInicial: 50_000,
    anioCompra: 2025,
  });
  const c = item({ sku: "EQP-001", grupo: "equipos", valorUnitario: null, costoInicial: null });
  const d = item({ sku: "HER-009", estado: "Baja", valorUnitario: 999_999, costoInicial: 999_999 });
  const base = {
    items: [a, b, c, d],
    movs: [] as MovimientoInventario[],
    params,
    anioActual: 2026,
  };
  it("excluye los ítems sin valor (y los avisa) y los dados de baja", () => {
    const r = resumenValor(base);
    expect(r.existencia).toBe(2 * 100_000 + 3 * 50_000);
    expect(r.conValor).toBe(2);
    expect(r.sinValor).toBe(1); // c; d está de baja y no cuenta
    expect(r.estimado).toBe(120_000 + 150_000);
    expect(r.invertido).toBe(2 * 100_000 + 3 * 50_000);
  });
  it("el filtro por grupo, categoría y año de compra acota las tres cifras", () => {
    expect(resumenValor({ ...base, filtros: { grupo: "componentes" } }).existencia).toBe(150_000);
    expect(resumenValor({ ...base, filtros: { categoria: "Instrumentación" } }).existencia).toBe(
      150_000,
    );
    expect(resumenValor({ ...base, filtros: { anio: 2024 } }).existencia).toBe(200_000);
  });
  it("trae el desglose por grupo, el invertido por año y el top 10 por valor", () => {
    const r = resumenValor(base);
    expect(r.porGrupo.herramientas.existencia).toBe(200_000);
    expect(r.porGrupo.componentes.existencia).toBe(150_000);
    expect(r.invertidoPorAnio).toEqual([
      { anio: "2024", valor: 200_000 },
      { anio: "2025", valor: 150_000 },
    ]);
    expect(r.top10.map((t) => t.sku)).toEqual(["MAN-001", "SEN-001"]);
  });
});
