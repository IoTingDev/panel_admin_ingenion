import { uid } from "@/lib/format";
import {
  CONFIG_INVENTARIO_DEFECTO,
  GRUPO_V1_POR_PREFIJO,
  RECLASIFICACION_V1,
  type GrupoV2,
} from "@/lib/config-inventario";
import { SECTOR_AGROINDUSTRIAL, SECTORES_DEFECTO, SECTORES_RETIRADOS } from "@/lib/dominio";
import { inicializarSecuencias, prefijoDeSku } from "@/lib/inventario";
import { ACTOR, type MockDb } from "./seed";

/**
 * Versión del esquema guardado. v1 → v2 (grupos explícitos), v2 → v3 (tres grupos), v3 → v4 (sectores:
 * «cacao», «café» y «mango» pasan a «Agroindustrial»).
 */
export const VERSION_DB = 4;
const VERSION_V3 = 3;

type Laxo = Record<string, unknown>;

/** Forma laxa de lo guardado por versiones anteriores (puede faltar cualquier campo nuevo). */
interface RegItem {
  sku: string;
  categoria: string;
  grupo?: GrupoV2;
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
interface RegConfig {
  inventario: {
    categorias: Record<string, string[]>;
    prefijos: Record<string, string>;
    depreciacion: { aniosPorGrupo: Record<string, number | null>; residualPct: number };
  };
  sectores: string[];
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
  config?: RegConfig;
  [k: string]: unknown;
}

/** Configuración de inventario tal como la tenía la v2 (cuatro grupos). Solo para migrar. */
const configInventarioV2 = (): RegConfig["inventario"] => ({
  categorias: {
    componentes: [
      "Instrumentación",
      "Potencia y actuadores",
      "Comunicación",
      "Pantallas",
      "SBC y cámaras",
      "Microcontroladores",
    ],
    herramientas: [
      "Herramientas eléctricas y brocas",
      "Herramientas de mano",
      "Accesorios de taller",
    ],
    equipos: ["Equipos"],
    seguridad: [
      "Cámaras",
      "Grabadores (DVR/NVR)",
      "Alarmas y sensores",
      "Cableado y conectividad",
      "Redes y telecom",
      "Energía y respaldo",
      "Accesorios de instalación",
    ],
  },
  prefijos: structuredClone(CONFIG_INVENTARIO_DEFECTO.prefijos),
  depreciacion: {
    aniosPorGrupo: { componentes: null, herramientas: 5, equipos: 5, seguridad: null },
    residualPct: 10,
  },
});

/**
 * Sube una base guardada por la v1 a la v2 sin perder movimientos ni auditoría.
 * Solo cambia `grupo` y `categoria` de los ítems (los SKU no cambian) y añade campos nuevos.
 * Devuelve una base con la forma de la v2 (cuatro grupos); `migrarV2aV3` la lleva al esquema actual.
 */
export function migrarV1aV2(raw: Laxo): Laxo {
  if (Number(raw["version"] ?? 1) >= 2) return completarDb(structuredClone(raw)) as Laxo;
  const db = structuredClone(raw) as RegDb;
  const proyectos = db.proyectos ?? [];
  let reclasificados = 0;

  const items = (db.items ?? []).map((i) => {
    const r = RECLASIFICACION_V1[i.sku];
    const cableadoViejo = i.categoria === "Cableado"; // categoría que desaparece en la v2
    const grupoV1 = GRUPO_V1_POR_PREFIJO[prefijoDeSku(i.sku)] ?? "componentes";
    const grupo: GrupoV2 = i.grupo ?? r?.[0] ?? (cableadoViejo ? "herramientas" : grupoV1);
    const categoria = r ? r[1] : cableadoViejo ? "Accesorios de taller" : i.categoria;
    if (grupo !== grupoV1 || categoria !== i.categoria) reclasificados++;
    return { ...i, grupo, categoria };
  });

  const movimientos = (db.movimientos ?? []).map((m) => {
    if (!m.proyecto || m.destinoId) return m;
    const p = proyectos.find((x) => x.nombre === m.proyecto);
    return p ? { ...m, destinoTipo: "proyecto", destinoId: p.id } : m;
  });

  const secuencias = {
    ...inicializarSecuencias(
      items as unknown as { sku: string }[],
      movimientos as unknown as { sku: string }[],
    ),
  };
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

  return completarDb({
    ...db,
    items,
    movimientos,
    secuencias,
    auditoria,
    config: db.config ?? { inventario: configInventarioV2(), sectores: [] },
    version: 2,
  } as Laxo);
}

/**
 * Sube una base v2 a la v3: el grupo «seguridad» desaparece y sus ítems pasan a «componentes»
 * conservando SKU, categoría, valor y movimientos. Las categorías de seguridad (también las que el
 * usuario haya añadido) se funden en las de Componentes. Es idempotente.
 */
export function migrarV2aV3(raw: Laxo): MockDb {
  if (Number(raw["version"] ?? 1) >= VERSION_V3)
    return completarDb(structuredClone(raw)) as unknown as MockDb;
  const db = completarDb(structuredClone(raw)) as RegDb;
  let movidos = 0;
  const items = (db.items ?? []).map((i) => {
    if (i.grupo !== "seguridad") return i;
    movidos++;
    return { ...i, grupo: "componentes" as const };
  });

  const cfg: RegConfig = db.config ?? { inventario: configInventarioV2(), sectores: [] };
  const cats = cfg.inventario.categorias;
  const comp = cats["componentes"] ?? [];
  cats["componentes"] = [...comp, ...(cats["seguridad"] ?? []).filter((c) => !comp.includes(c))];
  delete cats["seguridad"];
  // Una categoría usada por un ítem de Componentes no puede faltar en la lista.
  for (const i of items)
    if (i.grupo === "componentes" && !cats["componentes"].includes(i.categoria))
      cats["componentes"].push(i.categoria);
  delete cfg.inventario.depreciacion.aniosPorGrupo["seguridad"];

  const auditoria = [
    {
      id: uid(),
      fecha: new Date().toISOString(),
      actor: ACTOR,
      accion: "sistema.migracion",
      entidad: "sistema",
      entidadId: "db",
      detalle: `Base v2 → v3: el grupo «seguridad» se elimina; ${movidos} ítems pasan a «componentes» con su SKU y categoría. La base v2 queda como respaldo.`,
    },
    ...(db.auditoria ?? []),
  ];
  return { ...db, items, config: cfg, auditoria, version: VERSION_V3 } as unknown as MockDb;
}

/**
 * Sube una base v3 a la v4: los clientes con sector «cacao», «café» o «mango» pasan a «Agroindustrial» y la
 * lista de sectores se actualiza. **No borra ni recorta nada**: el valor anterior de cada cliente queda en la
 * auditoría (una entrada por cliente) y la lista anterior, en la entrada de configuración. Idempotente: una
 * base v4 se devuelve igual.
 */
export function migrarV3aV4(raw: Laxo): MockDb {
  if (Number(raw["version"] ?? 1) >= VERSION_DB)
    return completarDb(structuredClone(raw)) as unknown as MockDb;
  const db = completarDb(structuredClone(raw)) as RegDb;
  const nuevas: {
    id: string;
    fecha: string;
    actor: string;
    accion: string;
    entidad: string;
    entidadId: string;
    detalle: string;
  }[] = [];
  const entrada = (accion: string, entidad: string, entidadId: string, detalle: string) =>
    nuevas.push({
      id: uid(),
      fecha: new Date().toISOString(),
      actor: ACTOR,
      accion,
      entidad,
      entidadId,
      detalle,
    });

  let convertidos = 0;
  const clientes = (db.clientes ?? []).map((c) => {
    if (!c.sector || !SECTORES_RETIRADOS.includes(c.sector)) return c;
    convertidos++;
    entrada(
      "cliente.editar",
      "cliente",
      String((c as unknown as { id: string }).id),
      `Sector «${c.sector}» → «${SECTOR_AGROINDUSTRIAL}» (migración v3 → v4; valor anterior conservado aquí)`,
    );
    return { ...c, sector: SECTOR_AGROINDUSTRIAL };
  });

  const cfg: RegConfig = db.config ?? { inventario: configInventarioV2(), sectores: [] };
  const antes = [...(cfg.sectores ?? [])];
  const lista = [
    ...new Set(antes.map((s) => (SECTORES_RETIRADOS.includes(s) ? SECTOR_AGROINDUSTRIAL : s))),
  ];
  if (!lista.includes(SECTOR_AGROINDUSTRIAL)) lista.unshift(SECTOR_AGROINDUSTRIAL);
  cfg.sectores = lista;
  if (antes.join("|") !== lista.join("|"))
    entrada(
      "configuracion.sectores",
      "configuracion",
      "sectores",
      `${lista.join(", ")} (antes: ${antes.join(", ")}; migración v3 → v4)`,
    );
  entrada(
    "sistema.migracion",
    "sistema",
    "db",
    `Base v3 → v4: ${convertidos} clientes pasan a «${SECTOR_AGROINDUSTRIAL}»; el resto de los datos queda intacto y los valores anteriores constan en la auditoría.`,
  );

  return {
    ...db,
    clientes,
    config: cfg,
    auditoria: [...nuevas.reverse(), ...(db.auditoria ?? [])],
    version: VERSION_DB,
  } as unknown as MockDb;
}

/** Lleva cualquier base guardada (v1, v2, v3 o v4) al esquema actual, encadenando las migraciones. */
export function migrarADbActual(raw: Laxo): MockDb {
  const v = Number(raw["version"] ?? 1);
  if (v >= VERSION_DB) return completarDb(structuredClone(raw)) as unknown as MockDb;
  const v3 = v >= VERSION_V3 ? raw : migrarV2aV3(v >= 2 ? raw : migrarV1aV2(raw));
  return migrarV3aV4(v3 as unknown as Laxo);
}

/**
 * Completa una base con campos que se añadieron en fases posteriores (proyectos, servicios
 * técnicos, sectores, contador `TT`). Idempotente; no cambia el número de versión.
 */
export function completarDb<T extends object>(db: T): T {
  const d = db as unknown as RegDb;
  d.trabajos ??= [];
  d.config ??= { inventario: structuredClone(CONFIG_INVENTARIO_DEFECTO), sectores: [] };
  if (!d.config.sectores || d.config.sectores.length === 0) {
    const usados = (d.clientes ?? []).map((c) => c.sector).filter((s): s is string => !!s);
    d.config.sectores = [...new Set([...SECTORES_DEFECTO, ...usados])];
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
