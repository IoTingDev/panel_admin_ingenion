// Desglose de un proyecto o servicio (ADR-0047): todo lo que se muestra se DERIVA de lo digitado;
// nada se escribe a mano, y sin dato no se inventa (null).

export interface EntradaDesglose {
  valorPactado?: number | undefined;
  /** Costo del material que salió del inventario hacia este proyecto o servicio. */
  materiales: number;
  minutosTrabajo?: number | undefined;
  valorHora?: number | undefined;
}

export interface Desglose {
  materiales: number;
  /** round(minutos × valor por hora / 60); null si falta cualquiera de los dos datos. */
  desarrollo: number | null;
  /** materiales + desarrollo; null si no hay desarrollo calculable. */
  costoTotal: number | null;
  valorPactado: number | undefined;
  /** valorPactado − costoTotal. Positiva: utilidad sobre el tiempo; negativa: se cobra bajo el costo. */
  diferencia: number | null;
  /** valorPactado − materiales (lo que quedaría antes de contar el tiempo); null sin valor pactado. */
  sobreMateriales: number | null;
}

export function desglose(e: EntradaDesglose): Desglose {
  const desarrollo =
    e.minutosTrabajo !== undefined && e.valorHora !== undefined
      ? Math.round((e.minutosTrabajo * e.valorHora) / 60)
      : null;
  const costoTotal = desarrollo === null ? null : e.materiales + desarrollo;
  return {
    materiales: e.materiales,
    desarrollo,
    costoTotal,
    valorPactado: e.valorPactado,
    diferencia: e.valorPactado !== undefined && costoTotal !== null ? e.valorPactado - costoTotal : null,
    sobreMateriales: e.valorPactado !== undefined ? e.valorPactado - e.materiales : null,
  };
}

/** La interfaz captura horas (admite decimales); se guardan minutos enteros. */
export const minutosDeHoras = (horas: number): number => Math.round(horas * 60);
export const horasDeMinutos = (minutos: number): number => minutos / 60;
