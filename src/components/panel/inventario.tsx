import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  Package,
  AlertTriangle,
  ArrowLeftRight,
  Plus,
  FileSpreadsheet,
  FileText,
  FileJson,
  Upload,
  Trash2,
  ArrowLeft,
  Coins,
} from "lucide-react";
import { api, type ItemInventario, type GrupoInventario, type EstadoItem } from "@/lib/api";
import {
  useConfiguracion,
  useItems,
  useMovimientos,
  useProyectos,
  useApiMutation,
} from "@/hooks/use-api";
import { stockMap, esStockBajo, siguienteSku } from "@/lib/inventario";
import { GRUPOS as ORDEN_GRUPOS, ROTULO_GRUPO } from "@/lib/config-inventario";
import { fmtCop } from "@/lib/format";
import { exportInventory, download } from "@/lib/export";
import { validateCsv, type ImportRow } from "@/lib/import-movements";
import { fmtFechaHora, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PageHeader, StatCard, StatusBadge, LowPill, IconBox, EmptyState } from "./common";
import {
  DataFrame,
  SearchInput,
  FilterSelect,
  usePagination,
  SortHead,
  Loading,
} from "./data-tools";
import { ConfirmDialog, type ConfirmState } from "./confirm-dialog";
import { NuevoItemSheet } from "./nuevo-item-sheet";
import { useUi } from "./ui-context";

/**
 * Con movimientos el ítem no se elimina (dejaría el historial huérfano): se da de baja.
 * Sin movimientos se elimina definitivamente. En ambos casos con motivo y auditoría.
 */
function estadoRetiro(
  item: Pick<ItemInventario, "sku" | "descripcion">,
  conMovimientos: boolean,
  darBaja: (motivo: string) => Promise<unknown>,
  eliminar: (motivo: string) => Promise<unknown>,
): ConfirmState {
  return conMovimientos
    ? {
        title: `Dar de baja ${item.sku}`,
        description: `"${item.descripcion}" tiene movimientos: no se elimina. Sale de los listados y del valor del inventario, y conserva su historial.`,
        confirmLabel: "Dar de baja",
        destructive: true,
        onConfirm: (motivo) => darBaja(motivo) as Promise<void>,
      }
    : {
        title: `Eliminar ${item.sku}`,
        description: `Se eliminará "${item.descripcion}" del inventario. No tiene movimientos. Queda en auditoría.`,
        confirmLabel: "Eliminar",
        destructive: true,
        onConfirm: (motivo) => eliminar(motivo) as Promise<void>,
      };
}

const ESTADOS: EstadoItem[] = ["Disponible", "En uso", "En reparación", "Dañado", "Baja"];
/** «Baja» solo se alcanza con la acción «Dar de baja» (exige motivo y deja auditoría). */
const estadosEditables = (actual: EstadoItem) =>
  actual === "Baja" ? ESTADOS : ESTADOS.filter((e) => e !== "Baja");
const GRUPOS: { v: GrupoInventario; l: string }[] = ORDEN_GRUPOS.map((v) => ({
  v,
  l: ROTULO_GRUPO[v],
}));

export function InventarioView() {
  const { data: items = [], isLoading } = useItems();
  const { data: movs = [] } = useMovimientos();
  const { openMovimiento } = useUi();
  const [grupo, setGrupo] = useState<GrupoInventario>("componentes");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [est, setEst] = useState("");
  const [ubi, setUbi] = useState("");
  const [sortStock, setSortStock] = useState<0 | 1 | -1>(0);
  const [nuevo, setNuevo] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const stocks = useMemo(() => stockMap(items, movs), [items, movs]);
  const skusConMovs = useMemo(() => new Set(movs.map((m) => m.sku)), [movs]);
  const tieneMovs = (sku: string) => skusConMovs.has(sku);
  const upd = useApiMutation(
    ({ sku, data }: { sku: string; data: Partial<ItemInventario> }) =>
      api.inventario.updateItem(sku, data),
    "Ítem actualizado",
  );
  const del = useApiMutation(
    ({ sku, motivo }: { sku: string; motivo: string }) => api.inventario.deleteItem(sku, motivo),
    "Ítem eliminado",
  );
  const baja = useApiMutation(
    ({ sku, motivo }: { sku: string; motivo: string }) => api.inventario.darDeBaja(sku, motivo),
    "Ítem dado de baja",
  );
  const { data: config } = useConfiguracion();
  const categoriasDelGrupo = config?.inventario.categorias[grupo] ?? [];
  const delGrupoTodos = items.filter((i) => i.grupo === grupo);
  // Los ítems dados de baja salen de listados y cifras; solo reaparecen al filtrar por «Baja».
  const delGrupo = delGrupoTodos.filter((i) => i.estado !== "Baja");
  let rows = (est === "Baja" ? delGrupoTodos : delGrupo).filter(
    (i) =>
      (!cat || i.categoria === cat) &&
      (!sub || i.subcategoria === sub) &&
      (!est || i.estado === est) &&
      (!ubi || (ubi === "(sin ubicación)" ? !i.ubicacion : i.ubicacion === ubi)) &&
      `${i.sku} ${i.descripcion} ${i.marca_referencia}`.toLowerCase().includes(q.toLowerCase()),
  );
  if (sortStock)
    rows = [...rows].sort(
      (a, b) => ((stocks.get(a.sku) ?? 0) - (stocks.get(b.sku) ?? 0)) * sortStock,
    );
  const pg = usePagination(rows, 12);
  const bajos = delGrupo.filter((i) => esStockBajo(stocks.get(i.sku) ?? 0, i.stock_minimo)).length;
  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader
        eyebrow="Gestión"
        title="Inventario"
        subtitle="Componentes, herramientas, equipos y material de seguridad y telecom."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/inventario/valor">
                <Coins />
                Valor del inventario
              </Link>
            </Button>
            <Button variant="outline" onClick={() => exportInventory(rows, stocks, "excel")}>
              <FileSpreadsheet />
              Excel
            </Button>
            <Button variant="outline" onClick={() => exportInventory(rows, stocks, "pdf")}>
              <FileText />
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={async () =>
                download(
                  JSON.stringify(await api.inventario.exportar(), null, 2),
                  "inventario_ioting.json",
                  "application/json",
                )
              }
            >
              <FileJson />
              JSON
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload />
              Importar CSV
            </Button>
            <Button variant="outline" onClick={() => setNuevo(true)}>
              <Plus />
              Nuevo ítem
            </Button>
            <Button onClick={() => openMovimiento()}>
              <ArrowLeftRight />
              Registrar movimiento
            </Button>
          </>
        }
      />
      <Tabs
        value={grupo}
        onValueChange={(v) => {
          setGrupo(v as GrupoInventario);
          setCat("");
          setSub("");
        }}
      >
        <TabsList className="mb-5 max-w-full justify-start overflow-x-auto">
          {GRUPOS.map((g) => (
            <TabsTrigger key={g.v} value={g.v}>
              {g.l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Referencias" value={delGrupo.length} icon={Boxes} />
        <StatCard
          label="Unidades en stock"
          value={fmtNum(delGrupo.reduce((s, i) => s + (stocks.get(i.sku) ?? 0), 0))}
          icon={Package}
          tone="info"
        />
        <StatCard
          label="Ítems por reponer"
          value={bajos}
          icon={AlertTriangle}
          tone={bajos ? "destructive" : "success"}
        />
      </div>
      <div className="mb-5 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar SKU, descripción o marca…" />
        <FilterSelect
          label="Categoría"
          value={cat}
          onChange={(v) => {
            setCat(v);
            setSub("");
          }}
          options={categoriasDelGrupo}
        />
        <FilterSelect
          label="Subcategoría"
          value={sub}
          onChange={setSub}
          options={[
            ...new Set(
              delGrupo.filter((i) => !cat || i.categoria === cat).map((i) => i.subcategoria),
            ),
          ]}
        />
        <FilterSelect label="Estado" value={est} onChange={setEst} options={ESTADOS} />
        <FilterSelect
          label="Ubicación"
          value={ubi}
          onChange={setUbi}
          options={[
            "(sin ubicación)",
            ...new Set(delGrupo.map((i) => i.ubicacion).filter(Boolean)),
          ]}
        />
      </div>
      <DataFrame footer={pg.footer}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ítem</th>
              <th>SKU</th>
              <th>Categoría</th>
              <th>
                <SortHead onClick={() => setSortStock(sortStock === 1 ? -1 : 1)}>Stock</SortHead>
              </th>
              <th>Estado</th>
              <th>Ubicación</th>
              <th>Mínimo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((i) => {
              const s = stocks.get(i.sku) ?? 0;
              return (
                <tr key={i.sku}>
                  <td>
                    <div className="flex items-center gap-3">
                      <IconBox icon={Package} />
                      <div className="min-w-0">
                        <Link
                          to="/inventario/$sku"
                          params={{ sku: i.sku }}
                          className="font-semibold hover:text-primary"
                        >
                          {i.descripcion}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">{i.marca_referencia}</p>
                      </div>
                    </div>
                  </td>
                  <td className="code-id whitespace-nowrap">{i.sku}</td>
                  <td>
                    <p>{i.categoria}</p>
                    <p className="text-xs text-muted-foreground">{i.subcategoria}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="font-display text-base font-semibold">{s}</span>{" "}
                    <span className="text-xs text-muted-foreground">{i.unidad}</span>{" "}
                    {esStockBajo(s, i.stock_minimo) && <LowPill />}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {i.valorUnitario == null ? "Sin valor" : fmtCop(i.valorUnitario)}
                    </p>
                  </td>
                  <td>
                    <select
                      aria-label={`Estado de ${i.sku}`}
                      className="app-select"
                      value={i.estado}
                      onChange={(e) =>
                        upd.mutate({ sku: i.sku, data: { estado: e.target.value as EstadoItem } })
                      }
                    >
                      {estadosEditables(i.estado).map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Input
                      aria-label={`Ubicación de ${i.sku}`}
                      className="h-8 w-32"
                      defaultValue={i.ubicacion}
                      placeholder="—"
                      onBlur={(e) =>
                        e.target.value !== i.ubicacion &&
                        upd.mutate({ sku: i.sku, data: { ubicacion: e.target.value } })
                      }
                    />
                  </td>
                  <td>
                    <Input
                      aria-label={`Mínimo de ${i.sku}`}
                      type="number"
                      min="0"
                      className="h-8 w-20"
                      defaultValue={i.stock_minimo ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        const v =
                          e.target.value === ""
                            ? null
                            : Math.max(0, Math.floor(Number(e.target.value)));
                        if (v !== i.stock_minimo)
                          upd.mutate({ sku: i.sku, data: { stock_minimo: v } });
                      }}
                    />
                  </td>
                  <td>
                    <div className="flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Registrar movimiento"
                        onClick={() => openMovimiento({ sku: i.sku })}
                      >
                        <ArrowLeftRight />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={tieneMovs(i.sku) ? "Dar de baja" : "Eliminar"}
                        onClick={() =>
                          setConfirm(
                            estadoRetiro(
                              i,
                              tieneMovs(i.sku),
                              (motivo) => baja.mutateAsync({ sku: i.sku, motivo }),
                              (motivo) => del.mutateAsync({ sku: i.sku, motivo }),
                            ),
                          )
                        }
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <EmptyState icon={Boxes} title="Sin ítems para estos filtros" />}
      </DataFrame>
      <NuevoItemSheet open={nuevo} onClose={() => setNuevo(false)} grupo={grupo} items={items} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: items = [] } = useItems();
  const { data: movs = [] } = useMovimientos();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [err, setErr] = useState("");
  const imp = useApiMutation(
    api.inventario.importarMovimientos,
    (n) => `${n} movimientos importados`,
  );
  const close = () => {
    setRows([]);
    setErr("");
    onClose();
  };
  const valid = rows.length > 0 && rows.every((r) => !r.error);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar movimientos</DialogTitle>
          <DialogDescription>
            CSV con columnas: fecha, sku, tipo, cantidad, proyecto, nota.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".csv,text/csv"
          aria-label="Archivo CSV"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              setErr("");
              setRows(validateCsv(await file.text(), items, movs));
            } catch (x) {
              setErr((x as Error).message);
              setRows([]);
            }
          }}
        />
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
        {rows.length > 0 && (
          <div className="max-h-72 overflow-auto rounded border">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>SKU</th>
                  <th>Tipo</th>
                  <th>Cant.</th>
                  <th>Validación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td className="code-id">{r.data.sku}</td>
                    <td>{r.data.tipo}</td>
                    <td>{r.data.cantidad}</td>
                    <td className={r.error ? "text-destructive" : "text-success"}>
                      {r.error || "OK"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            disabled={!valid || imp.isPending}
            onClick={async () => {
              await imp.mutateAsync(rows.map((r) => r.data));
              close();
            }}
          >
            Confirmar importación
          </Button>
        </div>
        {rows.length > 0 && !valid && (
          <p className="text-xs text-muted-foreground">
            Corrija las filas con error antes de confirmar.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ItemDetail({ sku }: { sku: string }) {
  const { data: items = [], isLoading } = useItems();
  const { data: movs = [] } = useMovimientos();
  const { openMovimiento } = useUi();
  const navigate = useNavigate();
  const { data: config } = useConfiguracion();
  const { data: proyectos = [] } = useProyectos();
  const item = items.find((i) => i.sku === sku);
  const [tipo, setTipo] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const upd = useApiMutation(
    (data: Partial<ItemInventario>) => api.inventario.updateItem(sku, data),
    "Ítem actualizado",
  );
  const del = useApiMutation(
    (motivo: string) => api.inventario.deleteItem(sku, motivo),
    "Ítem eliminado",
  );
  const baja = useApiMutation(
    (motivo: string) => api.inventario.darDeBaja(sku, motivo),
    "Ítem dado de baja",
  );
  if (isLoading) return <Loading />;
  if (!item)
    return (
      <EmptyState
        icon={Boxes}
        title="Ítem no encontrado"
        action={
          <Button asChild variant="outline">
            <Link to="/inventario">Volver al inventario</Link>
          </Button>
        }
      />
    );
  const stock = stockMap([item], movs).get(sku) ?? 0;
  const hist = movs
    .filter((m) => m.sku === sku && (!tipo || m.tipo === tipo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  /** Campo numérico opcional: vacío = sin dato (null). */
  const campoNum = (
    k: "valorUnitario" | "anioCompra" | "vidaUtilAnios",
    label: string,
    placeholder = "Sin dato",
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`d-${k}`}>{label}</Label>
      <Input
        key={String(item[k] ?? "")}
        id={`d-${k}`}
        type="number"
        min="0"
        step="1"
        placeholder={placeholder}
        defaultValue={item[k] ?? ""}
        onBlur={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          if (v !== (item[k] ?? null)) upd.mutate({ [k]: v });
        }}
      />
    </div>
  );
  const field = (
    k: "descripcion" | "marca_referencia" | "subcategoria" | "ubicacion" | "notas",
    label: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`d-${k}`}>{label}</Label>
      <Input
        id={`d-${k}`}
        defaultValue={item[k]}
        onBlur={(e) => e.target.value !== item[k] && upd.mutate({ [k]: e.target.value })}
      />
    </div>
  );
  return (
    <>
      <Button asChild variant="link" className="mb-4 px-0">
        <Link to="/inventario">
          <ArrowLeft />
          Inventario
        </Link>
      </Button>
      <PageHeader
        eyebrow={`Inventario / ${item.categoria}`}
        title={item.descripcion}
        subtitle={`${item.sku} · ${item.marca_referencia}`}
        actions={
          <>
            <Button onClick={() => openMovimiento({ sku })}>
              <ArrowLeftRight />
              Registrar movimiento
            </Button>
            {item.estado !== "Baja" && (
              <Button
                variant="destructive"
                onClick={() =>
                  setConfirm(
                    estadoRetiro(
                      item,
                      movs.some((m) => m.sku === sku),
                      async (m) => {
                        await baja.mutateAsync(m);
                      },
                      async (m) => {
                        await del.mutateAsync(m);
                        await navigate({ to: "/inventario" });
                      },
                    ),
                  )
                }
              >
                <Trash2 />
                {movs.some((m) => m.sku === sku) ? "Dar de baja" : "Eliminar"}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Stock actual"
          value={
            <>
              {stock} {esStockBajo(stock, item.stock_minimo) && <LowPill />}
            </>
          }
          icon={Package}
          hint={`Inicial ${item.cantidad_inicial} ${item.unidad}`}
        />
        <StatCard
          label="Movimientos"
          value={movs.filter((m) => m.sku === sku).length}
          icon={ArrowLeftRight}
          tone="info"
        />
        <div className="rounded-xl border bg-card p-5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Estado
          </p>
          <div className="mt-3">
            <StatusBadge estado={item.estado} />
          </div>
        </div>
      </div>
      <div className="detail-grid mb-8">
        <div className="space-y-3">
          {field("descripcion", "Descripción")}
          {field("marca_referencia", "Marca / referencia")}
          {field("subcategoria", "Subcategoría")}
        </div>
        <div className="space-y-3">
          {field("ubicacion", "Ubicación")}
          <div className="space-y-2">
            <Label htmlFor="d-estado">Estado</Label>
            <select
              id="d-estado"
              className="app-select w-full"
              value={item.estado}
              onChange={(e) => upd.mutate({ estado: e.target.value as EstadoItem })}
            >
              {estadosEditables(item.estado).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-min">Stock mínimo</Label>
            <Input
              id="d-min"
              type="number"
              min="0"
              defaultValue={item.stock_minimo ?? ""}
              onBlur={(e) => {
                const v =
                  e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value)));
                if (v !== item.stock_minimo) upd.mutate({ stock_minimo: v });
              }}
            />
          </div>
          {field("notas", "Notas")}
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:col-span-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="d-categoria">Categoría</Label>
            <select
              id="d-categoria"
              className="app-select w-full"
              value={`${item.grupo}|${item.categoria}`}
              onChange={(e) => {
                const [grupo, categoria] = e.target.value.split("|") as [GrupoInventario, string];
                upd.mutate({ grupo, categoria });
              }}
            >
              {ORDEN_GRUPOS.map((g) => (
                <optgroup key={g} label={ROTULO_GRUPO[g]}>
                  {(config?.inventario.categorias[g] ?? []).map((c) => (
                    <option key={c} value={`${g}|${c}`}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-cantidad_inicial">Cantidad inicial</Label>
            <Input
              key={item.cantidad_inicial}
              id="d-cantidad_inicial"
              type="number"
              min="0"
              step="1"
              defaultValue={item.cantidad_inicial}
              onBlur={(e) => {
                const v = Math.max(0, Math.floor(Number(e.target.value)));
                if (v !== item.cantidad_inicial) upd.mutate({ cantidad_inicial: v });
              }}
            />
          </div>
          {campoNum("valorUnitario", "Valor unitario (COP)", "Sin valor")}
          {campoNum("anioCompra", "Año de compra")}
          {campoNum("vidaUtilAnios", "Vida útil (años)", "Según el grupo")}
          <div className="space-y-2">
            <Label htmlFor="d-proveedor">Proveedor</Label>
            <Input
              id="d-proveedor"
              defaultValue={item.proveedor ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (item.proveedor ?? ""))
                  upd.mutate({ proveedor: e.target.value || undefined });
              }}
            />
          </div>
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Historial de movimientos</h3>
        <FilterSelect
          label="Todos los tipos"
          value={tipo}
          onChange={setTipo}
          options={["Entrada", "Salida"]}
        />
      </div>
      <DataFrame>
        <table className="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Destino</th>
              <th>Costo unit.</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {hist.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{fmtFechaHora(m.fecha)}</td>
                <td>
                  <span className={m.tipo === "Entrada" ? "text-success" : "text-primary"}>
                    {m.tipo}
                  </span>
                </td>
                <td>{m.cantidad}</td>
                <td>
                  {m.destinoTipo === "proyecto"
                    ? (proyectos.find((p) => p.id === m.destinoId)?.nombre ?? m.proyecto ?? "—")
                    : m.proyecto || "—"}
                </td>
                <td>{m.costoUnitario == null ? "—" : fmtCop(m.costoUnitario)}</td>
                <td>{m.nota || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!hist.length && <EmptyState icon={ArrowLeftRight} title="Sin movimientos" />}
      </DataFrame>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
