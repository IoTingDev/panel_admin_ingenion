// Vínculo comercial del cliente (ADR-0047): la sugerencia es DERIVADA y solo se muestra; nunca se guarda
// sin que el operador la confirme.
import type { Cliente, Proyecto, TrabajoTecnico } from "@/lib/api/types";
import { sumarMeses } from "@/lib/pagos";

const ABIERTOS_PROYECTO = ["en_desarrollo", "activo", "pausado"];
const ABIERTOS_TRABAJO = ["programado", "en_curso"];

/** Última fecha (AAAA-MM-DD) con actividad registrada del cliente; la de alta si no hay otra. */
export function ultimaActividad(
  c: Pick<Cliente, "id" | "creadoEn">,
  trabajos: readonly Pick<
    TrabajoTecnico,
    "clienteId" | "fechaFin" | "fechaInicio" | "fechaProgramada" | "registradoEn"
  >[],
  proyectos: readonly Pick<Proyecto, "clienteId" | "fechaFin" | "fechaInicio" | "registradoEn">[],
): string {
  const fechas = [
    c.creadoEn,
    ...trabajos
      .filter((t) => t.clienteId === c.id)
      .flatMap((t) => [t.fechaFin, t.fechaInicio, t.fechaProgramada, t.registradoEn]),
    ...proyectos
      .filter((p) => p.clienteId === c.id)
      .flatMap((p) => [p.fechaFin, p.fechaInicio, p.registradoEn]),
  ]
    .filter((f): f is string => !!f)
    .map((f) => f.slice(0, 10));
  return fechas.reduce((a, b) => (b > a ? b : a));
}

/**
 * Sugiere «puntual» a un cliente sin clasificar, que no está de baja, sin proyectos ni servicios abiertos y sin
 * actividad en los últimos `meses` (12 por defecto). Devuelve null cuando no hay motivo.
 */
export function sugerirPuntual(
  c: Pick<Cliente, "id" | "creadoEn" | "estado" | "vinculo">,
  trabajos: readonly Pick<
    TrabajoTecnico,
    "clienteId" | "estado" | "fechaFin" | "fechaInicio" | "fechaProgramada" | "registradoEn"
  >[],
  proyectos: readonly Pick<
    Proyecto,
    "clienteId" | "estado" | "fechaFin" | "fechaInicio" | "registradoEn"
  >[],
  hoy: string,
  meses = 12,
): { desde: string } | null {
  if (c.vinculo || c.estado === "baja") return null;
  if (proyectos.some((p) => p.clienteId === c.id && ABIERTOS_PROYECTO.includes(p.estado)))
    return null;
  if (trabajos.some((t) => t.clienteId === c.id && ABIERTOS_TRABAJO.includes(t.estado)))
    return null;
  const ultima = ultimaActividad(c, trabajos, proyectos);
  return sumarMeses(ultima, meses) <= hoy ? { desde: ultima } : null;
}
