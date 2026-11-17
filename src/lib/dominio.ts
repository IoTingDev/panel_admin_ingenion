import type {
  EstadoProyecto,
  EstadoTrabajo,
  TipoCliente,
  TipoTrabajo,
  TrabajoTecnico,
} from "@/lib/api/types";

export const ESTADOS_PROYECTO: EstadoProyecto[] = [
  "en_desarrollo",
  "activo",
  "pausado",
  "finalizado",
  "baja",
];
/** Columnas del tablero (la baja no es columna). */
export const COLUMNAS_PROYECTO: EstadoProyecto[] = [
  "en_desarrollo",
  "activo",
  "pausado",
  "finalizado",
];
export const ROTULO_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  en_desarrollo: "En desarrollo",
  activo: "En operación",
  pausado: "Pausado",
  finalizado: "Finalizado",
  baja: "Baja",
};

export const TIPOS_TRABAJO: TipoTrabajo[] = [
  "cctv",
  "alarmas",
  "telecom",
  "mantenimiento",
  "instalacion",
  "otro",
];
export const ROTULO_TIPO_TRABAJO: Record<TipoTrabajo, string> = {
  cctv: "CCTV",
  alarmas: "Alarmas",
  telecom: "Telecomunicaciones",
  mantenimiento: "Mantenimiento",
  instalacion: "Instalación",
  otro: "Otro",
};
export const ESTADOS_TRABAJO: EstadoTrabajo[] = [
  "programado",
  "en_curso",
  "completado",
  "cancelado",
];
export const ROTULO_ESTADO_TRABAJO: Record<EstadoTrabajo, string> = {
  programado: "Programado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
};

export const TIPOS_CLIENTE: { value: TipoCliente; label: string }[] = [
  { value: "empresa", label: "Empresa" },
  { value: "persona", label: "Persona" },
];

/** Sector que sustituye a «cacao», «café» y «mango» (panel v4). */
export const SECTOR_AGROINDUSTRIAL = "Agroindustrial";
/** Sectores retirados de las opciones; los registros que los usaban pasan a «Agroindustrial» (migración v3 → v4). */
export const SECTORES_RETIRADOS = ["cacao", "café", "mango"];

export const SECTORES_DEFECTO = [
  SECTOR_AGROINDUSTRIAL,
  "residencial",
  "comercial",
  "industrial",
  "institucional",
  "otro",
];

/** Un trabajo en estos estados ya no se reprograma ni consume material nuevo. */
export const TRABAJO_CERRADO: EstadoTrabajo[] = ["completado", "cancelado"];

/** Día (AAAA-MM-DD) de entrega de un servicio completado: su fecha de fin real. Sin ella, undefined. */
export const diaEntrega = (t: Pick<TrabajoTecnico, "estado" | "fechaFin">): string | undefined =>
  t.estado === "completado" && t.fechaFin ? t.fechaFin.slice(0, 10) : undefined;

/**
 * Orden por defecto de los servicios técnicos: del más reciente al más antiguo por fecha de entrega; sin
 * ella, por fecha programada; sin ninguna de las dos, al final y por código descendente.
 */
export function compararServicios(
  a: Pick<TrabajoTecnico, "codigo" | "estado" | "fechaFin" | "fechaProgramada">,
  b: Pick<TrabajoTecnico, "codigo" | "estado" | "fechaFin" | "fechaProgramada">,
): number {
  const clave = (x: typeof a) => diaEntrega(x) ?? x.fechaProgramada?.slice(0, 10);
  const ka = clave(a);
  const kb = clave(b);
  if (ka && kb && ka !== kb) return ka < kb ? 1 : -1;
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  return b.codigo.localeCompare(a.codigo, undefined, { numeric: true });
}
