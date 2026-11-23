// Plan de pagos en cuotas (ADR-0047): informativo; la facturación vive en Alegra.
import type { Cuota } from "@/lib/api/types";

/** Suma `meses` a una fecha AAAA-MM-DD conservando el día; si el mes no lo tiene, usa su último día. */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number) as [number, number, number];
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/**
 * Reparte el valor pactado en `n` cuotas mensuales desde `primera`. Cada cuota vale floor(total / n) y la
 * última absorbe el residuo, de modo que la suma es EXACTAMENTE el total.
 */
export function generarPlan(total: number, n: number, primera: string): Cuota[] {
  if (!Number.isInteger(total) || total <= 0)
    throw new Error("El valor pactado debe ser un entero COP > 0.");
  if (!Number.isInteger(n) || n < 1 || n > 120) throw new Error("Las cuotas deben ser de 1 a 120.");
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    vence: sumarMeses(primera, i),
    valor: i === n - 1 ? total - base * (n - 1) : base,
  }));
}

export interface ResumenPagos {
  total: number;
  cobrado: number;
  porCobrar: number;
  /** Lo no pagado cuyo vencimiento es anterior a `hoy`. */
  vencido: number;
  pagadas: number;
  cuotas: number;
}

export function resumenPagos(plan: readonly Cuota[], hoy: string): ResumenPagos {
  let cobrado = 0;
  let vencido = 0;
  let pagadas = 0;
  let total = 0;
  for (const c of plan) {
    total += c.valor;
    if (c.pagadaEn) {
      cobrado += c.valor;
      pagadas++;
    } else if (c.vence < hoy) vencido += c.valor;
  }
  return { total, cobrado, porCobrar: total - cobrado, vencido, pagadas, cuotas: plan.length };
}
