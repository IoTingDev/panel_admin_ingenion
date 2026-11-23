// Conversión entre el formulario de cobro (texto) y los campos de la API (ADR-0047).
import type { Cuota, EstadoTrabajo, ModalidadSuscripcion } from "@/lib/api/types";
import { minutosDeHoras } from "@/lib/desglose";
import { generarPlan } from "@/lib/pagos";
import { hoyBogota } from "@/lib/inventario";

/** Campos de cobro de un proyecto o servicio (ADR-0047), todos como texto de formulario. */
export interface CobroForm {
  modalidad: string;
  valorRecurrente: string;
  inicioSuscripcion: string;
  horas: string;
  valorHora: string;
  nCuotas: string;
  primeraCuota: string;
}

export const cobroVacio: CobroForm = {
  modalidad: "",
  valorRecurrente: "",
  inicioSuscripcion: "",
  horas: "",
  valorHora: "",
  nCuotas: "",
  primeraCuota: "",
};

interface ConCobro {
  modalidad?: ModalidadSuscripcion | undefined;
  valorRecurrente?: number | undefined;
  inicioSuscripcion?: string | undefined;
  minutosTrabajo?: number | undefined;
  valorHora?: number | undefined;
  planPagos?: Cuota[] | undefined;
}

export function cobroDeEntidad(e?: ConCobro): CobroForm {
  if (!e) return { ...cobroVacio };
  return {
    modalidad: e.modalidad ?? "",
    valorRecurrente: e.valorRecurrente === undefined ? "" : String(e.valorRecurrente),
    inicioSuscripcion: e.inicioSuscripcion?.slice(0, 10) ?? "",
    horas: e.minutosTrabajo === undefined ? "" : String(e.minutosTrabajo / 60),
    valorHora: e.valorHora === undefined ? "" : String(e.valorHora),
    nCuotas: e.planPagos && e.planPagos.length > 0 ? String(e.planPagos.length) : "",
    primeraCuota: e.planPagos?.[0]?.vence ?? "",
  };
}

const entero = (s: string, nombre: string): number | undefined => {
  if (s.trim() === "") return undefined;
  if (!/^\d+$/.test(s.trim())) throw new Error(`${nombre}: solo números enteros en pesos.`);
  return Number(s.trim());
};

/**
 * Convierte el formulario en campos de la API. Lanza con un mensaje claro si algo no es válido. El plan de pagos
 * se conserva tal cual (con sus cuotas pagadas) mientras no cambien el valor, el número de cuotas ni la primera
 * fecha; si cambian, se rehace y las fechas de pago se conservan por número de cuota.
 */
export function cobroAData(
  v: CobroForm,
  valorPactado: number | undefined,
  actual?: ConCobro,
): ConCobro {
  const modalidad = v.modalidad === "" ? undefined : (v.modalidad as ModalidadSuscripcion);
  const horas = v.horas.trim() === "" ? undefined : Number(v.horas.trim().replace(",", "."));
  if (horas !== undefined && (!Number.isFinite(horas) || horas < 0))
    throw new Error("Las horas de trabajo deben ser un número ≥ 0.");
  const n = v.nCuotas.trim() === "" ? undefined : Number(v.nCuotas.trim());
  if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 120))
    throw new Error("Las cuotas deben ser un entero de 1 a 120.");
  let planPagos: Cuota[] | undefined;
  if (n === undefined || n === 1) {
    planPagos = actual?.planPagos && actual.planPagos.length > 0 ? [] : undefined;
  } else {
    if (valorPactado === undefined)
      throw new Error("Para registrar un plan de pagos primero indique el valor pactado.");
    const primera = v.primeraCuota || hoyBogota();
    const ant = actual?.planPagos ?? [];
    const igual =
      ant.length === n &&
      ant[0]?.vence === primera &&
      ant.reduce((s, c) => s + c.valor, 0) === valorPactado;
    planPagos = igual
      ? ant
      : generarPlan(valorPactado, n, primera).map((c) => {
          const pagada = ant.find((a) => a.numero === c.numero)?.pagadaEn;
          return pagada ? { ...c, pagadaEn: pagada } : c;
        });
  }
  return {
    modalidad,
    valorRecurrente: modalidad ? entero(v.valorRecurrente, "Valor recurrente") : undefined,
    inicioSuscripcion: modalidad && v.inicioSuscripcion ? v.inicioSuscripcion : undefined,
    minutosTrabajo: horas === undefined ? undefined : minutosDeHoras(horas),
    valorHora: entero(v.valorHora, "Valor por hora"),
    planPagos,
  };
}

/**
 * Etiqueta de operación bajo suscripción (ADR-0047): «Mensualidad activa» o «Anualidad activa» solo si hay
 * modalidad Y el proyecto está en operación (o el servicio en curso). Sin suscripción o sin operar, null.
 */
export function rotuloSuscripcion(
  modalidad: ModalidadSuscripcion | undefined,
  enOperacion: boolean,
): string | null {
  if (!modalidad || !enOperacion) return null;
  return modalidad === "mensual" ? "Mensualidad activa" : "Anualidad activa";
}

export interface SuscripcionActiva {
  modalidad?: ModalidadSuscripcion | undefined;
  valorRecurrente?: number | undefined;
  /** Proyecto en operación o servicio en curso. */
  activa: boolean;
}

/**
 * Ingreso recurrente de las suscripciones que corren hoy: equivalente mensual y anual. Una mensualidad vale
 * v al mes y 12v al año; una anualidad, v al año y round(v / 12) al mes. Sin valor recurrente no suma.
 */
export function ingresoRecurrente(items: readonly SuscripcionActiva[]): {
  activas: number;
  mensual: number;
  anual: number;
} {
  let activas = 0;
  let mensual = 0;
  let anual = 0;
  for (const s of items) {
    if (!s.activa || !s.modalidad || s.valorRecurrente === undefined) continue;
    activas++;
    if (s.modalidad === "mensual") {
      mensual += s.valorRecurrente;
      anual += s.valorRecurrente * 12;
    } else {
      anual += s.valorRecurrente;
      mensual += Math.round(s.valorRecurrente / 12);
    }
  }
  return { activas, mensual, anual };
}

/**
 * Un servicio técnico por suscripción sigue corriendo aunque figure «completado» (el trabajo inicial se entregó,
 * la mensualidad o anualidad continúa): cuenta como activo en curso y completado; programado (aún no empieza) y
 * cancelado, no.
 */
export const servicioSuscripcionActiva = (estado: EstadoTrabajo): boolean =>
  estado === "en_curso" || estado === "completado";
