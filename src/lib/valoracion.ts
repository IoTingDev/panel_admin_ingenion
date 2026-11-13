import type {
  ConfigInventario,
  FilaValores,
  GrupoInventario,
  ItemInventario,
  MovimientoInventario,
  ParametrosDepreciacion,
} from "@/lib/api/types";
import { GRUPOS, grupoDeCategoria } from "@/lib/config-inventario";
import { stockMap } from "@/lib/inventario";

export type { ParametrosDepreciacion };

/** Existencia a costo = stock × valor unitario. null si el ítem no tiene valor. */
export function valorExistencia(item: Pick<ItemInventario, "valorUnitario">, stock: number) {
  return item.valorUnitario == null ? null : stock * item.valorUnitario;
}

export function vidaUtil(
  item: Pick<ItemInventario, "grupo" | "vidaUtilAnios">,
  p: ParametrosDepreciacion,
): number | null {
  return item.vidaUtilAnios ?? p.aniosPorGrupo[item.grupo] ?? null;
}

/**
 * Fracción del valor que se conserva: max(residual, 1 − edad/vida). 1 si no se deprecia
 * (grupo sin vida útil, o sin año de compra: no se inventa una edad).
 */
export function factorDepreciacion(
  item: Pick<ItemInventario, "grupo" | "vidaUtilAnios" | "anioCompra">,
  anioActual: number,
  p: ParametrosDepreciacion,
): number {
  const vida = vidaUtil(item, p);
  if (vida === null || item.anioCompra == null) return 1;
  const edad = Math.max(0, anioActual - item.anioCompra);
  return Math.max(p.residualPct / 100, 1 - edad / vida);
}

export function valorEstimado(
  item: Pick<ItemInventario, "grupo" | "vidaUtilAnios" | "anioCompra" | "valorUnitario">,
  stock: number,
  anioActual: number,
  p: ParametrosDepreciacion,
): number | null {
  if (item.valorUnitario == null) return null;
  return Math.round(stock * item.valorUnitario * factorDepreciacion(item, anioActual, p));
}

/** Compras de un ítem con costo (entradas). */
const comprasConCosto = (sku: string, movs: MovimientoInventario[]) =>
  movs.filter((m) => m.sku === sku && m.tipo === "Entrada" && m.costoUnitario != null);

/**
 * Invertido = cantidad inicial × costo inicial + Σ (entrada × costo). Incluye lo ya consumido.
 * null si el ítem no tiene nada costeado.
 */
export function invertidoItem(
  item: Pick<ItemInventario, "sku" | "cantidad_inicial" | "costoInicial">,
  movs: MovimientoInventario[],
): number | null {
  const compras = comprasConCosto(item.sku, movs);
  if (item.costoInicial == null && compras.length === 0) return null;
  const inicial = item.costoInicial == null ? 0 : item.cantidad_inicial * item.costoInicial;
  return inicial + compras.reduce((a, m) => a + m.cantidad * (m.costoUnitario ?? 0), 0);
}

export interface FiltrosValor {
  grupo?: GrupoInventario | undefined;
  categoria?: string | undefined;
  anio?: number | undefined;
}
interface CifrasGrupo {
  existencia: number;
  estimado: number;
  invertido: number;
}
export interface ResumenValor {
  invertido: number;
  existencia: number;
  estimado: number;
  conValor: number;
  sinValor: number;
  porGrupo: Record<GrupoInventario, CifrasGrupo>;
  invertidoPorAnio: { anio: string; valor: number }[];
  top10: { sku: string; descripcion: string; valor: number }[];
}

/** Las tres cifras del panel «Valor del inventario». Todo calculado, nada guardado. */
export function resumenValor(a: {
  items: ItemInventario[];
  movs: MovimientoInventario[];
  params: ParametrosDepreciacion;
  anioActual: number;
  filtros?: FiltrosValor | undefined;
}): ResumenValor {
  const f = a.filtros ?? {};
  const items = a.items.filter(
    (i) =>
      i.estado !== "Baja" &&
      (!f.grupo || i.grupo === f.grupo) &&
      (!f.categoria || i.categoria === f.categoria) &&
      (f.anio === undefined || i.anioCompra === f.anio),
  );
  const stocks = stockMap(items, a.movs);
  const r: ResumenValor = {
    invertido: 0,
    existencia: 0,
    estimado: 0,
    conValor: 0,
    sinValor: 0,
    porGrupo: Object.fromEntries(
      GRUPOS.map((g) => [g, { existencia: 0, estimado: 0, invertido: 0 }]),
    ) as Record<GrupoInventario, CifrasGrupo>,
    invertidoPorAnio: [],
    top10: [],
  };
  const porAnio = new Map<string, number>();
  const suma = (anio: string, v: number) => porAnio.set(anio, (porAnio.get(anio) ?? 0) + v);
  const valorados: ResumenValor["top10"] = [];
  for (const i of items) {
    const stock = stocks.get(i.sku) ?? 0;
    const exi = valorExistencia(i, stock);
    if (exi === null) r.sinValor++;
    else {
      const est = valorEstimado(i, stock, a.anioActual, a.params) ?? 0;
      r.conValor++;
      r.existencia += exi;
      r.estimado += est;
      r.porGrupo[i.grupo].existencia += exi;
      r.porGrupo[i.grupo].estimado += est;
      valorados.push({ sku: i.sku, descripcion: i.descripcion, valor: exi });
    }
    const inv = invertidoItem(i, a.movs);
    if (inv !== null) {
      r.invertido += inv;
      r.porGrupo[i.grupo].invertido += inv;
      if (i.costoInicial != null)
        suma(
          i.anioCompra == null ? "Sin año" : String(i.anioCompra),
          i.cantidad_inicial * i.costoInicial,
        );
      for (const m of comprasConCosto(i.sku, a.movs))
        suma(String(new Date(m.fecha).getFullYear()), m.cantidad * (m.costoUnitario ?? 0));
    }
  }
  r.invertidoPorAnio = [...porAnio.entries()]
    .map(([anio, valor]) => ({ anio, valor }))
    .sort((x, y) =>
      x.anio === "Sin año" ? 1 : y.anio === "Sin año" ? -1 : x.anio.localeCompare(y.anio),
    );
  r.top10 = valorados.sort((x, y) => y.valor - x.valor).slice(0, 10);
  return r;
}

/** ¿El ítem tiene entradas con costo? (entonces `costoInicial` ya no se toca al editar el valor). */
export const tieneCompras = (sku: string, movs: MovimientoInventario[]) =>
  comprasConCosto(sku, movs).length > 0;

/** Costo promedio ponderado tras una compra: (stock·valor + cantidad·costo) / (stock + cantidad). */
export function promedioPonderado(
  stock: number,
  valorActual: number | null | undefined,
  cantidad: number,
  costo: number,
): number {
  if (valorActual == null || stock <= 0) return costo;
  return Math.round((stock * valorActual + cantidad * costo) / (stock + cantidad));
}

export interface CambioValor {
  campo: string;
  antes: unknown;
  despues: unknown;
}
export interface FilaPrevia {
  fila: number;
  sku: string;
  data: FilaValores;
  cambios: CambioValor[];
  error: string;
  /** Aviso no bloqueante (p. ej. el CSV traía un grupo que ya no existe). */
  aviso?: string | undefined;
}

/** Valida cada fila de la plantilla y calcula las diferencias; la importación aplica exactamente esto. */
export function previsualizarValores(
  items: ItemInventario[],
  movs: MovimientoInventario[],
  filas: FilaValores[],
  cfg: ConfigInventario,
  anioActual = new Date().getFullYear(),
): FilaPrevia[] {
  const porSku = new Map(items.map((i) => [i.sku, i]));
  const stocks = stockMap(items, movs);
  const vistos = new Set<string>();
  return filas.map((data, idx) => {
    const fila = idx + 1;
    const it = porSku.get(data.sku);
    const cambios: CambioValor[] = [];
    const out = (error: string): FilaPrevia => ({
      fila,
      sku: data.sku,
      data,
      cambios,
      error,
      aviso: data.aviso,
    });
    if (!it) return out(`SKU inexistente: ${data.sku}`);
    if (vistos.has(data.sku)) return out(`SKU repetido en el lote: ${data.sku}`);
    vistos.add(data.sku);
    if (!GRUPOS.includes(data.grupo)) return out(`Grupo inválido: «${String(data.grupo)}»`);
    if (!cfg.categorias[data.grupo].includes(data.categoria))
      return out(`La categoría «${data.categoria}» no pertenece al grupo ${data.grupo}.`);
    if (!Number.isInteger(data.cantidad_inicial) || data.cantidad_inicial < 0)
      return out("Cantidad inicial inválida (entero ≥ 0).");
    const consumo = (stocks.get(it.sku) ?? 0) - it.cantidad_inicial;
    if (data.cantidad_inicial + consumo < 0)
      return out(
        `Esa cantidad inicial dejaría el stock negativo (${data.cantidad_inicial + consumo}).`,
      );
    if (
      data.anioCompra !== null &&
      (!Number.isInteger(data.anioCompra) || data.anioCompra < 1990 || data.anioCompra > anioActual)
    )
      return out(`Año de compra inválido (1990..${anioActual}).`);
    if (
      data.valorUnitario !== null &&
      (!Number.isInteger(data.valorUnitario) || data.valorUnitario < 0)
    )
      return out("Valor unitario inválido (entero COP ≥ 0).");
    const dif = (campo: string, antes: unknown, despues: unknown) => {
      if ((antes ?? null) !== (despues ?? null))
        cambios.push({ campo, antes: antes ?? null, despues });
    };
    dif("grupo", it.grupo, data.grupo);
    dif("categoria", it.categoria, data.categoria);
    dif("cantidad_inicial", it.cantidad_inicial, data.cantidad_inicial);
    if (data.anioCompra !== null) dif("anioCompra", it.anioCompra, data.anioCompra);
    if (data.valorUnitario !== null) dif("valorUnitario", it.valorUnitario, data.valorUnitario);
    return out("");
  });
}

export { grupoDeCategoria };

export interface DetalleValor {
  sku: string;
  descripcion: string;
  grupo: GrupoInventario;
  categoria: string;
  anioCompra: number | null;
  stock: number;
  valorUnitario: number | null;
  existencia: number | null;
  estimado: number | null;
  invertido: number | null;
}

/** Una fila por ítem (sin los dados de baja) con las cifras calculadas, para tabla y exportación. */
export function detalleValor(a: {
  items: ItemInventario[];
  movs: MovimientoInventario[];
  params: ParametrosDepreciacion;
  anioActual: number;
  filtros?: FiltrosValor | undefined;
}): DetalleValor[] {
  const f = a.filtros ?? {};
  const items = a.items.filter(
    (i) =>
      i.estado !== "Baja" &&
      (!f.grupo || i.grupo === f.grupo) &&
      (!f.categoria || i.categoria === f.categoria) &&
      (f.anio === undefined || i.anioCompra === f.anio),
  );
  const stocks = stockMap(items, a.movs);
  return items.map((i) => {
    const stock = stocks.get(i.sku) ?? 0;
    return {
      sku: i.sku,
      descripcion: i.descripcion,
      grupo: i.grupo,
      categoria: i.categoria,
      anioCompra: i.anioCompra ?? null,
      stock,
      valorUnitario: i.valorUnitario ?? null,
      existencia: valorExistencia(i, stock),
      estimado: valorEstimado(i, stock, a.anioActual, a.params),
      invertido: invertidoItem(i, a.movs),
    };
  });
}
