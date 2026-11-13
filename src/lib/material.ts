import type { DestinoTipo, MovimientoInventario } from "@/lib/api/types";

export interface MaterialDeDestino {
  movimientos: MovimientoInventario[];
  /** Σ cantidad × costo unitario vigente al salir. Solo cuenta las salidas con costo conocido. */
  costoTotal: number;
  /** Salidas cuyo ítem no tenía valor al salir: no suman, y se avisan para no aparentar exactitud. */
  sinCosto: number;
}

/**
 * Material que salió del inventario hacia un proyecto o trabajo. `nombreLegado` recoge los
 * movimientos de la v1, que apuntaban al proyecto por su nombre en texto.
 */
export function materialDeDestino(
  movs: MovimientoInventario[],
  tipo: DestinoTipo,
  id: string,
  nombreLegado?: string,
): MaterialDeDestino {
  const propios = movs.filter(
    (m) =>
      m.tipo === "Salida" &&
      ((m.destinoTipo === tipo && m.destinoId === id) ||
        (tipo === "proyecto" && !m.destinoId && !!nombreLegado && m.proyecto === nombreLegado)),
  );
  return {
    movimientos: propios,
    costoTotal: propios.reduce((a, m) => a + m.cantidad * (m.costoAlSalir ?? 0), 0),
    sinCosto: propios.filter((m) => m.costoAlSalir == null).length,
  };
}
