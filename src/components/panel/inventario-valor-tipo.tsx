import { useState } from "react";
import { useConfiguracion } from "@/hooks/use-api";
import type { ItemInventario, MovimientoInventario } from "@/lib/api";
import { ROTULO_GRUPO } from "@/lib/config-inventario";
import { fmtCop } from "@/lib/format";
import { valorPorTipo } from "@/lib/valoracion";

/** Un color distinto por tipo, resuelto por el tema (claro y oscuro). Ver la prueba de valores. */
export const COLOR_TIPO = {
  componentes: "var(--primary)",
  herramientas: "var(--warning)",
  equipos: "var(--success)",
} as const;

const CLAVE_DEPRECIADO = "ioting.panel.valor-depreciado.v1";
/** Preferencia de pantalla (solo en este navegador): ver o no el valor depreciado. Por defecto, no. */
function leerPreferencia(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_DEPRECIADO) === "1";
  } catch {
    return false;
  }
}

const fmtPct = (n: number) =>
  `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} %`;

/**
 * «Valor del inventario por tipo» (Inventario): valor total y una barra por tipo con su valor en pesos y su
 * porcentaje. Base: existencia a costo, la que ya calcula el panel. Todo se calcula al mostrar.
 */
export function ValorInventarioPorTipo({
  items,
  movs,
}: {
  items: ItemInventario[];
  movs: MovimientoInventario[];
}) {
  const { data: config } = useConfiguracion();
  const [verDepreciado, setVerDepreciado] = useState(leerPreferencia);
  if (!config) return null;
  const alternar = () => {
    const nuevo = !verDepreciado;
    setVerDepreciado(nuevo);
    try {
      window.localStorage.setItem(CLAVE_DEPRECIADO, nuevo ? "1" : "0");
    } catch {
      /* sin almacenamiento: la preferencia vale solo para esta visita */
    }
  };
  const dep = config.inventario.depreciacion;
  const v = valorPorTipo({
    items,
    movs,
    params: config.inventario.depreciacion,
    anioActual: new Date().getFullYear(),
  });
  return (
    <section
      data-testid="valor-por-tipo"
      aria-label="Valor del inventario por tipo"
      className="mb-5 rounded-xl border bg-card p-5 shadow-soft"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Valor del inventario por tipo</h3>
          <p className="text-sm text-muted-foreground">
            Cuánto vale hoy lo que tiene la empresa en existencia
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={verDepreciado}
            data-testid="alternar-depreciado"
            onClick={alternar}
            className="rounded-md border px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted"
          >
            {verDepreciado ? "Ocultar valor depreciado" : "Ver valor depreciado"}
          </button>
          <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
            Existencia a costo
          </span>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Valor total</p>
      <p className="font-display text-3xl font-bold tracking-tight" data-testid="valor-total-tipo">
        {fmtCop(v.total)}
      </p>
      <ul className="mt-4 space-y-3">
        {v.filas.map((f) => (
          <li key={f.grupo} data-testid={`valor-tipo-${f.grupo}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{ROTULO_GRUPO[f.grupo]}</span>
              <span className="flex items-baseline gap-3">
                <span className="text-xs text-muted-foreground">{fmtPct(f.pct)}</span>
                <span className="font-semibold tabular-nums">{fmtCop(f.valor)}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${f.pct}%`, background: COLOR_TIPO[f.grupo] }}
              />
            </div>
            {verDepreciado && f.grupo !== "componentes" && (
              <p
                data-testid={`depreciado-${f.grupo}`}
                className="mt-1 text-xs text-muted-foreground"
              >
                Depreciado: <span className="font-semibold">{fmtCop(f.depreciado)}</span> · conserva{" "}
                {fmtPct(f.valor > 0 ? (f.depreciado / f.valor) * 100 : 100)}
              </p>
            )}
          </li>
        ))}
      </ul>
      {verDepreciado && (
        <div
          data-testid="detalle-depreciado"
          className="mt-4 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
        >
          <p>
            Con Herramientas y Equipos depreciados, el valor total sería{" "}
            <span className="font-semibold text-foreground">{fmtCop(v.totalDepreciado)}</span>.
          </p>
          <p className="mt-1">
            Depreciación lineal: vida útil de {dep.aniosPorGrupo.herramientas ?? "—"} años en
            herramientas y {dep.aniosPorGrupo.equipos ?? "—"} en equipos; conserva como mínimo{" "}
            {dep.residualPct} %. {v.sinAnioCompra} ítems con valor no tienen año de compra y no se
            deprecian. Se ajusta en Configuración.
          </p>
        </div>
      )}
      <p
        data-testid="aviso-valor-tipo"
        className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
      >
        Calculado con {v.conValor} de {v.totalItems} ítems que tienen valor cargado. Los demás no
        suman hasta registrar su precio.
      </p>
    </section>
  );
}
