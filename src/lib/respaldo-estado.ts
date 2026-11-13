/**
 * Estado del respaldo en este navegador (no es dato de negocio: no va dentro del respaldo).
 * Mientras no exista backend, los datos viven solo en el localStorage de este navegador.
 */
const KEY = "ioting.panel.respaldo.v1";
export const DIAS_AVISO_RESPALDO = 7;

interface Estado {
  ultimo: string | null;
  primerUso: string;
}

function leer(ahora: Date): Estado {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const e = JSON.parse(raw) as Partial<Estado>;
      if (typeof e.primerUso === "string")
        return { ultimo: e.ultimo ?? null, primerUso: e.primerUso };
    }
  } catch {
    /* se recrea */
  }
  const nuevo: Estado = { ultimo: null, primerUso: ahora.toISOString() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(nuevo));
  } catch {
    /* sin almacenamiento: no se avisa */
  }
  return nuevo;
}

export function marcarRespaldo(ahora = new Date()) {
  const e = leer(ahora);
  window.localStorage.setItem(KEY, JSON.stringify({ ...e, ultimo: ahora.toISOString() }));
}

export function ultimoRespaldo(ahora = new Date()): string | null {
  return leer(ahora).ultimo;
}

/** Días completos desde el último respaldo (o desde el primer uso, si nunca se hizo uno). */
export function diasSinRespaldo(ahora = new Date()): number {
  const e = leer(ahora);
  const base = Date.parse(e.ultimo ?? e.primerUso);
  return Math.floor((ahora.getTime() - base) / 86_400_000);
}

export const hayQueRecordarRespaldo = (ahora = new Date()) =>
  diasSinRespaldo(ahora) > DIAS_AVISO_RESPALDO;
