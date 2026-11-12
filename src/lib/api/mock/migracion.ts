import { uid } from "@/lib/format";
import {
  CONFIG_INVENTARIO_DEFECTO,
  GRUPO_V1_POR_PREFIJO,
  RECLASIFICACION_V1,
} from "@/lib/config-inventario";
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
interface RegDb {
  version?: number;
  items?: RegItem[];
  movimientos?: RegMov[];
  proyectos?: { id: string; nombre: string }[];
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
  if (raw["version"] === VERSION_DB) return raw as unknown as MockDb;
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

  return {
    ...db,
    items,
    movimientos,
    secuencias,
    auditoria,
    config: db.config ?? { inventario: structuredClone(CONFIG_INVENTARIO_DEFECTO) },
    version: VERSION_DB,
  } as unknown as MockDb;
}
