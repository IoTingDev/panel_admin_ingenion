import { describe, expect, it } from "vitest";
import { derivarAvisos } from "@/lib/avisos";
import type { ItemInventario } from "@/lib/api/types";

const item = (
  sku: string,
  ini: number,
  min: number | null,
  estado: ItemInventario["estado"] = "Disponible",
): ItemInventario => ({
  sku,
  categoria: "x",
  subcategoria: "x",
  descripcion: sku,
  marca_referencia: "",
  cantidad_inicial: ini,
  unidad: "und",
  estado,
  ubicacion: "",
  stock_minimo: min,
  notas: "",
});

describe("avisos del encabezado", () => {
  it("sin datos que avisar no hay avisos", () => {
    expect(derivarAvisos({ proyectos: [], clientes: [], items: [], movimientos: [] })).toEqual([]);
  });
  it("cuenta lo real y concuerda el plural", () => {
    const a = derivarAvisos({
      proyectos: [{ estado: "pausado" }, { estado: "pausado" }, { estado: "activo" }],
      clientes: [{ estado: "suspendido" }, { estado: "activo" }],
      items: [],
      movimientos: [],
    });
    expect(a.map((x) => x.texto)).toEqual(["2 proyectos pausados", "1 cliente suspendido"]);
  });
  it("el stock bajo usa el stock calculado y excluye los ítems de baja", () => {
    const a = derivarAvisos({
      proyectos: [],
      clientes: [],
      items: [item("A-1", 5, 2), item("A-2", 5, 2), item("A-3", 0, 1, "Baja")],
      movimientos: [{ id: "m", fecha: "", sku: "A-1", tipo: "Salida", cantidad: 3 }],
    });
    expect(a.map((x) => x.texto)).toEqual(["1 ítem bajo el mínimo"]);
  });
});

import { iniciales, nombreCorto } from "@/lib/format";
describe("identidad del encabezado", () => {
  it("iniciales: primer y último nombre", () => {
    expect(iniciales("Juan Camilo Velásquez")).toBe("JV");
    expect(iniciales("Ana Prueba")).toBe("AP");
    expect(iniciales("Ana")).toBe("A");
    expect(iniciales(undefined)).toBe("—");
  });
  it("nombre corto: dos primeras palabras", () => {
    expect(nombreCorto("Juan Camilo Velásquez")).toBe("Juan Camilo");
  });
});
