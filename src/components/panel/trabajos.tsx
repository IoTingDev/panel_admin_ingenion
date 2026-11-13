import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Columns3,
  Pencil,
  Plus,
  Table2,
  Trash2,
  Wrench,
} from "lucide-react";
import { api, type EstadoTrabajo, type TrabajoTecnico } from "@/lib/api";
import {
  useAuditoria,
  useApiMutation,
  useClientes,
  useMovimientos,
  useTrabajos,
} from "@/hooks/use-api";
import {
  ESTADOS_TRABAJO,
  ROTULO_ESTADO_TRABAJO,
  ROTULO_TIPO_TRABAJO,
  TIPOS_TRABAJO,
} from "@/lib/dominio";
import { fmtCop, fmtFecha, fmtFechaHora } from "@/lib/format";
import { materialDeDestino } from "@/lib/material";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, IconBox, StatusBadge, EmptyState } from "./common";
import { DataFrame, SearchInput, FilterSelect, usePagination, Loading } from "./data-tools";
import { TrabajoSheet } from "./trabajo-sheet";
import { ConfirmDialog, type ConfirmState } from "./confirm-dialog";
import { useUi } from "./ui-context";

const Estado = ({ t }: { t: Pick<TrabajoTecnico, "estado"> }) => (
  <StatusBadge estado={t.estado} label={ROTULO_ESTADO_TRABAJO[t.estado]} />
);

/** Mover un servicio técnico de estado: cancelar pide motivo; lo demás es directo. */
function useCambioEstado(setConfirm: (c: ConfirmState | null) => void) {
  const cambiar = useApiMutation(
    ({ id, estado, motivo }: { id: string; estado: EstadoTrabajo; motivo?: string }) =>
      api.trabajos.cambiarEstado(id, estado, motivo),
    "Estado actualizado",
  );
  return (t: Pick<TrabajoTecnico, "id" | "codigo">, estado: EstadoTrabajo) => {
    if (estado === "cancelado")
      setConfirm({
        title: `Cancelar ${t.codigo}`,
        description:
          "El servicio técnico queda cancelado y no admite más material. Queda en auditoría.",
        confirmLabel: "Cancelar servicio técnico",
        destructive: true,
        onConfirm: (motivo) => cambiar.mutateAsync({ id: t.id, estado, motivo }),
      });
    else cambiar.mutate({ id: t.id, estado });
  };
}

export function TrabajosView({ clienteId = "" }: { clienteId?: string }) {
  const { data: trabajos = [], isLoading } = useTrabajos();
  const { data: clientes = [] } = useClientes();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [cl, setCl] = useState(clienteId);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [board, setBoard] = useState(false);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const mover = useCambioEstado(setConfirm);
  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.razonSocial ?? "—";
  const rows = trabajos.filter(
    (t) =>
      (!cl || t.clienteId === cl) &&
      (!tipo || t.tipo === tipo) &&
      (!estado || t.estado === estado) &&
      (!desde || (!!t.fechaProgramada && t.fechaProgramada.slice(0, 10) >= desde)) &&
      (!hasta || (!!t.fechaProgramada && t.fechaProgramada.slice(0, 10) <= hasta)) &&
      `${t.codigo} ${t.titulo}`.toLowerCase().includes(q.toLowerCase()),
  );
  const pg = usePagination(rows);
  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader
        eyebrow="Gestión"
        title="Servicios técnicos"
        subtitle="CCTV, alarmas, telecomunicaciones, mantenimiento e instalación."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus />
            Nuevo servicio técnico
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar código o título…" />
        <FilterSelect
          label="Todos los tipos"
          value={tipo}
          onChange={setTipo}
          options={TIPOS_TRABAJO.map((t) => ({ value: t, label: ROTULO_TIPO_TRABAJO[t] }))}
        />
        <FilterSelect
          label="Todos los estados"
          value={estado}
          onChange={setEstado}
          options={ESTADOS_TRABAJO.map((e) => ({ value: e, label: ROTULO_ESTADO_TRABAJO[e] }))}
        />
        {!clienteId && (
          <FilterSelect
            label="Todos los clientes"
            value={cl}
            onChange={setCl}
            options={clientes.map((c) => ({ value: c.id, label: c.razonSocial }))}
          />
        )}
        <Input
          type="date"
          aria-label="Programado desde"
          className="w-40"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
        />
        <Input
          type="date"
          aria-label="Programado hasta"
          className="w-40"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
        />
        <div className="flex rounded-md border">
          <Button
            title="Vista tabla"
            variant={board ? "ghost" : "secondary"}
            size="icon"
            onClick={() => setBoard(false)}
          >
            <Table2 />
          </Button>
          <Button
            title="Vista tablero"
            variant={board ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setBoard(true)}
          >
            <Columns3 />
          </Button>
        </div>
      </div>
      {board ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ESTADOS_TRABAJO.map((s) => (
            <section
              key={s}
              data-columna={s}
              className="min-h-80 min-w-0 bg-muted/60 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const t = trabajos.find((x) => x.id === drag);
                if (t && t.estado !== s) mover(t, s);
                setDrag("");
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <StatusBadge estado={s} label={ROTULO_ESTADO_TRABAJO[s]} />
                <span className="text-xs text-muted-foreground">
                  {rows.filter((t) => t.estado === s).length}
                </span>
              </div>
              {rows
                .filter((t) => t.estado === s)
                .map((t) => (
                  <article
                    key={t.id}
                    draggable
                    onDragStart={() => setDrag(t.id)}
                    className="mb-3 cursor-grab rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <p className="code-id text-xs">{t.codigo}</p>
                    <Link
                      to="/servicios-tecnicos/$id"
                      params={{ id: t.id }}
                      className="font-display text-sm font-semibold hover:text-primary"
                    >
                      {t.titulo}
                    </Link>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {nombreCliente(t.clienteId)} · {ROTULO_TIPO_TRABAJO[t.tipo]}
                    </p>
                    <select
                      aria-label={`Estado de ${t.codigo}`}
                      className="app-select mt-3 w-full"
                      value={t.estado}
                      onChange={(e) => mover(t, e.target.value as EstadoTrabajo)}
                    >
                      {ESTADOS_TRABAJO.map((st) => (
                        <option key={st} value={st}>
                          {ROTULO_ESTADO_TRABAJO[st]}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <DataFrame footer={pg.footer}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Servicio</th>
                <th>Cliente</th>
                <th>Responsable</th>
                <th>Estado</th>
                <th>Programado</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((t) => (
                <tr key={t.id}>
                  <td className="code-id whitespace-nowrap">{t.codigo}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <IconBox icon={Wrench} />
                      <div>
                        <Link
                          className="font-semibold hover:text-primary"
                          to="/servicios-tecnicos/$id"
                          params={{ id: t.id }}
                        >
                          {t.titulo}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ROTULO_TIPO_TRABAJO[t.tipo]}
                          {t.ciudad ? ` · ${t.ciudad}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>{nombreCliente(t.clienteId)}</td>
                  <td>{t.responsable || "—"}</td>
                  <td>
                    <Estado t={t} />
                  </td>
                  <td className="whitespace-nowrap">{fmtFecha(t.fechaProgramada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <EmptyState icon={Wrench} title="No se encontraron servicios técnicos" />
          )}
        </DataFrame>
      )}
      <TrabajoSheet open={open} onClose={() => setOpen(false)} clienteId={clienteId} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

export function TrabajoDetail({ id }: { id: string }) {
  const { data: trabajos = [], isLoading } = useTrabajos();
  const { data: clientes = [] } = useClientes();
  const { data: movs = [] } = useMovimientos();
  const { data: auditoria = [] } = useAuditoria();
  const t = trabajos.find((x) => x.id === id);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { openMovimiento } = useUi();
  const navigate = useNavigate();
  const mover = useCambioEstado(setConfirm);
  const eliminar = useApiMutation(
    (motivo: string) => api.trabajos.eliminar(id, motivo),
    "Servicio técnico eliminado",
  );
  if (isLoading) return <Loading />;
  if (!t) return <EmptyState icon={Wrench} title="Servicio técnico no encontrado" />;
  const cliente = clientes.find((c) => c.id === t.clienteId);
  const material = materialDeDestino(movs, "trabajo", t.id);
  const askEliminar = () =>
    setConfirm({
      title: `Eliminar ${t.codigo}`,
      description:
        "Se elimina definitivamente. Los movimientos de inventario hacia este servicio técnico se conservan con su nombre. El código no se reutiliza. Queda en auditoría.",
      confirmLabel: "Eliminar",
      destructive: true,
      onConfirm: async (motivo) => {
        await eliminar.mutateAsync(motivo);
        await navigate({ to: "/servicios-tecnicos" });
      },
    });
  const dato = (label: string, valor: string | undefined) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">{valor || "—"}</dd>
    </div>
  );
  return (
    <>
      <Button asChild variant="link" className="mb-4 px-0">
        <Link to="/servicios-tecnicos">
          <ArrowLeft />
          Servicios técnicos
        </Link>
      </Button>
      <PageHeader
        eyebrow={`Gestión / Servicios técnicos · ${t.codigo}`}
        title={t.titulo}
        subtitle={cliente?.razonSocial}
        actions={
          <>
            <Estado t={t} />
            <select
              aria-label="Estado del servicio técnico"
              className="app-select"
              value={t.estado}
              onChange={(e) => mover(t, e.target.value as EstadoTrabajo)}
            >
              {ESTADOS_TRABAJO.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_ESTADO_TRABAJO[s]}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => setEdit(true)}>
              <Pencil />
              Editar
            </Button>
            <Button variant="destructive" onClick={askEliminar}>
              <Trash2 />
              Eliminar
            </Button>
          </>
        }
      />
      <Tabs defaultValue="resumen">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="materiales">Materiales usados</TabsTrigger>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen">
          <div className="detail-grid py-6">
            <section>
              <h3 className="mb-4 font-semibold">Descripción</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t.descripcion || "Sin descripción registrada."}
              </p>
              {t.notas && <p className="mt-4 text-sm">{t.notas}</p>}
              {t.motivoCancelacion && (
                <p className="mt-4 text-sm text-destructive">Cancelado: {t.motivoCancelacion}</p>
              )}
            </section>
            <dl className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Cliente</dt>
                <dd className="mt-1">
                  <Link to="/clientes/$id" params={{ id: t.clienteId }} className="text-primary">
                    {cliente?.razonSocial}
                  </Link>
                </dd>
              </div>
              {dato("Tipo", ROTULO_TIPO_TRABAJO[t.tipo])}
              {dato("Sitio", [t.sitioDireccion, t.ciudad].filter(Boolean).join(", "))}
              {dato("Responsable", t.responsable)}
              {dato("Programado", t.fechaProgramada ? fmtFecha(t.fechaProgramada) : undefined)}
              {dato("Inicio", t.fechaInicio ? fmtFecha(t.fechaInicio) : undefined)}
              {dato("Fin", t.fechaFin ? fmtFecha(t.fechaFin) : undefined)}
              {dato(
                "Valor pactado",
                t.valorPactado === undefined ? undefined : fmtCop(t.valorPactado),
              )}
            </dl>
          </div>
        </TabsContent>
        <TabsContent value="materiales">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div data-testid="costo-material" className="text-sm">
              <span className="text-muted-foreground">Costo del material: </span>
              <strong data-testid="costo-material-valor">{fmtCop(material.costoTotal)}</strong>
              {material.sinCosto > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({material.sinCosto} salida(s) sin valor no suman)
                </span>
              )}
            </div>
            <Button
              disabled={t.estado === "cancelado"}
              onClick={() =>
                openMovimiento({ destino: { tipo: "trabajo", id: t.id }, tipo: "Salida" })
              }
            >
              <ArrowUpRight />
              Registrar material usado
            </Button>
          </div>
          <DataFrame>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>SKU</th>
                  <th>Cantidad</th>
                  <th>Costo</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {material.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtFechaHora(m.fecha)}</td>
                    <td>
                      <Link className="code-id" to="/inventario/$sku" params={{ sku: m.sku }}>
                        {m.sku}
                      </Link>
                    </td>
                    <td>{m.cantidad}</td>
                    <td>{m.costoAlSalir == null ? "—" : fmtCop(m.cantidad * m.costoAlSalir)}</td>
                    <td>{m.nota || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!material.movimientos.length && (
              <EmptyState icon={Wrench} title="Sin material registrado" />
            )}
          </DataFrame>
        </TabsContent>
        <TabsContent value="actividad">
          {auditoria
            .filter((a) => a.entidadId === id)
            .map((a) => (
              <div key={a.id} className="border-b py-4 text-sm">
                <p className="font-medium">{a.accion}</p>
                <p className="mt-1 text-xs text-muted-foreground">{a.detalle}</p>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {fmtFechaHora(a.fecha)} · {a.actor}
                </p>
              </div>
            ))}
        </TabsContent>
      </Tabs>
      <TrabajoSheet open={edit} onClose={() => setEdit(false)} trabajo={t} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
