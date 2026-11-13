import inventarioJson from "@/data/inventario_ioting.json";
import { CONFIG_INVENTARIO_DEFECTO } from "@/lib/config-inventario";
import { SECTORES_DEFECTO } from "@/lib/dominio";
import { isoDia } from "@/lib/format";
import { inicializarSecuencias, type Secuencias } from "@/lib/inventario";
import type {
  Auditoria,
  Cliente,
  Configuracion,
  InventarioExport,
  ItemInventario,
  MovimientoInventario,
  Proyecto,
  TrabajoTecnico,
  UsuarioCliente,
} from "../types";

export interface MockDb {
  clientes: Cliente[];
  usuarios: UsuarioCliente[];
  proyectos: Proyecto[];
  auditoria: Auditoria[];
  items: ItemInventario[];
  movimientos: MovimientoInventario[];
  /** Contador por prefijo de SKU; nunca decrece (los SKU eliminados no se reutilizan). */
  secuencias: Secuencias;
  config: Configuracion;
  trabajos: TrabajoTecnico[];
  /** Versión del esquema guardado (ver migracion.ts). */
  version: 3;
}

const id = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const diasAtras = (d: number, h = 10) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() - d);
  t.setUTCHours(h + 5, (d * 7) % 60, 0, 0);
  return t.toISOString();
};

export const ACTOR = "Juan Camilo Velásquez";

export function buildSeed(): MockDb {
  const inv = inventarioJson as InventarioExport;
  const items: ItemInventario[] = [...inv.componentes, ...inv.herramientas, ...inv.equipos].map(
    (i) => ({ ...i }),
  );

  const c = (n: number) => id("c1000000", n);
  const clientes: Cliente[] = [
    {
      id: c(1),
      razonSocial: "Cacaotera del Magdalena S.A.S.",
      nit: "901.234.567-1",
      sector: "cacao",
      ciudad: "Santa Marta",
      contactoNombre: "Laura Restrepo",
      contactoEmail: "laura.restrepo@cacaomagdalena.co",
      contactoTelefono: "+57 310 555 0101",
      estado: "activo",
      creadoEn: diasAtras(320),
    },
    {
      id: c(2),
      razonSocial: "Café Alto de los Andes S.A.S.",
      nit: "900.876.543-2",
      sector: "café",
      ciudad: "Manizales",
      contactoNombre: "Andrés Giraldo",
      contactoEmail: "agiraldo@cafealtoandes.co",
      contactoTelefono: "+57 315 555 0202",
      estado: "activo",
      creadoEn: diasAtras(280),
    },
    {
      id: c(3),
      razonSocial: "Mangos Tolima Export S.A.S.",
      nit: "901.555.210-3",
      sector: "mango",
      ciudad: "Espinal",
      contactoNombre: "Diana Murillo",
      contactoEmail: "dmurillo@mangostolima.co",
      contactoTelefono: "+57 300 555 0303",
      estado: "activo",
      creadoEn: diasAtras(210),
    },
    {
      id: c(4),
      razonSocial: "Cooperativa Cafetera Sierra Verde",
      nit: "890.112.334-4",
      sector: "café",
      ciudad: "Pitalito",
      contactoNombre: "Hernán Bustos",
      contactoEmail: "hbustos@sierraverde.coop",
      contactoTelefono: "+57 312 555 0404",
      estado: "suspendido",
      creadoEn: diasAtras(190),
      notas: "Suspendido por mantenimiento de planta.",
    },
    {
      id: c(5),
      razonSocial: "Agroindustrial El Porvenir S.A.S.",
      nit: "901.778.990-5",
      sector: "otro",
      ciudad: "Villavicencio",
      contactoNombre: "Marcela Ortiz",
      contactoEmail: "mortiz@elporvenir.co",
      contactoTelefono: "+57 318 555 0505",
      estado: "activo",
      creadoEn: diasAtras(120),
    },
    {
      id: c(6),
      razonSocial: "Chocolates Finos de Urabá S.A.S.",
      nit: "901.443.221-6",
      sector: "cacao",
      ciudad: "Apartadó",
      contactoNombre: "Felipe Arango",
      contactoEmail: "farango@chocouraba.co",
      contactoTelefono: "+57 311 555 0606",
      estado: "activo",
      creadoEn: diasAtras(60),
    },
  ];

  const u = (n: number) => id("u2000000", n);
  const usuariosBase: [number, string, string, UsuarioCliente["rol"], UsuarioCliente["estado"]][] =
    [
      [1, "Laura Restrepo", "laura.restrepo@cacaomagdalena.co", "administrador", "activo"],
      [1, "Carlos Pérez", "cperez@cacaomagdalena.co", "operador", "activo"],
      [1, "Sofía Mejía", "smejia@cacaomagdalena.co", "lectura", "activo"],
      [2, "Andrés Giraldo", "agiraldo@cafealtoandes.co", "administrador", "activo"],
      [2, "Valentina Ríos", "vrios@cafealtoandes.co", "operador", "activo"],
      [2, "Julián Ospina", "jospina@cafealtoandes.co", "operador", "suspendido"],
      [2, "Natalia Cárdenas", "ncardenas@cafealtoandes.co", "lectura", "activo"],
      [3, "Diana Murillo", "dmurillo@mangostolima.co", "administrador", "activo"],
      [3, "Óscar Lozano", "olozano@mangostolima.co", "operador", "activo"],
      [4, "Hernán Bustos", "hbustos@sierraverde.coop", "administrador", "suspendido"],
      [4, "Paola Rincón", "princon@sierraverde.coop", "operador", "suspendido"],
      [5, "Marcela Ortiz", "mortiz@elporvenir.co", "administrador", "activo"],
      [5, "Ricardo Salazar", "rsalazar@elporvenir.co", "operador", "activo"],
      [5, "Camila Duarte", "cduarte@elporvenir.co", "lectura", "baja"],
      [6, "Felipe Arango", "farango@chocouraba.co", "administrador", "activo"],
      [6, "Isabel Quintero", "iquintero@chocouraba.co", "operador", "activo"],
    ];
  const usuarios: UsuarioCliente[] = usuariosBase.map(([cl, nombre, email, rol, estado], i) => ({
    id: u(i + 1),
    clienteId: c(cl),
    nombre,
    email,
    rol,
    estado,
    ultimoAcceso: estado === "activo" ? diasAtras(i % 9, 8 + (i % 8)) : undefined,
    creadoEn: diasAtras(300 - i * 15),
  }));

  const p = (n: number) => id("p3000000", n);
  const proyectos: Proyecto[] = [
    {
      id: p(1),
      clienteId: c(1),
      nombre: "Monitoreo de fermentación de cacao",
      descripcion:
        "Sensores de temperatura y pH en cajones de fermentación con tablero en tiempo real.",
      estado: "activo",
      fechaInicio: diasAtras(150),
      responsable: "Juan Camilo Velásquez",
      etiquetas: ["fermentación", "LoRa"],
    },
    {
      id: p(2),
      clienteId: c(1),
      nombre: "Secado solar automatizado",
      descripcion: "Control de ventilación y humedad en marquesinas de secado.",
      estado: "pausado",
      fechaInicio: diasAtras(90),
      responsable: "Daniela Torres",
      etiquetas: ["secado", "actuadores"],
    },
    {
      id: p(3),
      clienteId: c(2),
      nombre: "Trazabilidad de beneficio húmedo",
      descripcion: "Medición de caudal y nivel en tanques de lavado.",
      estado: "activo",
      fechaInicio: diasAtras(120),
      responsable: "Juan Camilo Velásquez",
      etiquetas: ["trazabilidad", "WiFi"],
    },
    {
      id: p(4),
      clienteId: c(2),
      nombre: "Estación meteorológica de finca",
      estado: "finalizado",
      fechaInicio: diasAtras(260),
      fechaFin: diasAtras(180),
      responsable: "Daniela Torres",
      etiquetas: ["clima"],
    },
    {
      id: p(5),
      clienteId: c(3),
      nombre: "Cadena de frío para exportación",
      descripcion: "Registro de temperatura en cuartos fríos y contenedores.",
      estado: "activo",
      fechaInicio: diasAtras(70),
      responsable: "Santiago Mora",
      etiquetas: ["frío", "exportación"],
    },
    {
      id: p(6),
      clienteId: c(3),
      nombre: "Riego por goteo inteligente",
      estado: "en_desarrollo",
      responsable: "Santiago Mora",
      etiquetas: ["riego"],
    },
    {
      id: p(7),
      clienteId: c(4),
      nombre: "Control de tostión",
      descripcion: "Perfiles de tostión con termocuplas y registro histórico.",
      estado: "pausado",
      fechaInicio: diasAtras(100),
      responsable: "Juan Camilo Velásquez",
      etiquetas: ["tostión"],
    },
    {
      id: p(8),
      clienteId: c(5),
      nombre: "Monitoreo energético de planta",
      estado: "activo",
      fechaInicio: diasAtras(40),
      responsable: "Daniela Torres",
      etiquetas: ["energía", "Industria 4.0"],
    },
    {
      id: p(9),
      clienteId: c(6),
      nombre: "Visión artificial para selección de grano",
      descripcion: "Clasificación de granos con cámara y SBC.",
      estado: "en_desarrollo",
      responsable: "Juan Camilo Velásquez",
      etiquetas: ["visión", "SBC"],
    },
    {
      id: p(10),
      clienteId: c(5),
      nombre: "Piloto de humedad de suelos",
      estado: "finalizado",
      fechaInicio: diasAtras(200),
      fechaFin: diasAtras(130),
      responsable: "Santiago Mora",
      etiquetas: ["suelos"],
    },
  ];

  const pick = (sku: string) => items.find((i) => i.sku === sku)?.sku ?? items[0]?.sku ?? sku;
  const movsBase: [
    number,
    string,
    MovimientoInventario["tipo"],
    number,
    string | undefined,
    string,
  ][] = [
    [28, "SEN-001", "Salida", 2, p(3), "Instalación tanque 1"],
    [26, "MCU-001", "Salida", 2, p(1), "Nodos de fermentación"],
    [24, "COM-001", "Salida", 2, p(1), ""],
    [22, "SEN-002", "Entrada", 3, undefined, "Reposición"],
    [20, "SEN-003", "Salida", 1, p(5), "Cuarto frío 2"],
    [18, "POT-001", "Salida", 1, p(8), ""],
    [15, "DSP-001", "Salida", 1, p(8), "Tablero de planta"],
    [13, "MCU-002", "Entrada", 2, undefined, "Compra de reposición"],
    [11, "SEN-004", "Salida", 2, p(5), ""],
    [9, "COM-002", "Salida", 1, p(3), ""],
    [7, "SEN-005", "Salida", 1, p(1), "Reemplazo sensor"],
    [5, "MCU-001", "Entrada", 1, undefined, "Devolución de obra"],
    [3, "POT-002", "Salida", 1, p(8), ""],
    [1, "SEN-001", "Salida", 1, p(3), "Tanque 2"],
  ];
  const movimientos: MovimientoInventario[] = movsBase.map(
    ([d, sku, tipo, cantidad, proyecto, nota], i) => ({
      id: id("m4000000", i + 1),
      fecha: diasAtras(d, 9 + (i % 7)),
      sku: pick(sku),
      tipo,
      cantidad,
      proyecto: proyecto ? proyectos.find((x) => x.id === proyecto)?.nombre : undefined,
      ...(proyecto ? { destinoTipo: "proyecto" as const, destinoId: proyecto } : {}),
      ...(tipo === "Salida" ? { costoAlSalir: null } : {}),
      esDemo: true,
      nota: nota || undefined,
    }),
  );

  const auditoria: Auditoria[] = [];
  let n = 1;
  const add = (d: number, accion: string, entidad: string, entidadId: string, detalle: string) =>
    auditoria.push({
      id: id("a5000000", n++),
      fecha: diasAtras(d, 8 + (n % 9)),
      actor: ACTOR,
      accion,
      entidad,
      entidadId,
      detalle,
    });
  clientes.forEach((cl) =>
    add(
      Math.round((Date.now() - new Date(cl.creadoEn).getTime()) / 864e5),
      "cliente.crear",
      "cliente",
      cl.id,
      `Alta de ${cl.razonSocial}`,
    ),
  );
  usuarios
    .slice(0, 12)
    .forEach((us, i) =>
      add(
        250 - i * 18,
        "usuario.invitar",
        "usuario",
        us.id,
        `Invitación a ${us.email} (${us.rol})`,
      ),
    );
  proyectos.forEach((pr, i) =>
    add(160 - i * 12, "proyecto.crear", "proyecto", pr.id, `Proyecto "${pr.nombre}"`),
  );
  add(45, "cliente.suspender", "cliente", c(4), "Motivo: mantenimiento de planta");
  add(44, "usuario.suspender", "usuario", u(10), "Suspensión en cascada por cliente suspendido");
  add(44, "usuario.suspender", "usuario", u(11), "Suspensión en cascada por cliente suspendido");
  add(35, "proyecto.estado", "proyecto", p(2), "activo → pausado. Motivo: temporada de lluvias");
  add(30, "proyecto.estado", "proyecto", p(7), "activo → pausado. Motivo: cliente suspendido");
  add(20, "usuario.baja", "usuario", u(14), "Motivo: retiro de la empresa");
  add(12, "usuario.rol", "usuario", u(5), "lectura → operador");
  add(8, "cliente.editar", "cliente", c(2), "Actualización de teléfono de contacto");
  movimientos
    .slice(-6)
    .forEach((m) =>
      add(
        Math.max(0, Math.round((Date.now() - new Date(m.fecha).getTime()) / 864e5)),
        "inventario.movimiento",
        "inventario",
        m.sku,
        `${m.tipo} de ${m.cantidad} und${m.proyecto ? ` · ${m.proyecto}` : ""}`,
      ),
    );
  auditoria.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const dia = (d: number) => isoDia(new Date(Date.now() + d * 86_400_000).toISOString());
  const t = (n: number) => id("t6000000", n);
  const trabajos: TrabajoTecnico[] = [
    {
      id: t(1),
      codigo: "TT-0001",
      clienteId: c(1),
      tipo: "cctv",
      titulo: "Instalación de 4 cámaras en bodega de secado",
      descripcion: "Cuatro cámaras IP con grabador y cableado estructurado.",
      sitioDireccion: "Vereda El Carmen, finca La Esperanza",
      ciudad: "Santa Marta",
      responsable: "Santiago Mora",
      estado: "completado",
      fechaProgramada: dia(-20),
      fechaInicio: dia(-19),
      fechaFin: dia(-18),
      valorPactado: 3_200_000,
      registradoEn: diasAtras(25),
    },
    {
      id: t(2),
      codigo: "TT-0002",
      clienteId: c(3),
      tipo: "mantenimiento",
      titulo: "Mantenimiento preventivo de alarma perimetral",
      ciudad: "Bogotá",
      responsable: "Daniela Torres",
      estado: "en_curso",
      fechaProgramada: dia(-2),
      fechaInicio: dia(-1),
      valorPactado: 850_000,
      registradoEn: diasAtras(6),
    },
    {
      id: t(3),
      codigo: "TT-0003",
      clienteId: c(5),
      tipo: "telecom",
      titulo: "Enlace inalámbrico entre planta y oficina",
      descripcion: "Dos antenas punto a punto y ajuste de red.",
      ciudad: "Medellín",
      responsable: "Juan Camilo Velásquez",
      estado: "programado",
      fechaProgramada: dia(3),
      valorPactado: 1_900_000,
      registradoEn: diasAtras(2),
    },
  ];
  // Todo lo sembrado es de demostración: «Limpiar datos de demostración» lo elimina.
  for (const x of [...clientes, ...usuarios, ...proyectos, ...trabajos]) x.esDemo = true;
  for (const p of proyectos) p.registradoEn = p.fechaInicio ?? diasAtras(60);

  return {
    clientes,
    usuarios,
    proyectos,
    auditoria,
    items,
    movimientos,
    trabajos,
    secuencias: { ...inicializarSecuencias(items, movimientos), TT: trabajos.length },
    config: {
      inventario: structuredClone(CONFIG_INVENTARIO_DEFECTO),
      sectores: [...SECTORES_DEFECTO],
    },
    version: 3,
  };
}
