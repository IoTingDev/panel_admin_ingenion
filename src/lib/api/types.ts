export type Estado = "activo" | "suspendido" | "baja";
export type RolUsuario = "administrador" | "operador" | "lectura";
export type EstadoProyecto = "en_desarrollo" | "activo" | "pausado" | "finalizado" | "baja";
export type TipoCliente = "persona" | "empresa";
export type TipoTrabajo = "cctv" | "alarmas" | "telecom" | "mantenimiento" | "instalacion" | "otro";
export type EstadoTrabajo = "programado" | "en_curso" | "completado" | "cancelado";
export type EstadoItem = "Disponible" | "En uso" | "En reparación" | "Dañado" | "Baja";
export type TipoMovimiento = "Entrada" | "Salida";
export type GrupoInventario = "componentes" | "herramientas" | "equipos";
export type DestinoTipo = "proyecto" | "trabajo";

export interface Cliente {
  id: string;
  razonSocial: string;
  nit?: string | undefined;
  sector: string;
  ciudad?: string | undefined;
  contactoNombre?: string | undefined;
  contactoEmail?: string | undefined;
  contactoTelefono?: string | undefined;
  direccion?: string | undefined;
  tipoCliente?: TipoCliente | undefined;
  estado: Estado;
  creadoEn: string;
  notas?: string | undefined;
  /** Dato de demostración: lo elimina «Limpiar datos de demostración». */
  esDemo?: boolean | undefined;
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
  esDemo?: boolean | undefined;
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
  /** Momento técnico del registro; `fechaInicio` es la fecha real que indica la persona. */
  registradoEn?: string | undefined;
  esDemo?: boolean | undefined;
}

export interface TrabajoTecnico {
  id: string;
  /** Consecutivo TT-0001; no se reutiliza. */
  codigo: string;
  clienteId: string;
  tipo: TipoTrabajo;
  titulo: string;
  descripcion?: string | undefined;
  sitioDireccion?: string | undefined;
  ciudad?: string | undefined;
  responsable?: string | undefined;
  estado: EstadoTrabajo;
  fechaProgramada?: string | undefined;
  fechaInicio?: string | undefined;
  fechaFin?: string | undefined;
  /** COP, informativo: la facturación vive en Alegra. */
  valorPactado?: number | undefined;
  notas?: string | undefined;
  motivoCancelacion?: string | undefined;
  /** Cancelado en cascada por la baja de su cliente (se puede ofrecer reactivar). */
  bajaPorCliente?: boolean | undefined;
  registradoEn: string;
  esDemo?: boolean | undefined;
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
  /** Explícito: el prefijo del SKU solo sirve para numerar. */
  grupo: GrupoInventario;
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
  /** Año de compra (1990..año actual). Opcional. */
  anioCompra?: number | null | undefined;
  /** Costo vigente por unidad, COP entero ≥ 0 (promedio ponderado de las compras). null = «Sin valor». */
  valorUnitario?: number | null | undefined;
  /** Costo declarado para la cantidad inicial; base de «invertido». */
  costoInicial?: number | null | undefined;
  /** Vida útil en años; si falta se usa la del grupo (Configuración). */
  vidaUtilAnios?: number | null | undefined;
  proveedor?: string | undefined;
}

export interface MovimientoInventario {
  id: string;
  fecha: string;
  sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  /** Texto libre heredado de la v1 (nombre del proyecto). El destino real va en destinoTipo/destinoId. */
  proyecto?: string | undefined;
  nota?: string | undefined;
  /** Costo unitario de la compra (solo entradas), COP entero ≥ 0. */
  costoUnitario?: number | undefined;
  destinoTipo?: DestinoTipo | undefined;
  destinoId?: string | undefined;
  /** Costo unitario vigente del ítem al registrar la salida (snapshot); null/ausente = sin valor. */
  costoAlSalir?: number | null | undefined;
  esDemo?: boolean | undefined;
}

export interface InventarioExport {
  componentes: ItemInventario[];
  herramientas: ItemInventario[];
  equipos: ItemInventario[];
}

export interface ParametrosDepreciacion {
  /** Años de vida útil por grupo; null = sin depreciación. */
  aniosPorGrupo: Record<GrupoInventario, number | null>;
  /** Porcentaje del valor que se conserva como mínimo (0..100). */
  residualPct: number;
}

export interface ConfigInventario {
  categorias: Record<GrupoInventario, string[]>;
  /** Prefijo de SKU por categoría. */
  prefijos: Record<string, string>;
  depreciacion: ParametrosDepreciacion;
}

export interface Configuracion {
  inventario: ConfigInventario;
  /** Sectores de clientes (lista configurable). */
  sectores: string[];
}

/** Una fila de la plantilla de valores (CSV). valor/año nulos = «no cambiar». */
export interface FilaValores {
  sku: string;
  grupo: GrupoInventario;
  categoria: string;
  cantidad_inicial: number;
  anioCompra: number | null;
  valorUnitario: number | null;
  /** Aviso no bloqueante de la lectura del CSV (p. ej. un grupo antiguo que se reasignó). */
  aviso?: string | undefined;
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
  trabajos: number;
}

/** Hijos de un cliente que siguen en baja y se pueden reactivar uno a uno. */
export interface HijosReactivables {
  usuarios: UsuarioCliente[];
  proyectos: Proyecto[];
  trabajos: TrabajoTecnico[];
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
  /** Eliminación definitiva (datos de prueba o creados por error). Exige motivo. */
  eliminar(id: string, motivo: string): Promise<void>;
}

export interface NuevoTrabajo {
  clienteId: string;
  tipo: TipoTrabajo;
  titulo: string;
  descripcion?: string | undefined;
  sitioDireccion?: string | undefined;
  ciudad?: string | undefined;
  responsable?: string | undefined;
  estado?: EstadoTrabajo | undefined;
  fechaProgramada?: string | undefined;
  fechaInicio?: string | undefined;
  fechaFin?: string | undefined;
  valorPactado?: number | undefined;
  notas?: string | undefined;
}

export interface TrabajosApi {
  list(): Promise<TrabajoTecnico[]>;
  get(id: string): Promise<TrabajoTecnico | null>;
  create(data: NuevoTrabajo): Promise<TrabajoTecnico>;
  update(id: string, data: Partial<NuevoTrabajo>): Promise<TrabajoTecnico>;
  /** Cancelar exige motivo. No se reactiva si el cliente está en baja o suspendido. */
  cambiarEstado(id: string, estado: EstadoTrabajo, motivo?: string): Promise<TrabajoTecnico>;
  eliminar(id: string, motivo: string): Promise<void>;
}

export interface NuevoMovimiento {
  sku: string;
  tipo: TipoMovimiento;
  cantidad: number;
  proyecto?: string | undefined;
  nota?: string | undefined;
  /** ISO o AAAA-MM-DD. Por defecto hoy; se permite el pasado, no el futuro. */
  fecha?: string | undefined;
  costoUnitario?: number | undefined;
  destinoTipo?: DestinoTipo | undefined;
  destinoId?: string | undefined;
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
  /** Todo o nada: valida el lote completo, reclasifica si grupo/categoría difieren y audita. */
  importarValores(data: FilaValores[]): Promise<{ aplicadas: number }>;
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

export interface ResultadoLimpiezaDemo {
  clientes: number;
  usuarios: number;
  proyectos: number;
  trabajos: number;
  movimientos: number;
  /** Clientes de demostración que se conservan porque tienen datos creados por el usuario. */
  clientesConservados: number;
}

export interface ConfiguracionApi {
  get(): Promise<Configuracion>;
  actualizarInventario(cfg: ConfigInventario): Promise<Configuracion>;
  actualizarSectores(sectores: string[]): Promise<Configuracion>;
  /** Elimina solo registros esDemo. `confirmacion` debe ser exactamente «ELIMINAR DEMO». */
  limpiarDemo(confirmacion: string): Promise<ResultadoLimpiezaDemo>;
}

/** Contenido de un respaldo completo (solo modo mock: en modo api lo hace el backend). */
export interface Respaldo {
  formato: "ioting-panel-respaldo";
  version: number;
  exportadoEn: string;
  datos: Record<string, unknown>;
}

export interface ResumenRespaldo {
  exportadoEn: string;
  version: number;
  /** Conteo por entidad dentro del respaldo y lo que hay hoy. */
  entidades: { nombre: string; enRespaldo: number; actual: number }[];
}

export interface RespaldoApi {
  exportar(): Promise<Respaldo>;
  /** Valida el archivo y resume qué contiene, sin aplicar nada. Lanza si no es válido. */
  previsualizar(texto: string): Promise<ResumenRespaldo>;
  /** Reemplaza todos los datos por los del respaldo (validado). Audita. */
  importar(texto: string): Promise<ResumenRespaldo>;
}

export interface Api {
  configuracion: ConfiguracionApi;
  respaldo: RespaldoApi;
  trabajos: TrabajosApi;
  clientes: ClientesApi;
  usuarios: UsuariosApi;
  proyectos: ProyectosApi;
  inventario: InventarioApi;
  auditoria: AuditoriaApi;
  auth: AuthApi;
}
