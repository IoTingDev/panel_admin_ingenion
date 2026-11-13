import { useSyncExternalStore } from "react";

/**
 * Estado de la conexión con el backend que la interfaz necesita mostrar: hoy, solo si la base de
 * datos se está reanudando tras una pausa («Despertando la base de datos…»). Almacén externo mínimo
 * para que el transporte (que no es un componente) avise a la interfaz.
 */
let despertando = false;
const oyentes = new Set<() => void>();

export function marcarDespertando(valor: boolean): void {
  if (despertando === valor) return;
  despertando = valor;
  oyentes.forEach((o) => o());
}

export const estaDespertando = (): boolean => despertando;

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useBaseDespertando(): boolean {
  return useSyncExternalStore(suscribir, estaDespertando, () => false);
}
