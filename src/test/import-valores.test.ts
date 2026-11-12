import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { enteroDeCelda, parseCsvValores } from "@/lib/import-valores";
import { previsualizarValores } from "@/lib/valoracion";
import { mockApi, resetMockDb } from "@/lib/api/mock";

const plantilla = readFileSync("public/plantillas/plantilla_valores_inventario.csv", "utf8");

describe("celdas numéricas", () => {
  it("entiende los formatos de pesos colombianos y rechaza lo ambiguo", () => {
    expect(enteroDeCelda("")).toBeNull();
    expect(enteroDeCelda("35000")).toBe(35000);
    expect(enteroDeCelda("1.250.000")).toBe(1250000);
    expect(enteroDeCelda("$ 1,250,000")).toBe(1250000);
    expect(Number.isNaN(enteroDeCelda("12,5") ?? 0)).toBe(true);
    expect(Number.isNaN(enteroDeCelda("abc") ?? 0)).toBe(true);
  });
});

describe("plantilla de valores del encargo", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMockDb();
  });
  it("trae las 150 referencias y 401 unidades", () => {
    const filas = parseCsvValores(plantilla);
    expect(filas).toHaveLength(150);
    expect(filas.reduce((a, f) => a + f.cantidad_inicial, 0)).toBe(401);
  });
  it("aplica limpia sobre la semilla: ninguna fila con error y sin diferencias (aún sin valores)", async () => {
    const [items, movs, cfg] = await Promise.all([
      mockApi.inventario.listItems(),
      mockApi.inventario.listMovimientos(),
      mockApi.configuracion.get(),
    ]);
    const prev = previsualizarValores(items, movs, parseCsvValores(plantilla), cfg.inventario);
    expect(prev).toHaveLength(150);
    expect(prev.filter((p) => p.error)).toEqual([]);
    expect(prev.filter((p) => p.cambios.length > 0)).toEqual([]);
  });
  it("rellenada con valores, importa las 150 filas de una vez y las valora", async () => {
    const filas = parseCsvValores(plantilla).map((f) => ({
      ...f,
      anioCompra: 2025,
      valorUnitario: 10_000,
    }));
    const r = await mockApi.inventario.importarValores(filas);
    expect(r.aplicadas).toBe(150);
    const items = await mockApi.inventario.listItems();
    expect(items.every((i) => i.valorUnitario === 10_000 && i.anioCompra === 2025)).toBe(true);
  });
  it("un encabezado incompleto se rechaza con la lista de columnas que faltan", () => {
    expect(() => parseCsvValores("sku,descripcion\nSEN-001,x")).toThrow(/Faltan columnas/);
  });
});
