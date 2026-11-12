import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  Users,
  FolderKanban,
  Boxes,
  History,
  Settings,
  PanelLeftClose,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  ArrowRight,
  Plus,
  Command as CommandIcon,
} from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { derivarAvisos } from "@/lib/avisos";
import { iniciales, nombreCorto } from "@/lib/format";
import { useMe, useClientes, useItems, useMovimientos, useProyectos } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Logo, DemoBadge } from "./common";
import { useUi } from "./ui-context";
import { MovimientoDialog } from "./movimiento-dialog";
import { cn } from "@/lib/utils";

const sections: {
  group: string;
  items: { to: string; label: string; icon: typeof LayoutDashboard }[];
}[] = [
  { group: "Principal", items: [{ to: "/", label: "Inicio", icon: LayoutDashboard }] },
  {
    group: "Gestión",
    items: [
      { to: "/clientes", label: "Clientes", icon: Building2 },
      { to: "/usuarios", label: "Usuarios", icon: Users },
      { to: "/proyectos", label: "Proyectos", icon: FolderKanban },
      { to: "/inventario", label: "Inventario", icon: Boxes },
    ],
  },
  {
    group: "Sistema",
    items: [
      { to: "/auditoria", label: "Auditoría", icon: History },
      { to: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { data: me } = useMe();
  const { data: proyectos = [] } = useProyectos();
  const { data: clientes = [] } = useClientes();
  const { data: items = [] } = useItems();
  const { data: movimientos = [] } = useMovimientos();
  const avisos = derivarAvisos({ proyectos, clientes, items, movimientos });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setPaletteOpen, density } = useUi();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPaletteOpen]);
  return (
    <div className={cn("min-h-screen bg-background", density === "compacta" && "compact")}>
      {mobile && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200",
          collapsed ? "w-[76px]" : "w-[248px]",
          mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex h-24 items-center gap-3 border-b border-sidebar-border px-5",
            collapsed && "justify-center px-3",
          )}
        >
          <Logo className={cn("h-12 w-12", collapsed && "h-11 w-11")} />
          {!collapsed && (
            <div>
              <p className="font-display text-2xl font-bold text-sidebar-accent-foreground">
                IoTing<span className="text-sidebar-primary">.</span>
              </p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.14em]">Panel de administración</p>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-7 px-3 py-7">
          {sections.map((section) => (
            <div key={section.group}>
              {!collapsed && (
                <p className="mb-3 px-3 text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/50">
                  {section.group}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to as "/"}
                      title={collapsed ? item.label : undefined}
                      onClick={() => setMobile(false)}
                      className={cn(
                        "relative flex h-11 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors hover:bg-sidebar-accent",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 h-5 w-0.5 rounded bg-sidebar-primary" />
                      )}
                      <item.icon
                        className={cn("size-[18px] shrink-0", active && "text-sidebar-primary")}
                      />
                      {!collapsed && item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-5 py-5">
          {!collapsed && (
            <>
              <p className="mb-1 flex items-center gap-2 text-xs">
                <span className="size-1.5 rounded-full bg-success" />
                {API_MODE === "api" ? "Operación en línea" : "Datos locales (simulados)"}
              </p>
              <p className="text-[10px] text-sidebar-foreground/45">IoTing Dev © 2026</p>
            </>
          )}
        </div>
      </aside>
      <div
        className={cn(
          "transition-[margin] duration-200",
          collapsed ? "lg:ml-[76px]" : "lg:ml-[248px]",
        )}
      >
        <header className="sticky top-0 z-20 flex h-[76px] items-center gap-3 border-b bg-card/95 px-4 backdrop-blur-sm lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Alternar barra lateral"
            onClick={() => {
              if (window.innerWidth < 1024) setMobile(!mobile);
              else setCollapsed(!collapsed);
            }}
          >
            <PanelLeftClose className="text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setPaletteOpen(true)}
            className="h-10 min-w-0 flex-1 justify-start gap-2 bg-muted/70 text-muted-foreground sm:max-w-lg"
          >
            <Search />
            <span className="hidden truncate text-xs sm:inline">
              Buscar cliente, proyecto, código, nombre…
            </span>
            <span className="ml-auto hidden items-center gap-0.5 rounded border bg-card px-1.5 py-0.5 text-[10px] md:flex">
              <CommandIcon className="size-2.5" />K
            </span>
          </Button>
          <div className="ml-auto hidden xl:block">
            <DemoBadge />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Notificaciones" className="relative">
                <Bell />
                {avisos.length > 0 && (
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end">
              <h3 className="mb-3 font-semibold">Notificaciones</h3>
              {avisos.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">Sin avisos por ahora.</p>
              )}
              {avisos.map((a, i) => (
                <Link
                  key={a.clave}
                  to={a.to}
                  className={cn("block py-2 text-sm", i < avisos.length - 1 && "border-b")}
                >
                  {a.texto}
                  <ArrowRight className="float-right size-4" />
                </Link>
              ))}
            </PopoverContent>
          </Popover>
          <div className="mx-1 h-8 border-l" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-0 sm:px-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft font-display text-xs text-primary">
                  {iniciales(me?.nombre)}
                </span>
                <span className="hidden text-left md:block">
                  <span className="block text-xs font-semibold">
                    {nombreCorto(me?.nombre) || "—"}
                  </span>
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {me?.rol ?? ""}
                  </span>
                </span>
                <ChevronDown className="hidden size-3 text-muted-foreground sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/configuracion">
                  <Settings /> Mi perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await qc.cancelQueries();
                  qc.clear();
                  await api.auth.logout();
                  await navigate({ to: "/login", replace: true });
                }}
              >
                <LogOut />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-7 md:px-7 lg:px-8">{children}</main>
        <footer className="flex justify-between border-t px-8 py-4 text-[10px] text-muted-foreground">
          <span>IoTing Dev · Consola interna</span>
          <span>Industria 4.0 / Agroindustria</span>
        </footer>
      </div>
      <Palette />
      <MovimientoDialog />
    </div>
  );
}
function Palette() {
  const { paletteOpen, setPaletteOpen, openMovimiento } = useUi();
  const { data: clientes = [] } = useClientes();
  const { data: proyectos = [] } = useProyectos();
  const { data: items = [] } = useItems();
  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Buscar en IoTing…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Secciones">
          {sections
            .flatMap((s) => s.items)
            .map((item) => (
              <CommandItem key={item.to} asChild onSelect={() => setPaletteOpen(false)}>
                <Link to={item.to as "/"}>
                  <item.icon />
                  {item.label}
                </Link>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandGroup heading="Acciones rápidas">
          <CommandItem asChild onSelect={() => setPaletteOpen(false)}>
            <Link to="/clientes" search={{ nuevo: true }}>
              <Plus />
              Nuevo cliente
            </Link>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setPaletteOpen(false);
              openMovimiento({ tipo: "Salida" });
            }}
          >
            <ArrowRight />
            Registrar salida de inventario
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Clientes">
          {clientes.map((c) => (
            <CommandItem key={c.id} asChild onSelect={() => setPaletteOpen(false)}>
              <Link to="/clientes/$id" params={{ id: c.id }}>
                <Building2 />
                {c.razonSocial}
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Proyectos">
          {proyectos.map((p) => (
            <CommandItem key={p.id} asChild onSelect={() => setPaletteOpen(false)}>
              <Link to="/proyectos/$id" params={{ id: p.id }}>
                <FolderKanban />
                {p.nombre}
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Inventario">
          {items.map((i) => (
            <CommandItem key={i.sku} asChild onSelect={() => setPaletteOpen(false)}>
              <Link to="/inventario/$sku" params={{ sku: i.sku }}>
                <Boxes />
                <span className="code-id">{i.sku}</span>
                {i.descripcion}
              </Link>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
