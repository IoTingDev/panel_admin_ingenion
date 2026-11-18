import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Banknote, Receipt, Wrench, Boxes } from "lucide-react";
import { useClientes, useMovimientos, useTrabajos } from "@/hooks/use-api";
import { ROTULO_TIPO_TRABAJO } from "@/lib/dominio";
import { capitalizar, fmtCop } from "@/lib/format";
import { resumenIngresos, type EstadoIngresos } from "@/lib/ingresos";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard } from "./common";
import { Loading } from "./data-tools";

const fmtPct = (n: number) =>
  `${new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} %`;

const ESTADOS: { value: EstadoIngresos; label: string }[] = [
  { value: "completados", label: "Servicios completados" },
  { value: "pendientes", label: "Programados y en curso (por cobrar)" },
  { value: "todos", label: "Todos menos cancelados" },
];

function Barra({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 min-w-24 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/**
 * «Ingresos por servicios»: ingresos y servicios por tipo de trabajo y por sector del cliente, para ver qué
 * trabajos aportan más y qué sectores piden más. Gestión interna: el valor pactado es informativo (Alegra
 * factura y lleva la contabilidad). Todo se calcula al mostrar.
 */
export function IngresosView() {
  const { data: trabajos = [], isLoading } = useTrabajos();
  const { data: clientes = [] } = useClientes();
  const { data: movs = [] } = useMovimientos();
  const [estado, setEstado] = useState<EstadoIngresos>("completados");
  const [anio, setAnio] = useState("");
  const r = useMemo(
    () => resumenIngresos({ trabajos, clientes, movs, filtro: { estado, anio } }),
    [trabajos, clientes, movs, estado, anio],
  );
  if (isLoading) return <Loading />;
  const hayMateriales = r.materiales > 0;
  return (
    <>
      <PageHeader
        eyebrow="Gestión / Servicios técnicos"
        title="Ingresos por servicios"
        subtitle="Qué tipos de trabajo aportan más y qué sectores piden más. Gestión interna: no reemplaza la contabilidad (Alegra)."
        actions={
          <Button asChild variant="outline">
            <Link to="/servicios-tecnicos">
              <ArrowLeft />
              Servicios técnicos
            </Link>
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <select
          className="app-select"
          aria-label="Estado de los servicios"
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoIngresos)}
        >
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          className="app-select"
          aria-label="Año"
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
        >
          <option value="">Todos los años</option>
          {r.anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ingresos (valor pactado)"
          value={fmtCop(r.ingresos)}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="Servicios"
          value={r.servicios}
          icon={Wrench}
          hint={r.sinValor ? `${r.sinValor} sin valor pactado` : "Todos con valor pactado"}
        />
        <StatCard
          label="Valor promedio por servicio"
          value={r.ticket === null ? "—" : fmtCop(r.ticket)}
          icon={Receipt}
          tone="info"
        />
        <StatCard
          label="Materiales registrados"
          value={fmtCop(r.materiales)}
          icon={Boxes}
          hint={
            hayMateriales
              ? "Salidas de inventario a estos servicios"
              : "Aún no hay salidas asociadas"
          }
        />
      </div>

      <section
        data-testid="ingresos-por-tipo"
        aria-label="Ingresos por tipo de trabajo"
        className="mb-5 rounded-xl border bg-card p-5 shadow-soft"
      >
        <h3 className="font-semibold">Por tipo de trabajo</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Ordenado por ingresos. «Margen sobre materiales» resta solo el material que salió del
          inventario hacia el servicio (no incluye mano de obra).
        </p>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo de trabajo</th>
                <th>Servicios</th>
                <th>Ingresos</th>
                <th>% de ingresos</th>
                <th>Promedio</th>
                <th>Materiales</th>
                <th>Margen sobre materiales</th>
              </tr>
            </thead>
            <tbody>
              {r.porTipo.map((f) => (
                <tr key={f.tipo} data-testid={`tipo-${f.tipo}`}>
                  <td className="font-medium">{ROTULO_TIPO_TRABAJO[f.tipo]}</td>
                  <td>{f.servicios}</td>
                  <td className="font-semibold tabular-nums">{fmtCop(f.ingresos)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Barra pct={f.pctIngresos} color="var(--primary)" />
                      <span className="text-xs text-muted-foreground">{fmtPct(f.pctIngresos)}</span>
                    </div>
                  </td>
                  <td className="tabular-nums">{f.ticket === null ? "—" : fmtCop(f.ticket)}</td>
                  <td className="tabular-nums">{f.materiales > 0 ? fmtCop(f.materiales) : "—"}</td>
                  <td className="tabular-nums">
                    {f.margenPct === null ? "—" : `${fmtCop(f.margen)} · ${fmtPct(f.margenPct)}`}
                  </td>
                </tr>
              ))}
              {!r.porTipo.length && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    No hay servicios con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        data-testid="ingresos-por-sector"
        aria-label="Servicios e ingresos por sector"
        className="mb-5 rounded-xl border bg-card p-5 shadow-soft"
      >
        <h3 className="font-semibold">Por sector del cliente</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Ordenado por servicios solicitados: los sectores que más piden.
        </p>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sector</th>
                <th>Servicios</th>
                <th>% de servicios</th>
                <th>Clientes</th>
                <th>Ingresos</th>
                <th>% de ingresos</th>
                <th>Promedio</th>
              </tr>
            </thead>
            <tbody>
              {r.porSector.map((f) => (
                <tr key={f.sector} data-testid={`sector-${f.sector}`}>
                  <td className="font-medium">{capitalizar(f.sector)}</td>
                  <td>{f.servicios}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Barra pct={f.pctServicios} color="var(--warning)" />
                      <span className="text-xs text-muted-foreground">
                        {fmtPct(f.pctServicios)}
                      </span>
                    </div>
                  </td>
                  <td>{f.clientes}</td>
                  <td className="font-semibold tabular-nums">{fmtCop(f.ingresos)}</td>
                  <td className="text-xs text-muted-foreground">{fmtPct(f.pctIngresos)}</td>
                  <td className="tabular-nums">{f.ticket === null ? "—" : fmtCop(f.ticket)}</td>
                </tr>
              ))}
              {!r.porSector.length && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground">
                    No hay servicios con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p
        data-testid="nota-ingresos"
        className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
      >
        El ingreso es el valor pactado de cada servicio, informativo y de gestión interna; la
        facturación y la contabilidad se llevan en Alegra. Los servicios sin valor pactado no suman
        ingresos.{" "}
        {r.salidasSinCosto > 0 &&
          `${r.salidasSinCosto} salidas de inventario no tienen costo registrado. `}
        Los materiales cuentan solo si la salida del inventario se asoció al servicio.
      </p>
    </>
  );
}
