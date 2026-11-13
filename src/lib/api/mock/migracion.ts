import { uid } from "@/lib/format";
import {
  CONFIG_INVENTARIO_DEFECTO,
  GRUPO_V1_POR_PREFIJO,
  RECLASIFICACION_V1,
} from "@/lib/config-inventario";
import { SECTORES_DEFECTO } from "@/lib/dominio";
import { inicializarSecuencias, prefijoDeSku } from "@/lib/inventario";
import type { GrupoInventario } from "../types";
import { ACTOR, type MockDb } from "./seed";

export const VERSION_DB = 2;

/** Forma laxa de lo guardado por la v1 (puede faltar cualquier campo nuevo). */
interface RegItem {
  sku: string;
  categoria: string;
  grupo?: GrupoInventario;
  [k: string]: unknown;
}
interface RegMov {
  sku: string;
  proyecto?: string;
  destinoId?: string;
  [k: string]: unknown;
}
interface RegProyecto {
  estado: string;
  fechaInicio?: string;
  registradoEn?: string;
  [k: string]: unknown;
}
interface RegDb {
  version?: number;
  items?: RegItem[];
  movimientos?: RegMov[];
  proyectos?: ({ id: string; nombre: string } & RegProyecto)[];
  clientes?: { sector?: string }[];
  trabajos?: { codigo: string }[];
  secuencias?: Record<string, number>;
  auditoria?: unknown[];
  config?: MockDb["config"];
  [k: string]: unknown;
}

/**
 * Sube una base guardada por la v1 a la v2 sin perder movimientos ni auditoría.
 * Solo cambia `grupo` y `categoria` de los ítems (los SKU no cambian) y añade campos nuevos.
 * Es idempotente: una base que ya es v2 se devuelve igual.
 */
export function migrarV1aV2(raw: Record<string, unknown>): MockDb {
  if (raw["version"] === VERSION_DB) return completarV2(raw as unknown as MockDb);
  const db = structuredClone(raw) as RegDb;
  const proyectos = db.proyectos ?? [];
  let reclasificados = 0;

  const items = (db.items ?? []).map((i) => {
    const r = RECLASIFICACION_V1[i.sku];
    const cableadoViejo = i.categoria === "Cableado"; // categoría que desaparece en la v2
    const grupoV1 = GRUPO_V1_POR_PREFIJO[prefijoDeSku(i.sku)] ?? "componentes";
    const grupo: GrupoInventario = i.grupo ?? r?.[0] ?? (cableadoViejo ? "herramientas" : grupoV1);
    const categoria = r ? r[1] : cableadoViejo ? "Accesorios de taller" : i.categoria;
    if (grupo !== grupoV1 || categoria !== i.categoria) reclasificados++;
    return { ...i, grupo, categoria };
  });

  const movimientos = (db.movimientos ?? []).map((m) => {
    if (!m.proyecto || m.destinoId) return m;
    const p = proyectos.find((x) => x.nombre === m.proyecto);
    return p ? { ...m, destinoTipo: "proyecto", destinoId: p.id } : m;
  });

  const secuencias = { ...inicializarSecuencias(items, movimientos) };
  for (const [k, v] of Object.entries(db.secuencias ?? {}))
    secuencias[k] = Math.max(secuencias[k] ?? 0, v);

  const auditoria = [
    {
      id: uid(),
      fecha: new Date().toISOString(),
      actor: ACTOR,
      accion: "sistema.migracion",
      entidad: "sistema",
      entidadId: "db",
      detalle: `Base v1 → v2: ${items.length} ítems con grupo explícito (${reclasificados} reclasificados), ${movimientos.length} movimientos y la auditoría conservados.`,
    },
    ...(db.auditoria ?? []),
  ];

  return completarV2({
    ...db,
    items,
    movimientos,
    secuencias,
    auditoria,
    config: db.config ?? { inventario: structuredClone(CONFIG_INVENTARIO_DEFECTO) },
    version: VERSION_DB,
  } as unknown as MockDb);
}

/**
 * Completa una base v2 guardada con campos que se añadieron después (fases 3 y 4): idempotente.
 * No cambia el número de versión: son campos opcionales o con valor por defecto.
 */
export function completarV2(db: MockDb): MockDb {
  const d = db as unknown as RegDb & { trabajos?: { codigo: string }[] };
  d.trabajos ??= [];
  d.config ??= { inventario: structuredClone(CONFIG_INVENTARIO_DEFECTO), sectores: [] };
  const cfg = d.config as MockDb["config"];
  if (!cfg.sectores || cfg.sectores.length === 0) {
    const usados = (d.clientes ?? []).map((c) => c.sector).filter((s): s is string => !!s);
    cfg.sectores = [...new Set([...SECTORES_DEFECTO, ...usados])];
  }
  for (const p of d.proyectos ?? []) {
    if (p.estado === "borrador") p.estado = "en_desarrollo";
    p.registradoEn ??= p.fechaInicio ?? new Date().toISOString();
  }
  const seq = (d.secuencias ??= {});
  const maxTT = Math.max(0, ...d.trabajos.map((t) => Number.parseInt(t.codigo.slice(3), 10) || 0));
  seq["TT"] = Math.max(seq["TT"] ?? 0, maxTT);
  return db;
}
