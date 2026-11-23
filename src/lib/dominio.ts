import type {
  Cuota,
  EstadoProyecto,
  EstadoTrabajo,
  ModalidadSuscripcion,
  TipoCliente,
  TipoProyecto,
  TipoTrabajo,
  TrabajoTecnico,
  VinculoCliente,
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

/** Estados de un cliente o de un usuario del portal, tal como se guardan (se muestran capitalizados). */
export const ESTADOS_CLIENTE = ["activo", "suspendido", "baja"] as const;

/** Tipos de proyecto I+D+I (panel v4.2). Opcional: un proyecto sin tipo es válido. */
export const TIPOS_PROYECTO: TipoProyecto[] = ["software", "iot", "monitoreo", "automatizacion"];
export const ROTULO_TIPO_PROYECTO: Record<TipoProyecto, string> = {
  software: "Software",
  iot: "IoT",
  monitoreo: "Monitoreo",
  automatizacion: "Automatización",
};

/**
 * Un valor `null` en un cambio parcial LIMPIA el campo: JSON no transporta `undefined`, así que sin esto un campo
 * opcional ya guardado no se podría vaciar por la API. Devuelve una copia; no modifica `base`.
 */
export function fusionarParcial<T extends object>(base: T, cambios: object): T {
  const r = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(cambios)) {
    if (v === null) delete r[k];
    else r[k] = v;
  }
  return r as T;
}

/**
 * Al EDITAR, un campo vaciado debe viajar como `null` (JSON no transporta `undefined`): convierte los `undefined`
 * de un objeto de cambios en `null`. Solo para el camino de edición; al crear no se usa.
 */
export const limpiando = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? null : v])) as T;

/** Aplica en el sitio un cambio parcial con la misma semántica que `fusionarParcial`. */
export function aplicarParcial(destino: object, cambios: object): void {
  const d = destino as Record<string, unknown>;
  for (const [k, v] of Object.entries(cambios)) {
    if (v === null) delete d[k];
    else d[k] = v;
  }
}

/**
 * Unidades de medida del inventario. La cantidad es siempre un entero: lo que se consume por fracciones se registra
 * en una unidad menor (un rollo de filamento de 1 kg = 1000 g, con el valor unitario por gramo).
 */
export const UNIDADES_INVENTARIO: { value: string; label: string }[] = [
  { value: "und", label: "Unidades (und)" },
  { value: "g", label: "Gramos (g)" },
  { value: "kg", label: "Kilogramos (kg)" },
  { value: "m", label: "Metros (m)" },
  { value: "cm", label: "Centímetros (cm)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "l", label: "Litros (l)" },
];

/** Vínculo del cliente y modalidad de suscripción (ADR-0047). */
export const VINCULOS_CLIENTE: VinculoCliente[] = ["recurrente", "puntual"];
export const MODALIDADES: ModalidadSuscripcion[] = ["mensual", "anual"];

export const ROTULO_VINCULO: Record<VinculoCliente, string> = {
  recurrente: "Recurrente",
  puntual: "Puntual",
};
export const ROTULO_MODALIDAD: Record<ModalidadSuscripcion, string> = {
  mensual: "Mensual",
  anual: "Anual",
};

/**
 * Valida el plan de pagos (ADR-0047): cuotas numeradas 1..n, vencimientos válidos y no decrecientes,
 * valores enteros > 0 y **suma exacta = valor pactado** (la matemática justifica lo digitado).
 * Sin plan (undefined o vacío) es válido. Devuelve el mensaje de error o "".
 */
export function errorPlanPagos(
  plan: Cuota[] | undefined,
  valorPactado: number | undefined,
): string {
  if (plan === undefined || plan.length === 0) return "";
  if (plan.length > 120) return "Un plan admite como máximo 120 cuotas.";
  if (valorPactado === undefined || valorPactado <= 0)
    return "Para registrar un plan de pagos primero indique el valor pactado.";
  const fechaOk = (f: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`));
  let suma = 0;
  let previa = "";
  for (const [i, c] of plan.entries()) {
    if (c.numero !== i + 1) return `Las cuotas deben numerarse 1..${plan.length} en orden.`;
    if (!Number.isInteger(c.valor) || c.valor <= 0)
      return `La cuota ${c.numero} debe ser un entero COP > 0.`;
    if (!fechaOk(c.vence))
      return `La fecha de vencimiento de la cuota ${c.numero} debe ser AAAA-MM-DD.`;
    if (c.vence < previa) return `La cuota ${c.numero} vence antes que la anterior.`;
    if (c.pagadaEn !== undefined && !fechaOk(c.pagadaEn))
      return `La fecha de pago de la cuota ${c.numero} debe ser AAAA-MM-DD.`;
    previa = c.vence;
    suma += c.valor;
  }
  if (suma !== valorPactado)
    return `Las cuotas suman ${suma} y el valor pactado es ${valorPactado}: deben coincidir (rehaga el plan).`;
  return "";
}

/** Valida la suscripción y las horas de un proyecto o servicio. Devuelve el mensaje de error o "". */
export function errorSuscripcionYHoras(p: {
  modalidad?: string | undefined;
  valorRecurrente?: number | undefined;
  inicioSuscripcion?: string | undefined;
  minutosTrabajo?: number | undefined;
  valorHora?: number | undefined;
}): string {
  if (p.modalidad !== undefined && !(MODALIDADES as string[]).includes(p.modalidad))
    return `Modalidad inválida: «${p.modalidad}».`;
  const ent = (v: number | undefined) => v === undefined || (Number.isInteger(v) && v >= 0);
  if (!ent(p.valorRecurrente)) return "El valor recurrente debe ser un entero COP ≥ 0.";
  if (!ent(p.minutosTrabajo))
    return "Las horas de trabajo deben ser un número ≥ 0 (se guardan en minutos enteros).";
  if (!ent(p.valorHora)) return "El valor por hora debe ser un entero COP ≥ 0.";
  if (p.inicioSuscripcion !== undefined && !/^\d{4}-\d{2}-\d{2}/.test(p.inicioSuscripcion))
    return "La fecha de inicio de la suscripción debe ser AAAA-MM-DD.";
  if (
    p.modalidad === undefined &&
    (p.valorRecurrente !== undefined || p.inicioSuscripcion !== undefined)
  )
    return "Indique la modalidad (mensual o anual) para registrar un valor recurrente o un inicio de suscripción.";
  return "";
}

/** Roles de un usuario del portal del cliente, tal como se guardan (se muestran capitalizados). */
export const ROLES_USUARIO = ["administrador", "operador", "lectura"] as const;
