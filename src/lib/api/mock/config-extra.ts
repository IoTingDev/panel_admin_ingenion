import type { ConfiguracionApi } from "../types";
import { audit, clone, db, delay, persist } from "./store";

export const FRASE_LIMPIAR_DEMO = "ELIMINAR DEMO";

/** Sectores de clientes y limpieza de datos de demostración. */
export const configuracionExtra: Pick<ConfiguracionApi, "actualizarSectores" | "limpiarDemo"> = {
  async actualizarSectores(sectores) {
    await delay();
    const d = db();
    const limpios = [...new Set(sectores.map((s) => s.trim()).filter(Boolean))];
    if (limpios.length === 0) throw new Error("Debe haber al menos un sector.");
    const enUso = d.clientes.find((c) => c.sector && !limpios.includes(c.sector));
    if (enUso)
      throw new Error(
        `No se puede quitar el sector «${enUso.sector}»: lo usa el cliente ${enUso.razonSocial}.`,
      );
    d.config.sectores = limpios;
    audit({
      accion: "configuracion.sectores",
      entidad: "configuracion",
      entidadId: "sectores",
      detalle: limpios.join(", "),
    });
    persist();
    return clone(d.config);
  },

  async limpiarDemo(confirmacion) {
    await delay();
    if (confirmacion !== FRASE_LIMPIAR_DEMO)
      throw new Error(`Escriba exactamente ${FRASE_LIMPIAR_DEMO} para confirmar.`);
    const d = db();
    const antes = {
      movimientos: d.movimientos.length,
      trabajos: d.trabajos.length,
      proyectos: d.proyectos.length,
      usuarios: d.usuarios.length,
      clientes: d.clientes.length,
    };
    // 1) hijos de demostración; 2) clientes de demostración solo si ya no les queda nada creado por el usuario
    d.movimientos = d.movimientos.filter((m) => !m.esDemo);
    d.trabajos = d.trabajos.filter((t) => !t.esDemo);
    d.proyectos = d.proyectos.filter((p) => !p.esDemo);
    d.usuarios = d.usuarios.filter((u) => !u.esDemo);
    const conservar = (id: string) =>
      d.proyectos.some((p) => p.clienteId === id) ||
      d.usuarios.some((u) => u.clienteId === id) ||
      d.trabajos.some((t) => t.clienteId === id);
    let conservados = 0;
    d.clientes = d.clientes.filter((c) => {
      if (!c.esDemo) return true;
      if (conservar(c.id)) {
        conservados++;
        return true;
      }
      return false;
    });
    const r = {
      clientes: antes.clientes - d.clientes.length,
      usuarios: antes.usuarios - d.usuarios.length,
      proyectos: antes.proyectos - d.proyectos.length,
      trabajos: antes.trabajos - d.trabajos.length,
      movimientos: antes.movimientos - d.movimientos.length,
      clientesConservados: conservados,
    };
    audit({
      accion: "sistema.limpiar_demo",
      entidad: "sistema",
      entidadId: "demo",
      detalle: `Eliminados: ${r.clientes} clientes, ${r.usuarios} usuarios, ${r.proyectos} proyectos, ${r.trabajos} trabajos, ${r.movimientos} movimientos de demostración. Conservados por tener datos propios: ${r.clientesConservados} clientes.`,
    });
    persist();
    return r;
  },
};
