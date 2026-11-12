import type { Respaldo, RespaldoApi, ResumenRespaldo } from "../types";
import { completarV2, migrarV1aV2, VERSION_DB } from "./migracion";
import type { MockDb } from "./seed";
import { audit, clone, db, delay, persist, reemplazarDb } from "./store";

export const FORMATO_RESPALDO = "ioting-panel-respaldo";
const ENTIDADES = [
  "clientes",
  "usuarios",
  "proyectos",
  "trabajos",
  "items",
  "movimientos",
  "auditoria",
];
/** Arreglos que un respaldo debe traer (trabajos es opcional: bases anteriores a la fase 4). */
const OBLIGATORIAS = ["clientes", "usuarios", "proyectos", "items", "movimientos", "auditoria"];

const invalido = (motivo: string) => new Error(`Respaldo inválido: ${motivo}`);

/** Valida el texto y devuelve el respaldo y la base ya migrada/completada, sin aplicar nada. */
function leer(texto: string): { respaldo: Respaldo; base: MockDb } {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw invalido("el archivo no es JSON.");
  }
  const r = crudo as Partial<Respaldo> | null;
  if (!r || typeof r !== "object" || r.formato !== FORMATO_RESPALDO)
    throw invalido("no es un respaldo del panel de IoTing Dev.");
  if (typeof r.version !== "number" || r.version > VERSION_DB)
    throw invalido(`versión no soportada (${String(r.version)}).`);
  const datos = r.datos as Record<string, unknown> | undefined;
  if (!datos || typeof datos !== "object") throw invalido("faltan los datos.");
  for (const k of OBLIGATORIAS) {
    const v = datos[k];
    if (!Array.isArray(v) || v.some((x) => !x || typeof x !== "object"))
      throw invalido(`«${k}» debe ser una lista de registros.`);
  }
  const base =
    r.version < VERSION_DB || datos["version"] !== VERSION_DB
      ? migrarV1aV2(structuredClone(datos))
      : completarV2(structuredClone(datos) as unknown as MockDb);
  return { respaldo: r as Respaldo, base };
}

const conteo = (d: Record<string, unknown>, k: string) =>
  Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0;

function resumen(r: Respaldo, base: MockDb): ResumenRespaldo {
  const actual = db() as unknown as Record<string, unknown>;
  const nuevo = base as unknown as Record<string, unknown>;
  return {
    exportadoEn: r.exportadoEn,
    version: r.version,
    entidades: ENTIDADES.map((nombre) => ({
      nombre,
      enRespaldo: conteo(nuevo, nombre),
      actual: conteo(actual, nombre),
    })),
  };
}

export const respaldoApi: RespaldoApi = {
  async exportar() {
    await delay(40);
    return {
      formato: FORMATO_RESPALDO,
      version: VERSION_DB,
      exportadoEn: new Date().toISOString(),
      datos: clone(db()) as unknown as Record<string, unknown>,
    };
  },
  async previsualizar(texto) {
    await delay(40);
    const { respaldo, base } = leer(texto);
    return resumen(respaldo, base);
  },
  async importar(texto) {
    await delay();
    const { respaldo, base } = leer(texto);
    const res = resumen(respaldo, base);
    reemplazarDb(base);
    audit({
      accion: "sistema.respaldo_importar",
      entidad: "sistema",
      entidadId: "respaldo",
      detalle: `Respaldo del ${respaldo.exportadoEn} importado: ${res.entidades
        .map((e) => `${e.nombre} ${e.actual} → ${e.enRespaldo}`)
        .join(", ")}`,
    });
    persist();
    return res;
  },
};
