import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Plus,
  Pencil,
  Ban,
  Trash2,
  RotateCcw,
  ArrowLeft,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { api, type Cliente, type Estado, type HijosReactivables } from "@/lib/api";
import {
  useClientes,
  useUsuarios,
  useProyectos,
  useAuditoria,
  useApiMutation,
  useConfiguracion,
} from "@/hooks/use-api";
import { fmtFecha, fmtFechaHora } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, IconBox, StatusBadge, EmptyState } from "./common";
import {
  DataFrame,
  SearchInput,
  FilterSelect,
  usePagination,
  SortHead,
  Loading,
} from "./data-tools";
import { ClienteSheet } from "./cliente-sheet";
import { ReactivarHijosDialog } from "./reactivar-hijos";
import { ConfirmDialog, type ConfirmState } from "./confirm-dialog";
import { UsuariosView } from "./usuarios";
import { ProyectosView } from "./proyectos";
import { TrabajosView } from "./trabajos";

export function ClientesView({ nuevo = false }: { nuevo?: boolean }) {
  const { data: clientes = [], isLoading } = useClientes();
  const { data: usuarios = [] } = useUsuarios();
  const { data: proyectos = [] } = useProyectos();
  const { data: config } = useConfiguracion();
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState(false);
  const [edit, setEdit] = useState<Cliente | null>(null);
  const [open, setOpen] = useState(nuevo);
  useEffect(() => {
    if (nuevo) setOpen(true);
  }, [nuevo]);
  const rows = clientes
    .filter(
      (c) =>
        (!estado || c.estado === estado) &&
        (!sector || c.sector === sector) &&
        `${c.razonSocial} ${c.nit} ${c.ciudad}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort
        ? b.razonSocial.localeCompare(a.razonSocial)
        : a.razonSocial.localeCompare(b.razonSocial),
    );
  const pg = usePagination(rows);
  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader
        eyebrow="Gestión"
        title="Clientes"
        subtitle="Empresas que conectan su operación con IoTing."
        actions={
          <Button
            onClick={() => {
              setEdit(null);
              setOpen(true);
            }}
          >
            <Plus />
            Nuevo cliente
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar razón social, NIT o ciudad…"
        />
        <FilterSelect
          label="Todos los estados"
          value={estado}
          onChange={setEstado}
          options={["activo", "suspendido", "baja"]}
        />
        <FilterSelect
          label="Todos los sectores"
          value={sector}
          onChange={setSector}
          options={config?.sectores ?? []}
        />
      </div>
      <DataFrame footer={pg.footer}>
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <SortHead onClick={() => setSort(!sort)}>Razón social</SortHead>
              </th>
              <th>Sector</th>
              <th>Ciudad</th>
              <th>Usuarios</th>
              <th>Proyectos</th>
              <th>Estado</th>
              <th>Creado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <IconBox icon={Building2} />
                    <div>
                      <Link
                        className="font-semibold hover:text-primary"
                        to="/clientes/$id"
                        params={{ id: c.id }}
                      >
                        {c.razonSocial}
                      </Link>
                      <p className="code-id mt-1 text-[10px]">NIT {c.nit || "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="capitalize">{c.sector}</td>
                <td>{c.ciudad}</td>
                <td>
                  {usuarios.filter((u) => u.clienteId === c.id && u.estado !== "baja").length}
                </td>
                <td>
                  {proyectos.filter((p) => p.clienteId === c.id && p.estado !== "baja").length}
                </td>
                <td>
                  <StatusBadge estado={c.estado} />
                </td>
                <td className="whitespace-nowrap text-muted-foreground">{fmtFecha(c.creadoEn)}</td>
                <td>
                  <Button
                    title="Editar cliente"
                    aria-label={`Editar ${c.razonSocial}`}
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEdit(c);
                      setOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyState
            icon={Building2}
            title="No se encontraron clientes"
            text="Pruebe otros filtros."
          />
        )}
      </DataFrame>
      <ClienteSheet open={open} onClose={() => setOpen(false)} cliente={edit ?? undefined} />
    </>
  );
}
export function ClienteDetail({ id }: { id: string }) {
  const { data: clientes = [], isLoading } = useClientes();
  const { data: auditoria = [] } = useAuditoria();
  const c = clientes.find((x) => x.id === id);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [hijos, setHijos] = useState<HijosReactivables | null>(null);
  // El diálogo de hijos se abre cuando el de confirmación ya cerró (dos diálogos de Radix a la vez
  // dejan el segundo oculto a la accesibilidad).
  const [hijosPend, setHijosPend] = useState<HijosReactivables | null>(null);
  useEffect(() => {
    if (confirm || !hijosPend) return;
    const t = setTimeout(() => {
      setHijos(hijosPend);
      setHijosPend(null);
    }, 150);
    return () => clearTimeout(t);
  }, [confirm, hijosPend]);
  const mutation = useApiMutation(
    ({ estado, motivo }: { estado: Estado; motivo: string }) =>
      api.clientes.cambiarEstado(id, estado, motivo),
    "Estado actualizado",
  );
  const change = async (estado: Estado) => {
    const impact = await api.clientes.impactoBaja(id);
    setConfirm({
      title:
        estado === "baja"
          ? "Dar de baja cliente"
          : estado === "suspendido"
            ? "Suspender cliente"
            : "Reactivar cliente",
      description:
        estado === "baja"
          ? `Se darán de baja ${impact.usuarios} usuarios; ${impact.proyectos} proyectos pasarán a baja; ${impact.trabajos} trabajos abiertos se cancelarán. Los datos históricos se conservarán.`
          : "El estado del cliente cambiará. Esta acción queda registrada en auditoría.",
      confirmLabel: "Confirmar",
      destructive: estado === "baja",
      onConfirm: async (motivo) => {
        await mutation.mutateAsync({ estado, motivo });
        if (estado === "activo") {
          const h = await api.clientes.hijosReactivables(id);
          if (h.usuarios.length + h.proyectos.length + h.trabajos.length > 0) setHijosPend(h);
        }
      },
    });
  };
  if (isLoading) return <Loading />;
  if (!c) return <EmptyState icon={Building2} title="Cliente no encontrado" />;
  return (
    <>
      <Button asChild variant="link" className="mb-4 px-0">
        <Link to="/clientes">
          <ArrowLeft />
          Clientes
        </Link>
      </Button>
      <PageHeader
        eyebrow="Gestión / Clientes"
        title={c.razonSocial}
        subtitle={`NIT ${c.nit || "—"} · ${c.ciudad || "Sin ciudad"}`}
        actions={
          <>
            <StatusBadge estado={c.estado} />
            <Button variant="outline" onClick={() => setEdit(true)}>
              <Pencil />
              Editar
            </Button>
            {c.estado !== "activo" && (
              <Button variant="outline" onClick={() => change("activo")}>
                <RotateCcw />
                Reactivar
              </Button>
            )}
            {c.estado === "activo" && (
              <Button variant="outline" onClick={() => change("suspendido")}>
                <Ban />
                Suspender
              </Button>
            )}
            {c.estado !== "baja" && (
              <Button variant="destructive" onClick={() => change("baja")}>
                <Trash2 />
                Dar de baja
              </Button>
            )}
          </>
        }
      />
      <Tabs defaultValue="resumen">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="proyectos">Proyectos</TabsTrigger>
          <TabsTrigger value="trabajos">Trabajos técnicos</TabsTrigger>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
        </TabsList>
        <TabsContent value="resumen">
          <div className="detail-grid py-6">
            <section>
              <h3 className="mb-5 font-semibold">Información de la empresa</h3>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Sector</dt>
                  <dd className="mt-1 capitalize">{c.sector}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tipo de cliente</dt>
                  <dd className="mt-1 capitalize">{c.tipoCliente ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Dirección</dt>
                  <dd className="mt-1">{c.direccion || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ciudad</dt>
                  <dd className="mt-1 flex gap-2">
                    <MapPin className="size-4 text-primary" />
                    {c.ciudad || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cliente desde</dt>
                  <dd className="mt-1">{fmtFecha(c.creadoEn)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Notas</dt>
                  <dd className="mt-1">{c.notas || "Sin notas registradas."}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3 className="mb-5 font-semibold">Contacto principal</h3>
              <p className="mb-3 font-medium">{c.contactoNombre || "Sin contacto"}</p>
              <p className="mb-3 flex items-center gap-2 break-all text-sm">
                <Mail className="size-4 shrink-0 text-primary" />
                {c.contactoEmail || "—"}
              </p>
              <p className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-primary" />
                {c.contactoTelefono || "—"}
              </p>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="usuarios">
          <UsuariosView clienteId={id} />
        </TabsContent>
        <TabsContent value="proyectos">
          <ProyectosView clienteId={id} />
        </TabsContent>
        <TabsContent value="trabajos">
          <TrabajosView clienteId={id} />
        </TabsContent>
        <TabsContent value="actividad">
          <ActivityRows rows={auditoria.filter((a) => a.entidadId === id)} />
        </TabsContent>
      </Tabs>
      <ReactivarHijosDialog clienteId={id} hijos={hijos} onClose={() => setHijos(null)} />
      <ClienteSheet open={edit} onClose={() => setEdit(false)} cliente={c} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
export function ActivityRows({
  rows,
}: {
  rows: {
    id: string;
    fecha: string;
    accion: string;
    actor: string;
    detalle?: string | undefined;
  }[];
}) {
  return (
    <div className="py-5">
      {rows.length ? (
        rows.map((a) => (
          <div key={a.id} className="flex gap-3 border-b py-4">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary-glow" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.accion}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{a.detalle}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {a.actor} · {fmtFechaHora(a.fecha)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <p className="py-8 text-sm text-muted-foreground">Sin actividad registrada.</p>
      )}
    </div>
  );
}
