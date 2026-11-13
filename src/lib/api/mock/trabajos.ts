import { uid } from "@/lib/format";
import { ESTADOS_TRABAJO, TIPOS_TRABAJO } from "@/lib/dominio";
import { hoyBogota } from "@/lib/inventario";
import type { NuevoTrabajo, TrabajoTecnico, TrabajosApi } from "../types";
import { audit, clone, db, delay, exigirClienteActivo, exigirMotivo, must, persist } from "./store";

const dia = (f: string) => f.slice(0, 10);

/** Valida los campos de un servicio técnico (ya fusionados). Lanza con un mensaje claro. */
function validar(t: NuevoTrabajo) {
  const d = db();
  const cliente = d.clientes.find((c) => c.id === t.clienteId);
  if (!cliente) throw new Error("El cliente indicado no existe.");
  if (!t.titulo || !t.titulo.trim())
    throw new Error("El título del servicio técnico es obligatorio.");
  if (!TIPOS_TRABAJO.includes(t.tipo)) throw new Error(`Tipo de trabajo inválido: «${t.tipo}».`);
  if (t.estado && !ESTADOS_TRABAJO.includes(t.estado))
    throw new Error(`Estado de servicio técnico inválido: «${t.estado}».`);
  if (t.valorPactado !== undefined && (!Number.isInteger(t.valorPactado) || t.valorPactado < 0))
    throw new Error("El valor pactado debe ser un entero COP ≥ 0.");
  if (t.fechaInicio && t.fechaFin && dia(t.fechaFin) < dia(t.fechaInicio))
    throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
  return cliente;
}

export const trabajosApi: TrabajosApi = {
  async list() {
    await delay();
    return clone(db().trabajos);
  },
  async get(id) {
    await delay();
    return clone(db().trabajos.find((t) => t.id === id) ?? null);
  },
  async create(data) {
    await delay();
    const d = db();
    const cliente = validar(data);
    if (cliente.estado !== "activo")
      throw new Error(
        `El cliente ${cliente.razonSocial} está en ${cliente.estado}: no admite servicios técnicos nuevos.`,
      );
    const estado = data.estado ?? "programado";
    const hoy = hoyBogota();
    const n = (d.secuencias["TT"] ?? 0) + 1;
    d.secuencias["TT"] = n; // el contador solo sube: los códigos no se reutilizan
    const t: TrabajoTecnico = {
      ...data,
      id: uid(),
      codigo: `TT-${String(n).padStart(4, "0")}`,
      estado,
      fechaInicio:
        data.fechaInicio ?? (estado === "en_curso" || estado === "completado" ? hoy : undefined),
      fechaFin: data.fechaFin ?? (estado === "completado" ? hoy : undefined),
      registradoEn: new Date().toISOString(),
    };
    d.trabajos.unshift(t);
    audit({
      accion: "trabajo.crear",
      entidad: "trabajo",
      entidadId: t.id,
      detalle: `${t.codigo} · ${t.titulo}`,
    });
    persist();
    return clone(t);
  },
  async update(id, data) {
    await delay();
    const d = db();
    const t = must(
      d.trabajos.find((x) => x.id === id),
      "Servicio técnico no encontrado",
    );
    validar({ ...t, ...data });
    const cambios = Object.entries(data).map(
      ([k, v]) =>
        `${k}: ${String((t as unknown as Record<string, unknown>)[k] ?? "—")} → ${String(v ?? "—")}`,
    );
    Object.assign(t, data);
    audit({
      accion: "trabajo.editar",
      entidad: "trabajo",
      entidadId: id,
      detalle: `${t.codigo}: ${cambios.join("; ")}`,
    });
    persist();
    return clone(t);
  },
  async cambiarEstado(id, estado, motivo) {
    await delay(60);
    const d = db();
    const t = must(
      d.trabajos.find((x) => x.id === id),
      "Servicio técnico no encontrado",
    );
    if (t.estado === estado) return clone(t);
    const prev = t.estado;
    const hoy = hoyBogota();
    if (estado === "cancelado") {
      t.motivoCancelacion = exigirMotivo(motivo, "Cancelar el servicio técnico");
      t.bajaPorCliente = false;
    } else if (prev === "cancelado") {
      exigirClienteActivo(
        d.clientes.find((c) => c.id === t.clienteId),
        "el servicio técnico",
      );
      delete t.motivoCancelacion;
      delete t.bajaPorCliente;
    }
    if (estado === "en_curso" || estado === "completado") t.fechaInicio ??= hoy;
    if (estado === "completado") t.fechaFin ??= hoy;
    t.estado = estado;
    audit({
      accion:
        estado === "cancelado"
          ? "trabajo.cancelar"
          : prev === "cancelado"
            ? "trabajo.reactivar"
            : "trabajo.estado",
      entidad: "trabajo",
      entidadId: id,
      detalle: `${t.codigo}: ${prev} → ${estado}${motivo ? `. Motivo: ${motivo.trim()}` : ""}`,
    });
    persist();
    return clone(t);
  },
  async eliminar(id, motivo) {
    await delay();
    const d = db();
    const m = exigirMotivo(motivo, "La eliminación del servicio técnico");
    const t = must(
      d.trabajos.find((x) => x.id === id),
      "Servicio técnico no encontrado",
    );
    d.trabajos = d.trabajos.filter((x) => x.id !== id);
    audit({
      accion: "trabajo.eliminar",
      entidad: "trabajo",
      entidadId: id,
      detalle: `${t.codigo} · ${t.titulo}. Motivo: ${m}`,
    });
    persist();
  },
};
