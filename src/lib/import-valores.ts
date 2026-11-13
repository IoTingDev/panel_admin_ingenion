import type { FilaValores, GrupoInventario } from "@/lib/api/types";
import { splitCsvLine } from "./import-movements";

const REQUERIDAS = [
  "sku",
  "grupo_propuesto",
  "categoria_propuesta",
  "cantidad_inicial",
  "anio_compra",
  "valor_unitario",
];

/**
 * Número entero de una celda: vacío → null; «1.250.000», «$ 1,250,000» y «1250000» → 1250000;
 * cualquier otra cosa → NaN (la validación de la fila lo reporta; no se adivina).
 */
export function enteroDeCelda(raw: string): number | null {
  const s = raw.replace(/[$\s]/g, "");
  if (s === "") return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  return Number.NaN;
}

/** Lee la plantilla `plantilla_valores_inventario.csv`. Lanza si faltan columnas. */
export function parseCsvValores(text: string): FilaValores[] {
  const lineas = text
    .slice(text.charCodeAt(0) === 0xfeff ? 1 : 0)
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  const headers = splitCsvLine(lineas.shift() ?? "").map((h) => h.trim().toLowerCase());
  const faltan = REQUERIDAS.filter((h) => !headers.includes(h));
  if (faltan.length > 0) throw new Error(`Faltan columnas: ${faltan.join(", ")}`);
  return lineas.map((linea) => {
    const cols = splitCsvLine(linea);
    const get = (k: string) => (cols[headers.indexOf(k)] ?? "").trim();
    const cantidad = enteroDeCelda(get("cantidad_inicial"));
    const grupoCrudo = get("grupo_propuesto").toLowerCase();
    // El grupo «seguridad» ya no existe (v3): un CSV viejo se acepta y se toma como «componentes».
    const reasignado = grupoCrudo === "seguridad";
    return {
      sku: get("sku"),
      grupo: (reasignado ? "componentes" : grupoCrudo) as GrupoInventario,
      ...(reasignado
        ? { aviso: "El grupo «seguridad» ya no existe: se toma como «componentes»." }
        : {}),
      categoria: get("categoria_propuesta"),
      cantidad_inicial: cantidad === null ? Number.NaN : cantidad,
      anioCompra: enteroDeCelda(get("anio_compra")),
      valorUnitario: enteroDeCelda(get("valor_unitario")),
    };
  });
}
