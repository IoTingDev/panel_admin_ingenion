const TZ = "America/Bogota";

/** AAAA-MM-DD (sin hora) se toma como ese día en Bogotá, no como medianoche UTC (que caería el día anterior). */
export const instanteDe = (iso: string) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00-05:00" : iso);

export function fmtFecha(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(instanteDe(iso));
}

export function fmtFechaHora(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

/** yyyy-mm-dd en zona Bogotá, útil para inputs type=date. */
export function isoDia(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export function uid(): string {
  return crypto.randomUUID();
}

/** Iniciales para el avatar: primera letra del primer y del último nombre (máx. 2). */
export function iniciales(nombre?: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "—";
  const sel = partes.length === 1 ? [partes[0]!] : [partes[0]!, partes[partes.length - 1]!];
  return sel.map((p) => p[0]!.toUpperCase()).join("");
}

/** Nombre corto para el encabezado: las dos primeras palabras. */
export function nombreCorto(nombre?: string): string {
  return (nombre ?? "").trim().split(/\s+/).slice(0, 2).join(" ");
}

/** Pesos colombianos sin decimales: $ 1.250.000. */
export function fmtCop(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}
