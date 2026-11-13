import type {
  ConfigInventario,
  GrupoInventario,
  ItemInventario,
  MovimientoInventario,
  NuevoMovimiento,
} from "@/lib/api/types";
import { CONFIG_INVENTARIO_DEFECTO, GRUPOS } from "@/lib/config-inventario";

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
  items: Pick<ItemInventario, "sku" | "cantidad_inicial">[],
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

/** Prefijo de un SKU ("SEN-012" → "SEN"). */
export const prefijoDeSku = (sku: string) => sku.slice(0, sku.indexOf("-"));
const numeroDeSku = (sku: string) => Number.parseInt(sku.slice(sku.indexOf("-") + 1), 10) || 0;

/** Siguiente SKU a partir de lo existente (función pura; el contador real es `Secuencias`). */
export function siguienteSku(
  categoria: string,
  items: Pick<ItemInventario, "sku">[],
  prefijos: Record<string, string> = CONFIG_INVENTARIO_DEFECTO.prefijos,
): string {
  const prefijo = prefijos[categoria];
  if (!prefijo) throw new Error(`Categoría sin prefijo: ${categoria}`);
  const max = items
    .filter((i) => i.sku.startsWith(`${prefijo}-`))
    .reduce((m, i) => Math.max(m, numeroDeSku(i.sku)), 0);
  return `${prefijo}-${String(max + 1).padStart(3, "0")}`;
}

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
export function reservarSku(
  categoria: string,
  secuencias: Secuencias,
  prefijos: Record<string, string>,
): string {
  const prefijo = prefijos[categoria];
  if (!prefijo) throw new Error(`Categoría sin prefijo: ${categoria}`);
  const n = (secuencias[prefijo] ?? 0) + 1;
  secuencias[prefijo] = n;
  return `${prefijo}-${String(n).padStart(3, "0")}`;
}

/** Valida que una salida no deje stock negativo. Devuelve mensaje de error o null. */
export function validarSalida(stock: number, cantidad: number): string | null {
  if (cantidad > stock) {
    return `Stock insuficiente: hay ${stock} und y se intenta sacar ${cantidad}.`;
  }
  return null;
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
  const stocks = stockMap(items, movs);
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

/** «Hoy» como AAAA-MM-DD en la zona horaria del negocio (América/Bogotá). */
export const hoyBogota = (ahora = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);

/**
 * Normaliza la fecha de un movimiento a ISO. Solo fecha (AAAA-MM-DD) → mediodía UTC de ese día.
 * Devuelve error si es inválida o futura (el pasado se permite).
 */
export function normalizarFecha(
  fecha: string | undefined,
  ahora = new Date(),
): { iso: string; error: "" } | { iso: ""; error: string } {
  if (!fecha) return { iso: ahora.toISOString(), error: "" };
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  const t = Date.parse(soloDia ? `${fecha}T12:00:00.000Z` : fecha);
  if (Number.isNaN(t)) return { iso: "", error: "Fecha inválida." };
  const futura = soloDia ? fecha > hoyBogota(ahora) : t > ahora.getTime() + 60_000;
  if (futura) return { iso: "", error: "La fecha no puede ser futura." };
  return { iso: new Date(t).toISOString(), error: "" };
}

/** Errores de los campos de un movimiento, sin mirar el stock. "" si está bien. */
export function errorCamposMovimiento(
  m: NuevoMovimiento,
  existeDestino: (tipo: "proyecto" | "trabajo", id: string) => boolean,
  ahora = new Date(),
): string {
  const f = normalizarFecha(m.fecha, ahora);
  if (f.error) return f.error;
  if (m.costoUnitario !== undefined) {
    if (m.tipo !== "Entrada") return "El costo unitario solo aplica a entradas (compras).";
    if (!Number.isInteger(m.costoUnitario) || m.costoUnitario < 0)
      return "Costo unitario inválido (entero COP ≥ 0).";
  }
  if (m.destinoTipo || m.destinoId) {
    if (m.tipo !== "Salida") return "El destino solo aplica a salidas.";
    if (!m.destinoTipo || !m.destinoId || !existeDestino(m.destinoTipo, m.destinoId))
      return "El destino indicado no existe.";
  }
  return "";
}

/** Errores de los campos editables de un ítem. "" si está bien. */
export function errorCamposItem(
  data: Partial<ItemInventario>,
  actual: Pick<ItemInventario, "grupo" | "categoria"> | undefined,
  cfg: ConfigInventario,
  anioActual = new Date().getFullYear(),
): string {
  const grupo = data.grupo ?? actual?.grupo;
  const categoria = data.categoria ?? actual?.categoria;
  if (data.grupo !== undefined && !GRUPOS.includes(data.grupo as GrupoInventario))
    return `Grupo inválido: «${String(data.grupo)}».`;
  if ((data.grupo !== undefined || data.categoria !== undefined) && grupo && categoria) {
    if (!cfg.categorias[grupo].includes(categoria))
      return `La categoría «${categoria}» no pertenece al grupo ${grupo}.`;
  }
  const a = data.anioCompra;
  if (a != null && (!Number.isInteger(a) || a < 1990 || a > anioActual))
    return `Año de compra inválido (1990..${anioActual}).`;
  const v = data.valorUnitario;
  if (v != null && (!Number.isInteger(v) || v < 0))
    return "Valor unitario inválido (entero COP ≥ 0).";
  const vida = data.vidaUtilAnios;
  if (vida != null && (!Number.isFinite(vida) || vida <= 0))
    return "Vida útil inválida (años > 0).";
  if (
    data.cantidad_inicial !== undefined &&
    (!Number.isInteger(data.cantidad_inicial) || data.cantidad_inicial < 0)
  )
    return "Cantidad inicial inválida (entero ≥ 0).";
  return "";
}
