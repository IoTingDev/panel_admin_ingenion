import type { GrupoInventario, ItemInventario, MovimientoInventario } from "@/lib/api/types";

export const PREFIJOS: Record<string, string> = {
  Instrumentación: "SEN",
  "Potencia y actuadores": "POT",
  Comunicación: "COM",
  Pantallas: "DSP",
  "SBC y cámaras": "SBC",
  Microcontroladores: "MCU",
  "Herramientas eléctricas y brocas": "HER",
  Cableado: "CAB",
  "Herramientas de mano": "MAN",
  Equipos: "EQP",
};

export const GRUPO_POR_PREFIJO: Record<string, GrupoInventario> = {
  SEN: "componentes",
  POT: "componentes",
  COM: "componentes",
  DSP: "componentes",
  SBC: "componentes",
  MCU: "componentes",
  HER: "herramientas",
  CAB: "herramientas",
  MAN: "herramientas",
  EQP: "equipos",
};

export const CATEGORIAS_POR_GRUPO: Record<GrupoInventario, string[]> = {
  componentes: [
    "Instrumentación",
    "Potencia y actuadores",
    "Comunicación",
    "Pantallas",
    "SBC y cámaras",
    "Microcontroladores",
  ],
  herramientas: ["Herramientas eléctricas y brocas", "Cableado", "Herramientas de mano"],
  equipos: ["Equipos"],
};

export function grupoDeSku(sku: string): GrupoInventario {
  return GRUPO_POR_PREFIJO[sku.slice(0, 3)] ?? "componentes";
}

/** stockActual = cantidad_inicial + Σ entradas − Σ salidas. Nunca se guarda. */
export function stockActual(
  item: Pick<ItemInventario, "sku" | "cantidad_inicial">,
  movs: MovimientoInventario[],
): number {
  return movs.reduce((acc, m) => {
    if (m.sku !== item.sku) return acc;
    return m.tipo === "Entrada" ? acc + m.cantidad : acc - m.cantidad;
  }, item.cantidad_inicial);
}

export function stockMap(
  items: ItemInventario[],
  movs: MovimientoInventario[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.sku, i.cantidad_inicial);
  for (const m of movs) {
    const cur = map.get(m.sku);
    if (cur === undefined) continue;
    map.set(m.sku, m.tipo === "Entrada" ? cur + m.cantidad : cur - m.cantidad);
  }
  return map;
}

export function esStockBajo(stock: number, minimo: number | null): boolean {
  return minimo !== null && stock <= minimo;
}

/** Siguiente SKU: prefijo de la categoría + consecutivo de tres cifras. */
export function siguienteSku(categoria: string, items: Pick<ItemInventario, "sku">[]): string {
  const prefijo = PREFIJOS[categoria];
  if (!prefijo) throw new Error(`Categoría sin prefijo: ${categoria}`);
  const max = items
    .filter((i) => i.sku.startsWith(`${prefijo}-`))
    .reduce((m, i) => Math.max(m, Number.parseInt(i.sku.slice(4), 10) || 0), 0);
  return `${prefijo}-${String(max + 1).padStart(3, "0")}`;
}

/** Valida que una salida no deje stock negativo. Devuelve mensaje de error o null. */
export function validarSalida(stock: number, cantidad: number): string | null {
  if (cantidad > stock) {
    return `Stock insuficiente: hay ${stock} und y se intenta sacar ${cantidad}.`;
  }
  return null;
}

/** Prefijo de un SKU ("SEN-012" → "SEN"). */
export const prefijoDeSku = (sku: string) => sku.slice(0, sku.indexOf("-"));
const numeroDeSku = (sku: string) => Number.parseInt(sku.slice(sku.indexOf("-") + 1), 10) || 0;

export type Secuencias = Record<string, number>;

/**
 * Contador por prefijo que nunca decrece. Se siembra con el máximo de los ítems Y de los
 * movimientos: un SKU eliminado que dejó movimientos huérfanos sigue "ocupado".
 */
export function inicializarSecuencias(
  items: Pick<ItemInventario, "sku">[],
  movs: Pick<MovimientoInventario, "sku">[],
): Secuencias {
  const seq: Secuencias = {};
  for (const { sku } of [...items, ...movs]) {
    if (!sku.includes("-")) continue;
    const p = prefijoDeSku(sku);
    seq[p] = Math.max(seq[p] ?? 0, numeroDeSku(sku));
  }
  return seq;
}

/** Reserva el siguiente SKU de la categoría y avanza el contador (muta `secuencias`). */
export function reservarSku(categoria: string, secuencias: Secuencias): string {
  const prefijo = PREFIJOS[categoria];
  if (!prefijo) throw new Error(`Categoría sin prefijo: ${categoria}`);
  const n = (secuencias[prefijo] ?? 0) + 1;
  secuencias[prefijo] = n;
  return `${prefijo}-${String(n).padStart(3, "0")}`;
}

export interface FilaLote {
  sku: string;
  tipo: "Entrada" | "Salida";
  cantidad: number;
}

/** Valida un lote completo con stock acumulado fila a fila. Devuelve errores por fila (1-based). */
export function validarLote(
  items: Pick<ItemInventario, "sku" | "cantidad_inicial">[],
  movs: MovimientoInventario[],
  filas: FilaLote[],
): { fila: number; error: string }[] {
  const stocks = stockMap(items as ItemInventario[], movs);
  const errores: { fila: number; error: string }[] = [];
  filas.forEach((f, i) => {
    const fila = i + 1;
    const actual = stocks.get(f.sku);
    if (actual === undefined)
      return void errores.push({ fila, error: `SKU inexistente: ${f.sku}` });
    if (!Number.isInteger(f.cantidad) || f.cantidad <= 0)
      return void errores.push({ fila, error: "La cantidad debe ser un entero mayor que 0." });
    if (f.tipo === "Salida") {
      const err = validarSalida(actual, f.cantidad);
      if (err) return void errores.push({ fila, error: err });
    }
    stocks.set(f.sku, actual + (f.tipo === "Entrada" ? f.cantidad : -f.cantidad));
  });
  return errores;
}
