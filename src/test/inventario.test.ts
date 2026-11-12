import { describe, expect, it } from "vitest";
import { stockActual, siguienteSku, validarSalida, esStockBajo } from "@/lib/inventario";
import { validateCsv } from "@/lib/import-movements";
import type { ItemInventario, MovimientoInventario } from "@/lib/api/types";

const item = (
  sku: string,
  cantidad_inicial: number,
  stock_minimo: number | null = null,
): ItemInventario => ({
  sku,
  categoria: "Instrumentación",
  subcategoria: "Nivel",
  descripcion: sku,
  marca_referencia: "X",
  cantidad_inicial,
  unidad: "und",
  estado: "Disponible",
  ubicacion: "",
  stock_minimo,
  notas: "",
});
const mov = (sku: string, tipo: "Entrada" | "Salida", cantidad: number): MovimientoInventario => ({
  id: "m",
  fecha: "2026-01-01T00:00:00Z",
  sku,
  tipo,
  cantidad,
});

describe("Regla de stock", () => {
  it("stockActual = cantidad_inicial + entradas - salidas", () => {
    expect(
      stockActual(item("SEN-001", 4), [mov("SEN-001", "Salida", 2), mov("SEN-001", "Entrada", 3)]),
    ).toBe(5);
  });
  it("nunca permite stock negativo", () => {
    expect(validarSalida(4, 5)).toMatch("Stock insuficiente");
    expect(validarSalida(4, 4)).toBeNull();
  });
  it("stock bajo solo con mínimo definido", () => {
    expect(esStockBajo(0, null)).toBe(false);
    expect(esStockBajo(2, 2)).toBe(true);
  });
  it("siguienteSku usa prefijo y consecutivo de tres cifras", () => {
    expect(siguienteSku("Instrumentación", [item("SEN-046", 1)])).toBe("SEN-047");
  });
});
describe("Importación CSV", () => {
  const items = [item("SEN-001", 4)];
  it("rechaza SKU inexistente y stock insuficiente", () => {
    const rows = validateCsv(
      "fecha,sku,tipo,cantidad,proyecto,nota\n2026-01-01,NOPE,Salida,1,,\n2026-01-01,SEN-001,Salida,9,,",
      items,
      [],
    );
    expect(rows[0]?.error).toBe("SKU inexistente");
    expect(rows[1]?.error).toContain("Stock insuficiente");
  });
});
