/** Barra horizontal de un porcentaje (0–100), para las pantallas de ingresos. */
export function BarraPorcentaje({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 min-w-24 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
