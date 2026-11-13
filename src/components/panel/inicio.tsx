import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Users,
  FolderKanban,
  PauseCircle,
  Boxes,
  Package,
  AlertTriangle,
  ArrowLeftRight,
  Wrench,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";
import {
  useClientes,
  useUsuarios,
  useProyectos,
  useItems,
  useMovimientos,
  useAuditoria,
  useTrabajos,
} from "@/hooks/use-api";
import { stockMap, esStockBajo, hoyBogota } from "@/lib/inventario";
import { ROTULO_ESTADO_PROYECTO } from "@/lib/dominio";
import { diasSinRespaldo, hayQueRecordarRespaldo } from "@/lib/respaldo-estado";
import { fmtNum, fmtFechaHora, isoDia } from "@/lib/format";
import { PageHeader, StatCard, DemoBadge, Panel } from "./common";
import { API_MODE } from "@/lib/api";
import { Loading } from "./data-tools";

const ESTADO_COLOR: Record<string, string> = {
  en_desarrollo: "var(--muted-foreground)",
  activo: "var(--success)",
  pausado: "var(--warning)",
  finalizado: "var(--info)",
  baja: "var(--destructive)",
};
export function InicioView() {
  const animar = !useReducedMotion();
  const c = useClientes(),
    u = useUsuarios(),
    p = useProyectos(),
    it = useItems(),
    mv = useMovimientos(),
    au = useAuditoria(),
    tr = useTrabajos();
  if ([c, u, p, it, mv, au, tr].some((q) => q.isLoading)) return <Loading />;
  const clientes = c.data ?? [],
    usuarios = u.data ?? [],
    proyectos = p.data ?? [],
    items = it.data ?? [],
    movs = mv.data ?? [],
    audit = au.data ?? [],
    trabajos = tr.data ?? [];
  const stocks = stockMap(items, movs);
  const bajos = items.filter((i) => esStockBajo(stocks.get(i.sku) ?? 0, i.stock_minimo));
  const desde = Date.now() - 30 * 864e5;
  const recientes = movs.filter((m) => new Date(m.fecha).getTime() >= desde);
  const dias = Array.from({ length: 30 }, (_, k) => {
    const d = isoDia(new Date(Date.now() - (29 - k) * 864e5).toISOString());
    const del = recientes.filter((m) => isoDia(m.fecha) === d);
    return {
      dia: d.slice(5),
      Entradas: del.filter((m) => m.tipo === "Entrada").reduce((s, m) => s + m.cantidad, 0),
      Salidas: del.filter((m) => m.tipo === "Salida").reduce((s, m) => s + m.cantidad, 0),
    };
  });
  const porEstado = Object.keys(ESTADO_COLOR)
    .map((e) => ({
      estado: e,
      name: ROTULO_ESTADO_PROYECTO[e as keyof typeof ROTULO_ESTADO_PROYECTO],
      value: proyectos.filter((x) => x.estado === e).length,
    }))
    .filter((x) => x.value);
  const sectores = [...new Set(clientes.map((x) => x.sector))].map((s) => ({
    sector: s,
    clientes: clientes.filter((x) => x.sector === s && x.estado !== "baja").length,
  }));
  const pausados = proyectos.filter((x) => x.estado === "pausado");
  const hoy = hoyBogota();
  const en7 = isoDia(new Date(Date.now() + 7 * 864e5).toISOString());
  const enCurso = trabajos.filter((t) => t.estado === "en_curso");
  const programadosSemana = trabajos.filter(
    (t) =>
      t.estado === "programado" &&
      !!t.fechaProgramada &&
      t.fechaProgramada.slice(0, 10) >= hoy &&
      t.fechaProgramada.slice(0, 10) <= en7,
  );
  const vencidos = trabajos.filter(
    (t) => t.estado === "programado" && !!t.fechaProgramada && t.fechaProgramada.slice(0, 10) < hoy,
  );
  const hace30 = isoDia(new Date(Date.now() - 30 * 864e5).toISOString());
  const completados30 = trabajos.filter(
    (t) => t.estado === "completado" && !!t.fechaFin && t.fechaFin.slice(0, 10) >= hace30,
  );
  const recordarRespaldo = hayQueRecordarRespaldo();
  const suspendidos = clientes.filter((x) => x.estado === "suspendido");
  return (
    <>
      <PageHeader
        eyebrow="Panel de control"
        title={
          <>
            Panel <span className="text-gradient-primary">IoTing</span>
          </>
        }
        subtitle="Vista general de la operación — Industria 4.0"
        actions={<DemoBadge />}
      />
      {API_MODE === "mock" && (
        <p className="mb-4 text-xs text-muted-foreground">
          Los datos están guardados solo en este navegador (modo simulado); haga respaldos desde
          Configuración.
        </p>
      )}
      {recordarRespaldo && (
        <div
          role="status"
          data-testid="recordatorio-respaldo"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/15 p-4 text-sm"
        >
          <span>
            Hace <strong>{diasSinRespaldo()} días</strong> que no hace un respaldo. Los datos están
            guardados solo en este navegador.
          </span>
          <Link to="/configuracion" className="font-semibold text-primary">
            Hacer respaldo
          </Link>
        </div>
      )}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Clientes activos"
          value={clientes.filter((x) => x.estado === "activo").length}
          icon={Building2}
        />
        <StatCard
          label="Usuarios activos"
          value={usuarios.filter((x) => x.estado === "activo").length}
          icon={Users}
          tone="info"
        />
        <StatCard
          label="Proyectos en operación"
          value={proyectos.filter((x) => x.estado === "activo").length}
          icon={FolderKanban}
          tone="success"
        />
        <StatCard
          label="Proyectos pausados"
          value={pausados.length}
          icon={PauseCircle}
          tone="warning"
        />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Referencias de inventario" value={items.length} icon={Boxes} />
        <StatCard
          label="Unidades en stock"
          value={fmtNum([...stocks.values()].reduce((a, b) => a + b, 0))}
          icon={Package}
          tone="info"
        />
        <StatCard
          label="Ítems por reponer"
          value={bajos.length}
          icon={AlertTriangle}
          tone={bajos.length ? "destructive" : "success"}
        />
        <StatCard label="Movimientos (30 días)" value={recientes.length} icon={ArrowLeftRight} />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trabajos en curso" value={enCurso.length} icon={Wrench} tone="warning" />
        <StatCard
          label="Programados esta semana"
          value={programadosSemana.length}
          icon={CalendarClock}
          tone="info"
        />
        <StatCard
          label="Trabajos vencidos sin iniciar"
          value={vencidos.length}
          icon={AlertTriangle}
          tone={vencidos.length ? "destructive" : "success"}
        />
        <StatCard
          label="Completados (30 días)"
          value={completados30.length}
          icon={CheckCircle2}
          tone="success"
        />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-semibold">Proyectos por estado</h3>
          <div className="chart-wrap">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={porEstado}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  isAnimationActive={animar}
                >
                  {porEstado.map((e) => (
                    <Cell key={e.name} fill={ESTADO_COLOR[e.estado]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {porEstado.map((e) => (
              <span key={e.name} className="flex items-center gap-1">
                <span
                  className="size-2 rounded-full"
                  style={{ background: ESTADO_COLOR[e.estado] }}
                />
                {e.name} ({e.value})
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-soft xl:col-span-2">
          <h3 className="mb-3 font-semibold">Movimientos de inventario — últimos 30 días</h3>
          <div className="chart-wrap">
            <ResponsiveContainer>
              <AreaChart data={dias}>
                <defs>
                  <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary-glow)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dia" fontSize={11} stroke="var(--muted-foreground)" interval={4} />
                <YAxis
                  allowDecimals={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  width={28}
                />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="Salidas"
                  stroke="var(--primary)"
                  fill="url(#gS)"
                  isAnimationActive={animar}
                />
                <Area
                  type="monotone"
                  dataKey="Entradas"
                  isAnimationActive={animar}
                  stroke="var(--primary-glow)"
                  fill="url(#gE)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-semibold">Clientes por sector</h3>
          <div className="chart-wrap">
            <ResponsiveContainer>
              <BarChart data={sectores}>
                <defs>
                  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-glow)" />
                    <stop offset="100%" stopColor="var(--primary)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="sector" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis
                  allowDecimals={false}
                  fontSize={11}
                  width={24}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip />
                <Bar
                  dataKey="clientes"
                  fill="url(#gB)"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={animar}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h3 className="mb-4 font-semibold">Alertas activas</h3>
          <div className="space-y-3">
            {bajos.slice(0, 4).map((i) => (
              <Link
                key={i.sku}
                to="/inventario/$sku"
                params={{ sku: i.sku }}
                className="block rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm"
              >
                <span className="font-medium text-destructive">Stock bajo</span> ·{" "}
                <span className="code-id">{i.sku}</span> {i.descripcion}
              </Link>
            ))}
            {pausados.map((x) => (
              <Link
                key={x.id}
                to="/proyectos/$id"
                params={{ id: x.id }}
                className="block rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm"
              >
                <span className="font-medium">Proyecto pausado</span> · {x.nombre}
              </Link>
            ))}
            {vencidos.map((x) => (
              <Link
                key={x.id}
                to="/trabajos/$id"
                params={{ id: x.id }}
                className="block rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm"
              >
                <span className="font-medium">Trabajo vencido</span> · {x.codigo} {x.titulo}
              </Link>
            ))}
            {suspendidos.map((x) => (
              <Link
                key={x.id}
                to="/clientes/$id"
                params={{ id: x.id }}
                className="block rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm"
              >
                <span className="font-medium">Cliente suspendido</span> · {x.razonSocial}
              </Link>
            ))}
            {!bajos.length && !pausados.length && !suspendidos.length && (
              <p className="text-sm text-muted-foreground">Sin alertas activas.</p>
            )}
            {!bajos.length && (
              <p className="text-xs text-muted-foreground">
                Defina stocks mínimos en Inventario para recibir alertas de reposición.
              </p>
            )}
          </div>
        </div>
        <Panel
          title="Actividad reciente"
          className="rounded-xl border p-5 shadow-soft"
          actions={
            <Link to="/auditoria" className="text-xs text-primary">
              Ver todo
            </Link>
          }
        >
          <div className="space-y-3">
            {audit.slice(0, 7).map((a) => (
              <div key={a.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-glow" />
                <div className="min-w-0">
                  <p className="truncate">{a.detalle}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.accion} · {fmtFechaHora(a.fecha)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
