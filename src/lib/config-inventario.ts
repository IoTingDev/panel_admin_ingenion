import type { ConfigInventario, GrupoInventario } from "@/lib/api/types";

export const GRUPOS: GrupoInventario[] = ["componentes", "herramientas", "equipos", "seguridad"];

export const ROTULO_GRUPO: Record<GrupoInventario, string> = {
  componentes: "Componentes",
  herramientas: "Herramientas",
  equipos: "Equipos",
  seguridad: "Seguridad y Telecom",
};

/**
 * Valores por defecto. La lista vive en la configuración de la base (editable desde la UI);
 * esto solo la siembra. «Accesorios de instalación» no tenía prefijo asignado en el encargo:
 * se numera con CAB (decisión declarada, editable en Configuración).
 */
export const CONFIG_INVENTARIO_DEFECTO: ConfigInventario = {
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
  prefijos: {
    Instrumentación: "SEN",
    "Potencia y actuadores": "POT",
    Comunicación: "COM",
    Pantallas: "DSP",
    "SBC y cámaras": "SBC",
    Microcontroladores: "MCU",
    "Herramientas eléctricas y brocas": "HER",
    "Herramientas de mano": "MAN",
    "Accesorios de taller": "CAB",
    Equipos: "EQP",
    Cámaras: "CAM",
    "Grabadores (DVR/NVR)": "GRB",
    "Alarmas y sensores": "ALR",
    "Cableado y conectividad": "CAB",
    "Redes y telecom": "RED",
    "Energía y respaldo": "ENE",
    "Accesorios de instalación": "CAB",
  },
  depreciacion: {
    aniosPorGrupo: { componentes: null, herramientas: 5, equipos: 5, seguridad: null },
    residualPct: 10,
  },
};

/** Reclasificación del encargo v2 (solo grupo y categoría; los SKU no cambian). */
export const RECLASIFICACION_V1: Record<string, [GrupoInventario, string]> = {
  ...Object.fromEntries(
    ["CAB-001", "CAB-008", "CAB-009", "CAB-010", "CAB-011", "CAB-012"].map((s) => [
      s,
      ["herramientas", "Accesorios de taller"] as [GrupoInventario, string],
    ]),
  ),
  ...Object.fromEntries(
    ["CAB-002", "CAB-003", "CAB-004", "CAB-005", "CAB-006", "CAB-007"].map((s) => [
      s,
      ["seguridad", "Cableado y conectividad"] as [GrupoInventario, string],
    ]),
  ),
  "EQP-008": ["herramientas", "Herramientas de mano"],
  "EQP-009": ["herramientas", "Herramientas de mano"],
};

/** Grupo que la v1 deducía del prefijo del SKU; solo se usa al migrar. */
export const GRUPO_V1_POR_PREFIJO: Record<string, GrupoInventario> = {
  SEN: "componentes",
  POT: "componentes",
  COM: "componentes",
  DSP: "componentes",
  SBC: "componentes",
  MCU: "componentes",
  HER: "herramientas",
  CAB: "herramientas",
  MAN: "herramientas",
  EQP: "equipos",
};

export function grupoDeCategoria(
  cfg: ConfigInventario,
  categoria: string,
): GrupoInventario | undefined {
  return GRUPOS.find((g) => cfg.categorias[g].includes(categoria));
}

/** null si es válida; si no, el motivo. */
export function validarConfigInventario(cfg: ConfigInventario): string | null {
  const vistas = new Set<string>();
  for (const g of GRUPOS) {
    for (const c of cfg.categorias[g] ?? []) {
      if (!c.trim()) return "Hay una categoría sin nombre.";
      if (vistas.has(c)) return `La categoría «${c}» está repetida.`;
      vistas.add(c);
      const p = cfg.prefijos[c];
      if (!p || !/^[A-Z]{3}$/.test(p))
        return `La categoría «${c}» necesita un prefijo de 3 letras mayúsculas (tiene «${p ?? ""}»).`;
    }
  }
  const { aniosPorGrupo, residualPct } = cfg.depreciacion;
  if (!Number.isFinite(residualPct) || residualPct < 0 || residualPct > 100)
    return "El valor residual debe estar entre 0 y 100 %.";
  for (const g of GRUPOS) {
    const a = aniosPorGrupo[g];
    if (a !== null && (!Number.isFinite(a) || a <= 0))
      return `Vida útil inválida para ${ROTULO_GRUPO[g]}.`;
  }
  return null;
}
