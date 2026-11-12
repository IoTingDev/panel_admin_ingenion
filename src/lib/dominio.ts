import type { EstadoProyecto, EstadoTrabajo, TipoCliente, TipoTrabajo } from "@/lib/api/types";

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

export const SECTORES_DEFECTO = [
  "cacao",
  "café",
  "mango",
  "residencial",
  "comercial",
  "industrial",
  "institucional",
  "otro",
];

/** Un trabajo en estos estados ya no se reprograma ni consume material nuevo. */
export const TRABAJO_CERRADO: EstadoTrabajo[] = ["completado", "cancelado"];
