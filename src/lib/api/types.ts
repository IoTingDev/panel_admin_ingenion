export type Estado = "activo" | "suspendido" | "baja";
export type RolUsuario = "administrador" | "operador" | "lectura";
export type EstadoProyecto = "borrador" | "activo" | "pausado" | "finalizado" | "baja";
export type EstadoItem = "Disponible" | "En uso" | "En reparación" | "Dañado" | "Baja";
export type TipoMovimiento = "Entrada" | "Salida";
export type GrupoInventario = "componentes" | "herramientas" | "equipos";

export interface Cliente {
  id: string;
  razonSocial: string;
  nit?: string | undefined;
  sector: string;
  ciudad?: string | undefined;
  contactoNombre?: string | undefined;
  contactoEmail?: string | undefined;
  contactoTelefono?: string | undefined;
  estado: Estado;
  creadoEn: string;
  notas?: string | undefined;
}

export interface UsuarioCliente {
  id: string;
  clienteId: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  estado: Estado;
  ultimoAcceso?: string | undefined;
  creadoEn: string;
}

export interface Proyecto {
  id: string;
  clienteId: string;
  nombre: string;
  descripcion?: string | undefined;
  estado: EstadoProyecto;
  fechaInicio?: string | undefined;
  fechaFin?: string | undefined;
  responsable?: string | undefined;
  etiquetas?: string[] | undefined;
}

export interface Auditoria {
  id: string;
  fecha: string;
  actor: string;
  accion: string;
  entidad: string;
  entidadId: string;
  detalle?: string | undefined;
}

export interface ItemInventario {
  sku: string;
  categoria: string;
  subcategoria: string;
  descripcion: string;
  marca_referencia: string;
  cantidad_inicial: number;
  unidad: string;
  estado: EstadoItem;
  ubicacion: string;
  stock_minimo: number | null;
  notas: string;
}

export interface MovimientoInventario {
  id: string;
  fecha: string;
  sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  proyecto?: string | undefined;
  nota?: string | undefined;
}

export interface InventarioExport {
  componentes: ItemInventario[];
  herramientas: ItemInventario[];
  equipos: ItemInventario[];
}

export interface Operador {
  id: string;
  nombre: string;
  email: string;
  rol: "Administrador";
}

export interface ImpactoBaja {
  usuarios: number;
  proyectos: number;
}

/** Hijos de un cliente que siguen en baja y se pueden reactivar uno a uno. */
export interface HijosReactivables {
  usuarios: UsuarioCliente[];
  proyectos: Proyecto[];
}

export interface ErrorFilaLote {
  /** Número de fila del lote, empezando en 1. */
  fila: number;
  error: string;
}

export interface ClientesApi {
  list(): Promise<Cliente[]>;
  get(id: string): Promise<Cliente | null>;
  create(data: Omit<Cliente, "id" | "creadoEn" | "estado">): Promise<Cliente>;
  update(id: string, data: Partial<Omit<Cliente, "id" | "creadoEn">>): Promise<Cliente>;
  impactoBaja(id: string): Promise<ImpactoBaja>;
  hijosReactivables(id: string): Promise<HijosReactivables>;
  cambiarEstado(id: string, estado: Estado, motivo: string): Promise<Cliente>;
}

export interface UsuariosApi {
  list(): Promise<UsuarioCliente[]>;
  invitar(
    data: Pick<UsuarioCliente, "clienteId" | "nombre" | "email" | "rol">,
  ): Promise<UsuarioCliente>;
  cambiarRol(id: string, rol: RolUsuario): Promise<UsuarioCliente>;
  cambiarEstado(id: string, estado: Estado, motivo: string): Promise<UsuarioCliente>;
}

export interface ProyectosApi {
  list(): Promise<Proyecto[]>;
  get(id: string): Promise<Proyecto | null>;
  create(data: Omit<Proyecto, "id">): Promise<Proyecto>;
  update(id: string, data: Partial<Omit<Proyecto, "id">>): Promise<Proyecto>;
  cambiarEstado(id: string, estado: EstadoProyecto, motivo?: string): Promise<Proyecto>;
}

export interface NuevoMovimiento {
  sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  proyecto?: string | undefined;
  nota?: string | undefined;
  fecha?: string | undefined;
}

export interface InventarioApi {
  listItems(): Promise<ItemInventario[]>;
  listMovimientos(): Promise<MovimientoInventario[]>;
  createItem(data: Omit<ItemInventario, "sku">): Promise<ItemInventario>;
  updateItem(sku: string, data: Partial<Omit<ItemInventario, "sku">>): Promise<ItemInventario>;
  /** Eliminación definitiva: solo si el ítem no tiene movimientos. Exige motivo. */
  deleteItem(sku: string, motivo: string): Promise<void>;
  /** Baja lógica: conserva el historial, sale de listados y del valor. Exige motivo. */
  darDeBaja(sku: string, motivo: string): Promise<ItemInventario>;
  registrarMovimiento(data: NuevoMovimiento): Promise<MovimientoInventario>;
  /** Todo o nada: valida el lote completo (stock acumulado) antes de aplicar. */
  importarMovimientos(data: NuevoMovimiento[]): Promise<number>;
  exportar(): Promise<InventarioExport>;
}

export interface AuditoriaApi {
  list(): Promise<Auditoria[]>;
  registrar(data: Omit<Auditoria, "id" | "fecha" | "actor">): Promise<Auditoria>;
}

export interface AuthApi {
  login(email: string, password: string): Promise<Operador>;
  logout(): Promise<void>;
  currentUser(): Promise<Operador | null>;
  role(): Promise<Operador["rol"] | null>;
}

export interface Api {
  clientes: ClientesApi;
  usuarios: UsuariosApi;
  proyectos: ProyectosApi;
  inventario: InventarioApi;
  auditoria: AuditoriaApi;
  auth: AuthApi;
}
