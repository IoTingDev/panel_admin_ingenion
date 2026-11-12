import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Banknote,
  Download,
  FileSpreadsheet,
  FileText,
  PiggyBank,
  TrendingDown,
  Upload,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { api, type FilaValores, type GrupoInventario } from "@/lib/api";
import { useApiMutation, useConfiguracion, useItems, useMovimientos } from "@/hooks/use-api";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { GRUPOS, ROTULO_GRUPO } from "@/lib/config-inventario";
import { exportValor, NOTA_VALOR } from "@/lib/export";
import { fmtCop } from "@/lib/format";
import { parseCsvValores } from "@/lib/import-valores";
import {
  detalleValor,
  previsualizarValores,
  resumenValor,
  type FilaPrevia,
} from "@/lib/valoracion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, StatCard } from "./common";
import { FilterSelect, Loading } from "./data-tools";

const abreviado = (n: number) =>
  new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function ValorInventarioView() {
  const { data: items = [], isLoading } = useItems();
  const { data: movs = [] } = useMovimientos();
  const { data: config } = useConfiguracion();
  const animar = !useReducedMotion();
  const [grupo, setGrupo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [anio, setAnio] = useState("");
  const [importar, setImportar] = useState(false);
  const anioActual = new Date().getFullYear();

  const filtros = useMemo(
    () => ({
      grupo: (grupo || undefined) as GrupoInventario | undefined,
      categoria: categoria || undefined,
      anio: anio ? Number(anio) : undefined,
    }),
    [grupo, categoria, anio],
  );
  const params = config?.inventario.depreciacion;
  const resumen = useMemo(
    () => (params ? resumenValor({ items, movs, params, anioActual, filtros }) : null),
    [items, movs, params, anioActual, filtros],
  );
  if (isLoading || !config || !resumen || !params) return <Loading />;

  const categorias = grupo
    ? config.inventario.categorias[grupo as GrupoInventario]
    : GRUPOS.flatMap((g) => config.inventario.categorias[g]);
  const anios = [
    ...new Set(items.map((i) => i.anioCompra).filter((a): a is number => a != null)),
  ].sort((a, b) => b - a);
  const textoFiltros =
    [
      grupo && `grupo ${ROTULO_GRUPO[grupo as GrupoInventario]}`,
      categoria && `categoría ${categoria}`,
      anio && `año ${anio}`,
    ]
      .filter(Boolean)
      .join(", ") || "ninguno";
  const exportar = (type: "excel" | "pdf") =>
    exportValor({
      resumen,
      detalle: detalleValor({ items, movs, params, anioActual, filtros }),
      filtros: textoFiltros,
      type,
    });
  const porGrupo = GRUPOS.map((g) => ({
    grupo: g === "seguridad" ? "Seguridad" : ROTULO_GRUPO[g],
    "Existencia a costo": resumen.porGrupo[g].existencia,
    "Valor estimado": resumen.porGrupo[g].estimado,
  }));

  return (
    <>
      <Button asChild variant="link" className="mb-4 px-0">
        <Link to="/inventario">
          <ArrowLeft />
          Inventario
        </Link>
      </Button>
      <PageHeader
        eyebrow="Gestión / Inventario"
        title="Valor del inventario"
        subtitle={NOTA_VALOR}
        actions={
          <>
            <Button variant="outline" onClick={() => exportar("excel")}>
              <FileSpreadsheet />
              Excel
            </Button>
            <Button variant="outline" onClick={() => exportar("pdf")}>
              <FileText />
              PDF
            </Button>
            <Button variant="outline" asChild>
              <a href="/plantillas/plantilla_valores_inventario.csv" download>
                <Download />
                Plantilla CSV
              </a>
            </Button>
            <Button onClick={() => setImportar(true)}>
              <Upload />
              Importar valores
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <FilterSelect
          label="Grupo"
          value={grupo}
          onChange={(v) => {
            setGrupo(v);
            setCategoria("");
          }}
          options={GRUPOS.map((g) => ({ value: g, label: ROTULO_GRUPO[g] }))}
        />
        <FilterSelect
          label="Categoría"
          value={categoria}
          onChange={setCategoria}
          options={categorias}
        />
        <FilterSelect
          label="Año de compra"
          value={anio}
          onChange={setAnio}
          options={anios.map(String)}
        />
      </div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Invertido"
          value={<span data-testid="cifra-invertido">{fmtCop(resumen.invertido)}</span>}
          icon={Banknote}
          hint="Compras históricas; incluye lo ya consumido"
        />
        <StatCard
          label="Existencia a costo"
          value={<span data-testid="cifra-existencia">{fmtCop(resumen.existencia)}</span>}
          icon={PiggyBank}
          tone="info"
          hint="Stock actual × valor unitario"
        />
        <StatCard
          label="Valor estimado actual"
          value={<span data-testid="cifra-estimado">{fmtCop(resumen.estimado)}</span>}
          icon={TrendingDown}
          tone="success"
          hint={`Con depreciación lineal; residual ${params.residualPct} %`}
        />
      </div>
      <div
        role="status"
        data-testid="aviso-sin-valor"
        className={`mb-6 rounded-xl border p-4 text-sm ${
          resumen.sinValor === 0
            ? "border-success/30 bg-success/15"
            : "border-warning/30 bg-warning/15"
        }`}
      >
        {resumen.sinValor === 0 ? (
          <>Todos los ítems tienen valor: las cifras cubren {resumen.conValor} referencias.</>
        ) : (
          <>
            <strong>{resumen.sinValor}</strong> ítems <strong>sin valor</strong> quedan fuera de las
            cifras (hay {resumen.conValor} valorados). El total es un piso, no el valor completo:
            cargue los valores faltantes con «Importar valores».
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-semibold">Valor por grupo</h3>
          <div className="chart-wrap">
            <ResponsiveContainer>
              <BarChart data={porGrupo}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="grupo"
                  fontSize={10}
                  interval={0}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  fontSize={11}
                  width={44}
                  tickFormatter={abreviado}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip formatter={(v) => fmtCop(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="Existencia a costo"
                  fill="var(--primary)"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={animar}
                />
                <Bar
                  dataKey="Valor estimado"
                  fill="var(--primary-glow)"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={animar}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-semibold">Invertido por año de compra</h3>
          <div className="chart-wrap">
            {resumen.invertidoPorAnio.length === 0 ? (
              <p className="pt-10 text-center text-sm text-muted-foreground">
                Aún no hay compras con costo registradas.
              </p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={resumen.invertidoPorAnio}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="anio" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis
                    fontSize={11}
                    width={44}
                    tickFormatter={abreviado}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip formatter={(v) => fmtCop(Number(v))} />
                  <Bar
                    dataKey="valor"
                    name="Invertido"
                    fill="var(--primary)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={animar}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-semibold">Top 10 ítems por valor</h3>
          <div className="chart-wrap">
            {resumen.top10.length === 0 ? (
              <p className="pt-10 text-center text-sm text-muted-foreground">
                Ningún ítem tiene valor todavía.
              </p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={resumen.top10} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    fontSize={11}
                    tickFormatter={abreviado}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    type="category"
                    dataKey="sku"
                    interval={0}
                    fontSize={10}
                    width={58}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip
                    formatter={(v) => fmtCop(Number(v))}
                    labelFormatter={(sku) =>
                      resumen.top10.find((t) => t.sku === sku)?.descripcion ?? String(sku)
                    }
                  />
                  <Bar
                    dataKey="valor"
                    name="Existencia a costo"
                    fill="var(--primary)"
                    radius={[0, 6, 6, 0]}
                    isAnimationActive={animar}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
      <ImportarValoresDialog open={importar} onClose={() => setImportar(false)} />
    </>
  );
}

function ImportarValoresDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: items = [] } = useItems();
  const { data: movs = [] } = useMovimientos();
  const { data: config } = useConfiguracion();
  const [filas, setFilas] = useState<FilaValores[]>([]);
  const [err, setErr] = useState("");
  const imp = useApiMutation(
    api.inventario.importarValores,
    (r) => `${r.aplicadas} filas aplicadas`,
  );
  const previa: FilaPrevia[] = useMemo(
    () => (config ? previsualizarValores(items, movs, filas, config.inventario) : []),
    [items, movs, filas, config],
  );
  const conError = previa.filter((p) => p.error).length;
  const conCambios = previa.filter((p) => p.cambios.length > 0).length;
  const cerrar = () => {
    setFilas([]);
    setErr("");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar valores</DialogTitle>
          <DialogDescription>
            CSV con la plantilla: sku, grupo_propuesto, categoria_propuesta, cantidad_inicial,
            anio_compra, valor_unitario. Se aplica todo o nada. Las celdas de año o valor vacías no
            cambian lo que ya tiene el ítem.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".csv,text/csv"
          aria-label="Archivo de valores"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              setErr("");
              setFilas(parseCsvValores(await file.text()));
            } catch (x) {
              setErr((x as Error).message);
              setFilas([]);
            }
          }}
        />
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
        {previa.length > 0 && (
          <>
            <p className="text-sm" data-testid="resumen-previa">
              {previa.length} filas · {conCambios} con cambios · {conError} con error
            </p>
            <div className="max-h-72 overflow-auto rounded border">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>SKU</th>
                    <th>Cambios (antes → después)</th>
                    <th>Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {previa
                    .filter((p) => p.error || p.cambios.length > 0)
                    .map((p) => (
                      <tr key={p.fila}>
                        <td>{p.fila}</td>
                        <td className="code-id">{p.sku}</td>
                        <td className="text-xs">
                          {p.cambios
                            .map(
                              (c) => `${c.campo}: ${String(c.antes ?? "—")} → ${String(c.despues)}`,
                            )
                            .join(" · ") || "—"}
                        </td>
                        <td className={p.error ? "text-destructive" : "text-success"}>
                          {p.error || "OK"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            disabled={previa.length === 0 || conError > 0 || imp.isPending}
            onClick={async () => {
              if (conCambios === 0) {
                toast.info("No hay diferencias para aplicar.");
                return cerrar();
              }
              await imp.mutateAsync(filas);
              cerrar();
            }}
          >
            Confirmar importación
          </Button>
        </div>
        {previa.length > 0 && conError > 0 && (
          <p className="text-xs text-muted-foreground">
            Corrija las filas con error antes de confirmar: no se aplica nada a medias.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
