import type { Cliente, MovimientoInventario, TipoTrabajo, TrabajoTecnico } from "@/lib/api/types";
import { diaEntrega } from "@/lib/dominio";

/**
 * Ingresos por servicios técnicos (gestión interna, NO contabilidad: la facturación vive en Alegra).
 * Todo se calcula al mostrar; nada se guarda. Ingreso = valor pactado del servicio. El costo es solo el de
 * los materiales que salieron del inventario hacia ese servicio (no incluye mano de obra ni desplazamientos).
 */
export type EstadoIngresos = "completados" | "pendientes" | "todos";

export interface FiltroIngresos {
  estado: EstadoIngresos;
  /** AAAA o "" (todos). Año de entrega (completados) o de la fecha programada (el resto). */
  anio: string;
}

export interface CifrasIngresos {
  servicios: number;
  /** Servicios con valor pactado (los únicos que suman ingresos). */
  conValor: number;
  ingresos: number;
  /** Ingresos / servicios con valor. null si no hay ninguno. */
  ticket: number | null;
  /** Costo de materiales registrado contra estos servicios. */
  materiales: number;
  /** Ingresos − materiales, solo de los servicios con valor. */
  margen: number;
  /** Margen / ingresos. null si no hay materiales registrados (no se inventa un 100 %). */
  margenPct: number | null;
}

export interface FilaTipo extends CifrasIngresos {
  tipo: TipoTrabajo;
  pctIngresos: number;
}
export interface FilaSector extends CifrasIngresos {
  sector: string;
  clientes: number;
  pctServicios: number;
  pctIngresos: number;
}
export interface ResumenIngresos extends CifrasIngresos {
  sinValor: number;
  /** Salidas de inventario hacia estos servicios que no tienen costo registrado. */
  salidasSinCosto: number;
  porTipo: FilaTipo[];
  porSector: FilaSector[];
  anios: string[];
}

const anioDe = (t: Pick<TrabajoTecnico, "estado" | "fechaFin" | "fechaProgramada">): string => {
  const d = diaEntrega(t) ?? t.fechaProgramada?.slice(0, 10);
  return d ? d.slice(0, 4) : "";
};

const incluye = (e: EstadoIngresos, t: Pick<TrabajoTecnico, "estado">) =>
  e === "completados"
    ? t.estado === "completado"
    : e === "pendientes"
      ? t.estado === "programado" || t.estado === "en_curso"
      : t.estado !== "cancelado";

interface Acum {
  servicios: number;
  conValor: number;
  ingresos: number;
  materiales: number;
  margen: number;
}
const vacio = (): Acum => ({ servicios: 0, conValor: 0, ingresos: 0, materiales: 0, margen: 0 });
const cifras = (a: Acum): CifrasIngresos => ({
  servicios: a.servicios,
  conValor: a.conValor,
  ingresos: a.ingresos,
  ticket: a.conValor > 0 ? a.ingresos / a.conValor : null,
  materiales: a.materiales,
  margen: a.margen,
  margenPct: a.materiales > 0 && a.ingresos > 0 ? (a.margen / a.ingresos) * 100 : null,
});

export function resumenIngresos(a: {
  trabajos: TrabajoTecnico[];
  clientes: Pick<Cliente, "id" | "sector">[];
  movs: MovimientoInventario[];
  filtro: FiltroIngresos;
}): ResumenIngresos {
  const sectorDe = new Map(a.clientes.map((c) => [c.id, c.sector]));
  // Costo de materiales por servicio: salidas del inventario cuyo destino es ese servicio.
  const material = new Map<string, number>();
  let salidasSinCosto = 0;
  const idsEnAlcance = new Set<string>();
  const enAlcance = a.trabajos.filter(
    (t) => incluye(a.filtro.estado, t) && (!a.filtro.anio || anioDe(t) === a.filtro.anio),
  );
  for (const t of enAlcance) idsEnAlcance.add(t.id);
  for (const m of a.movs) {
    if (m.tipo !== "Salida" || m.destinoTipo !== "trabajo" || !m.destinoId) continue;
    if (!idsEnAlcance.has(m.destinoId)) continue;
    if (m.costoAlSalir == null) salidasSinCosto++;
    material.set(
      m.destinoId,
      (material.get(m.destinoId) ?? 0) + m.cantidad * (m.costoAlSalir ?? 0),
    );
  }

  const total = vacio();
  const porTipo = new Map<TipoTrabajo, Acum>();
  const porSector = new Map<string, Acum & { ids: Set<string> }>();
  for (const t of enAlcance) {
    const valor = t.valorPactado;
    const mat = material.get(t.id) ?? 0;
    const sector = sectorDe.get(t.clienteId) ?? "Sin sector";
    const tipo = porTipo.get(t.tipo) ?? vacio();
    const sec = porSector.get(sector) ?? { ...vacio(), ids: new Set<string>() };
    for (const x of [total, tipo, sec]) {
      x.servicios++;
      if (typeof valor === "number") {
        x.conValor++;
        x.ingresos += valor;
        x.margen += valor - mat;
      }
      x.materiales += mat;
    }
    sec.ids.add(t.clienteId);
    porTipo.set(t.tipo, tipo);
    porSector.set(sector, sec);
  }

  const T = cifras(total);
  const anios = [
    ...new Set(
      a.trabajos
        .filter((t) => incluye(a.filtro.estado, t))
        .map(anioDe)
        .filter(Boolean),
    ),
  ].sort((x, y) => y.localeCompare(x));
  return {
    ...T,
    sinValor: total.servicios - total.conValor,
    salidasSinCosto,
    anios,
    porTipo: [...porTipo.entries()]
      .map(([tipo, x]) => ({
        tipo,
        ...cifras(x),
        pctIngresos: total.ingresos > 0 ? (x.ingresos / total.ingresos) * 100 : 0,
      }))
      .sort((p, q) => q.ingresos - p.ingresos || q.servicios - p.servicios),
    porSector: [...porSector.entries()]
      .map(([sector, x]) => ({
        sector,
        clientes: x.ids.size,
        ...cifras(x),
        pctServicios: total.servicios > 0 ? (x.servicios / total.servicios) * 100 : 0,
        pctIngresos: total.ingresos > 0 ? (x.ingresos / total.ingresos) * 100 : 0,
      }))
      .sort((p, q) => q.servicios - p.servicios || q.ingresos - p.ingresos),
  };
}
