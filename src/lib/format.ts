const TZ = "America/Bogota";

export function fmtFecha(iso?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
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
