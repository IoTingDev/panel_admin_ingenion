import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Banknote, Boxes, FolderKanban, Receipt } from "lucide-react";
import { useClientes, useMovimientos, useProyectos } from "@/hooks/use-api";
import { ROTULO_TIPO_PROYECTO } from "@/lib/dominio";
import { capitalizar, fmtCop, fmtPct } from "@/lib/format";
import { resumenIngresosProyectos, type EstadoIngresosProyectos } from "@/lib/ingresos";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard } from "./common";
import { Loading } from "./data-tools";
import { BarraPorcentaje as Barra } from "./barra-porcentaje";

const ESTADOS: { value: EstadoIngresosProyectos; label: string }[] = [
  { value: "finalizados", label: "Proyectos finalizados" },
  { value: "vigentes", label: "Vigentes (en desarrollo, en operación y pausados)" },
  { value: "todos", label: "Todos menos dados de baja" },
];

/**
 * «Ingresos por proyectos»: ingresos y proyectos por tipo de proyecto y por sector del cliente. Gestión interna:
 * el valor pactado es informativo (Alegra factura y lleva la contabilidad). Va aparte de los servicios técnicos.
 */
export function IngresosProyectosView() {
  const { data: proyectos = [], isLoading } = useProyectos();
  const { data: clientes = [] } = useClientes();
  const { data: movs = [] } = useMovimientos();
  const [estado, setEstado] = useState<EstadoIngresosProyectos>("finalizados");
  const [anio, setAnio] = useState("");
  const r = useMemo(
    () => resumenIngresosProyectos({ proyectos, clientes, movs, filtro: { estado, anio } }),
    [proyectos, clientes, movs, estado, anio],
  );
  if (isLoading) return <Loading />;
  const hayMateriales = r.materiales > 0;
  const sinTipo = r.porTipo.find((f) => f.tipo === "sin_tipo");
  return (
    <>
      <PageHeader
        eyebrow="Gestión / Proyectos I+D+I"
        title="Ingresos por proyectos"
        subtitle="Qué tipos de proyecto aportan más y qué sectores piden más. Gestión interna: no reemplaza la contabilidad (Alegra)."
        actions={
          <Button asChild variant="outline">
            <Link to="/proyectos">
              <ArrowLeft />
              Proyectos I+D+I
            </Link>
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <select
          className="app-select"
          aria-label="Estado de los proyectos"
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoIngresosProyectos)}
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
          label="Proyectos"
          value={r.proyectos}
          icon={FolderKanban}
          hint={r.sinValor ? `${r.sinValor} sin valor pactado` : "Todos con valor pactado"}
        />
        <StatCard
          label="Valor promedio por proyecto"
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
              ? "Salidas de inventario a estos proyectos"
              : "Aún no hay salidas asociadas"
          }
        />
      </div>

      <section
        data-testid="ingresos-proyectos-por-tipo"
        aria-label="Ingresos por tipo de proyecto"
        className="mb-5 rounded-xl border bg-card p-5 shadow-soft"
      >
        <h3 className="font-semibold">Por tipo de proyecto</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Ordenado por ingresos; «Sin tipo» agrupa los proyectos que aún no se han clasificado (el
          tipo se elige en el formulario del proyecto). «Margen sobre materiales» resta solo el
          material que salió del inventario hacia el proyecto.
        </p>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo de proyecto</th>
                <th>Proyectos</th>
                <th>Ingresos</th>
                <th>% de ingresos</th>
                <th>Promedio</th>
                <th>Materiales</th>
                <th>Margen sobre materiales</th>
              </tr>
            </thead>
            <tbody>
              {r.porTipo.map((f) => (
                <tr key={f.tipo} data-testid={`tipo-proyecto-${f.tipo}`}>
                  <td className="font-medium">
                    {f.tipo === "sin_tipo" ? "Sin tipo" : ROTULO_TIPO_PROYECTO[f.tipo]}
                  </td>
                  <td>{f.proyectos}</td>
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
                    No hay proyectos con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sinTipo && sinTipo.proyectos === r.proyectos && (
          <p className="mt-3 text-xs text-muted-foreground">
            Ningún proyecto tiene tipo todavía: clasifícalos desde el formulario de cada proyecto
            (Software, IoT, Monitoreo o Automatización).
          </p>
        )}
      </section>

      <section
        data-testid="ingresos-proyectos-por-sector"
        aria-label="Proyectos e ingresos por sector"
        className="mb-5 rounded-xl border bg-card p-5 shadow-soft"
      >
        <h3 className="font-semibold">Por sector del cliente</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Ordenado por proyectos solicitados: los sectores que más piden.
        </p>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sector</th>
                <th>Proyectos</th>
                <th>% de proyectos</th>
                <th>Clientes</th>
                <th>Ingresos</th>
                <th>% de ingresos</th>
                <th>Promedio</th>
              </tr>
            </thead>
            <tbody>
              {r.porSector.map((f) => (
                <tr key={f.sector} data-testid={`sector-proyecto-${f.sector}`}>
                  <td className="font-medium">{capitalizar(f.sector)}</td>
                  <td>{f.proyectos}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Barra pct={f.pctProyectos} color="var(--warning)" />
                      <span className="text-xs text-muted-foreground">
                        {fmtPct(f.pctProyectos)}
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
                    No hay proyectos con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p
        data-testid="nota-ingresos-proyectos"
        className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
      >
        El ingreso es el valor pactado de cada proyecto, informativo y de gestión interna; la
        facturación y la contabilidad se llevan en Alegra. Los proyectos sin valor pactado no suman
        ingresos y los dados de baja no cuentan. Los materiales cuentan solo si la salida del
        inventario se asoció al proyecto. Los ingresos de los servicios técnicos están en su propia
        pantalla.
      </p>
    </>
  );
}
