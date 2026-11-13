import {
  errorCamposItem,
  errorCamposMovimiento,
  inicializarSecuencias,
  normalizarFecha,
  reservarSku,
  stockMap,
  validarLote,
  validarSalida,
} from "@/lib/inventario";
import { grupoDeCategoria, validarConfigInventario } from "@/lib/config-inventario";
import { previsualizarValores, promedioPonderado, tieneCompras } from "@/lib/valoracion";
import { uid } from "@/lib/format";
import type { Api, Auditoria, Cliente, ItemInventario, NuevoMovimiento, Operador } from "../types";
import { ACTOR, type MockDb } from "./seed";
import {
  SESSION_KEY,
  audit,
  clone,
  db,
  delay,
  exigirClienteActivo,
  exigirMotivo,
  must,
  persist,
} from "./store";
import { trabajosApi } from "./trabajos";
import { respaldoApi } from "./respaldo";
import { configuracionExtra } from "./config-extra";

export { resetMemoria, resetMockDb } from "./store";

const OPERADOR: Operador = {
  id: "op-0001",
  nombre: ACTOR,
  email: "juan.velasquez@ioting.dev",
  rol: "Administrador",
};

const ABIERTO = ["programado", "en_curso"];

function exigirSector(sector: string) {
  if (!db().config.sectores.includes(sector))
    throw new Error(`El sector «${sector}» no está en la lista de sectores.`);
}

/** Reglas de proyecto: cliente activo, nombre, fechas (fin ≥ inicio; el pasado se permite). */
function validarProyecto(
  p: {
    clienteId: string;
    nombre: string;
    fechaInicio?: string | undefined;
    fechaFin?: string | undefined;
  },
  nuevo: boolean,
) {
  const cliente = db().clientes.find((c) => c.id === p.clienteId);
  if (!cliente) throw new Error("El cliente indicado no existe.");
  if (nuevo && cliente.estado !== "activo")
    throw new Error(
      `El cliente ${cliente.razonSocial} está en ${cliente.estado}: no admite proyectos nuevos.`,
    );
  if (!p.nombre || !p.nombre.trim()) throw new Error("El nombre del proyecto es obligatorio.");
  if (p.fechaInicio && p.fechaFin && p.fechaFin.slice(0, 10) < p.fechaInicio.slice(0, 10))
    throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
}

const existeDestino = (tipo: "proyecto" | "trabajo", id: string) => {
  const d = db() as MockDb & { trabajos?: { id: string }[] };
  return tipo === "proyecto"
    ? d.proyectos.some((p) => p.id === id)
    : (d.trabajos ?? []).some((t) => t.id === id);
};

/** Valida y aplica un movimiento. No persiste (lo hace quien llama). */
function aplicarMovimiento(data: NuevoMovimiento) {
  const d = db();
  const item = must(
    d.items.find((x) => x.sku === data.sku),
    `SKU inexistente: ${data.sku}`,
  );
  if (!Number.isInteger(data.cantidad) || data.cantidad <= 0)
    throw new Error("La cantidad debe ser un entero mayor que 0.");
  const errCampos = errorCamposMovimiento(data, existeDestino);
  if (errCampos) throw new Error(errCampos);
  const stock = stockMap([item], d.movimientos).get(item.sku) ?? 0;
  if (data.tipo === "Salida") {
    const err = validarSalida(stock, data.cantidad);
    if (err) throw new Error(err);
  }
  const fecha = normalizarFecha(data.fecha).iso;
  const trabajo =
    data.destinoTipo === "trabajo" ? d.trabajos.find((t) => t.id === data.destinoId) : undefined;
  if (trabajo?.estado === "cancelado")
    throw new Error(
      `El servicio técnico ${trabajo.codigo} está cancelado: no admite más material.`,
    );
  const proyecto =
    data.destinoTipo === "proyecto"
      ? d.proyectos.find((p) => p.id === data.destinoId)?.nombre
      : trabajo
        ? `${trabajo.codigo} · ${trabajo.titulo}`
        : data.proyecto;
  const m = {
    id: uid(),
    fecha,
    sku: data.sku,
    tipo: data.tipo,
    cantidad: data.cantidad,
    proyecto: proyecto || undefined,
    nota: data.nota || undefined,
    costoUnitario: data.costoUnitario,
    destinoTipo: data.destinoTipo,
    destinoId: data.destinoId,
    ...(data.tipo === "Salida" ? { costoAlSalir: item.valorUnitario ?? null } : {}),
  };
  d.movimientos.push(m);
  let detalleValor = "";
  if (data.tipo === "Entrada" && data.costoUnitario !== undefined) {
    const antes = item.valorUnitario ?? null;
    item.valorUnitario = promedioPonderado(
      stock,
      item.valorUnitario,
      data.cantidad,
      data.costoUnitario,
    );
    detalleValor = ` · costo ${data.costoUnitario}, valor ${antes ?? "—"} → ${item.valorUnitario}`;
  }
  audit({
    accion: "inventario.movimiento",
    entidad: "inventario",
    entidadId: m.sku,
    detalle: `${m.tipo} de ${m.cantidad} ${item.unidad}${m.proyecto ? ` · ${m.proyecto}` : ""}${m.nota ? ` · ${m.nota}` : ""}${detalleValor}`,
  });
  return m;
}

export const mockApi: Api = {
  auth: {
    async login(email, password) {
      await delay(400);
      if (!email || password.length < 4) throw new Error("Credenciales inválidas.");
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(OPERADOR));
      return OPERADOR;
    },
    async logout() {
      window.localStorage.removeItem(SESSION_KEY);
    },
    async currentUser() {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Operador) : null;
    },
    async role() {
      const u = await mockApi.auth.currentUser();
      return u?.rol ?? null;
    },
  },

  auditoria: {
    async list() {
      await delay();
      return clone(db().auditoria);
    },
    async registrar(data) {
      const ev = audit(data);
      persist();
      return clone(ev);
    },
  },

  clientes: {
    async list() {
      await delay();
      return clone(db().clientes);
    },
    async get(id) {
      await delay();
      return clone(db().clientes.find((c) => c.id === id) ?? null);
    },
    async create(data) {
      await delay();
      exigirSector(data.sector);
      const c = {
        ...data,
        id: uid(),
        estado: "activo" as const,
        creadoEn: new Date().toISOString(),
      };
      db().clientes.unshift(c);
      audit({
        accion: "cliente.crear",
        entidad: "cliente",
        entidadId: c.id,
        detalle: `Alta de ${c.razonSocial}`,
      });
      persist();
      return clone(c);
    },
    async update(id, data) {
      await delay();
      const c = must(
        db().clientes.find((x) => x.id === id),
        "Cliente no encontrado",
      );
      if (data.sector !== undefined && data.sector !== c.sector) exigirSector(data.sector);
      Object.assign(c, data);
      audit({
        accion: "cliente.editar",
        entidad: "cliente",
        entidadId: id,
        detalle: `Campos: ${Object.keys(data).join(", ")}`,
      });
      persist();
      return clone(c);
    },
    async impactoBaja(id) {
      const d = db();
      return {
        usuarios: d.usuarios.filter((u) => u.clienteId === id && u.estado !== "baja").length,
        proyectos: d.proyectos.filter(
          (p) => p.clienteId === id && p.estado !== "baja" && p.estado !== "finalizado",
        ).length,
        trabajos: d.trabajos.filter((t) => t.clienteId === id && ABIERTO.includes(t.estado)).length,
      };
    },
    async hijosReactivables(id) {
      const d = db();
      return clone({
        usuarios: d.usuarios.filter((u) => u.clienteId === id && u.estado === "baja"),
        proyectos: d.proyectos.filter((p) => p.clienteId === id && p.estado === "baja"),
        trabajos: d.trabajos.filter(
          (t) => t.clienteId === id && t.estado === "cancelado" && t.bajaPorCliente,
        ),
      });
    },
    async cambiarEstado(id, estado, motivo) {
      await delay();
      if (estado !== "activo")
        exigirMotivo(motivo, estado === "baja" ? "La baja del cliente" : "Suspender al cliente");
      const d = db();
      const c = must(
        d.clientes.find((x) => x.id === id),
        "Cliente no encontrado",
      );
      const prev = c.estado;
      c.estado = estado;
      const accion =
        estado === "baja"
          ? "cliente.baja"
          : estado === "suspendido"
            ? "cliente.suspender"
            : "cliente.reactivar";
      audit({
        accion,
        entidad: "cliente",
        entidadId: id,
        detalle: `${prev} → ${estado}. Motivo: ${motivo}`,
      });
      if (estado === "baja") {
        d.usuarios
          .filter((u) => u.clienteId === id && u.estado !== "baja")
          .forEach((u) => {
            u.estado = "baja";
            audit({
              accion: "usuario.baja",
              entidad: "usuario",
              entidadId: u.id,
              detalle: `Baja en cascada por baja del cliente ${c.razonSocial}`,
            });
          });
        d.proyectos
          .filter((p) => p.clienteId === id && p.estado !== "baja" && p.estado !== "finalizado")
          .forEach((p) => {
            p.estado = "baja";
            audit({
              accion: "proyecto.baja",
              entidad: "proyecto",
              entidadId: p.id,
              detalle: `Baja en cascada por baja del cliente ${c.razonSocial}`,
            });
          });
        d.trabajos
          .filter((t) => t.clienteId === id && ABIERTO.includes(t.estado))
          .forEach((t) => {
            t.estado = "cancelado";
            t.bajaPorCliente = true;
            t.motivoCancelacion = `Baja del cliente ${c.razonSocial}`;
            audit({
              accion: "trabajo.cancelar",
              entidad: "trabajo",
              entidadId: t.id,
              detalle: `${t.codigo}: cancelado en cascada por baja del cliente ${c.razonSocial}`,
            });
          });
      }
      persist();
      return clone(c);
    },
  },

  usuarios: {
    async list() {
      await delay();
      return clone(db().usuarios);
    },
    async invitar(data) {
      await delay();
      const d = db();
      const cliente = d.clientes.find((c) => c.id === data.clienteId);
      if (cliente && cliente.estado !== "activo")
        throw new Error(
          `El cliente ${cliente.razonSocial} está en ${cliente.estado}: no admite usuarios nuevos.`,
        );
      if (
        d.usuarios.some(
          (u) => u.email.toLowerCase() === data.email.toLowerCase() && u.estado !== "baja",
        )
      ) {
        throw new Error("Ya existe un usuario activo con ese correo.");
      }
      const u = {
        ...data,
        id: uid(),
        estado: "activo" as const,
        creadoEn: new Date().toISOString(),
      };
      d.usuarios.unshift(u);
      audit({
        accion: "usuario.invitar",
        entidad: "usuario",
        entidadId: u.id,
        detalle: `Invitación a ${u.email} (${u.rol})`,
      });
      persist();
      return clone(u);
    },
    async cambiarRol(id, rol) {
      await delay();
      const u = must(
        db().usuarios.find((x) => x.id === id),
        "Usuario no encontrado",
      );
      const prev = u.rol;
      u.rol = rol;
      audit({
        accion: "usuario.rol",
        entidad: "usuario",
        entidadId: id,
        detalle: `${prev} → ${rol}`,
      });
      persist();
      return clone(u);
    },
    async cambiarEstado(id, estado, motivo) {
      await delay();
      if (estado !== "activo")
        exigirMotivo(motivo, estado === "baja" ? "La baja del usuario" : "Suspender al usuario");
      const u = must(
        db().usuarios.find((x) => x.id === id),
        "Usuario no encontrado",
      );
      if (estado === "activo") {
        exigirClienteActivo(
          db().clientes.find((c) => c.id === u.clienteId),
          "al usuario",
        );
      }
      const prev = u.estado;
      u.estado = estado;
      const accion =
        estado === "baja"
          ? "usuario.baja"
          : estado === "suspendido"
            ? "usuario.suspender"
            : "usuario.reactivar";
      audit({
        accion,
        entidad: "usuario",
        entidadId: id,
        detalle: `${prev} → ${estado}. Motivo: ${motivo}`,
      });
      persist();
      return clone(u);
    },
  },

  proyectos: {
    async list() {
      await delay();
      return clone(db().proyectos);
    },
    async get(id) {
      await delay();
      return clone(db().proyectos.find((p) => p.id === id) ?? null);
    },
    async create(data) {
      await delay();
      validarProyecto(data, true);
      const p = { ...data, id: uid(), registradoEn: new Date().toISOString() };
      db().proyectos.unshift(p);
      audit({
        accion: "proyecto.crear",
        entidad: "proyecto",
        entidadId: p.id,
        detalle: `Proyecto "${p.nombre}"`,
      });
      persist();
      return clone(p);
    },
    async update(id, data) {
      await delay();
      const p = must(
        db().proyectos.find((x) => x.id === id),
        "Proyecto no encontrado",
      );
      validarProyecto({ ...p, ...data }, false);
      Object.assign(p, data);
      audit({
        accion: "proyecto.editar",
        entidad: "proyecto",
        entidadId: id,
        detalle: `Campos: ${Object.keys(data).join(", ")}`,
      });
      persist();
      return clone(p);
    },
    async cambiarEstado(id, estado, motivo) {
      await delay(60);
      if (estado === "baja") exigirMotivo(motivo, "La baja del proyecto");
      const p = must(
        db().proyectos.find((x) => x.id === id),
        "Proyecto no encontrado",
      );
      if (p.estado === "baja" && estado !== "baja") {
        exigirClienteActivo(
          db().clientes.find((c) => c.id === p.clienteId),
          "el proyecto",
        );
      }
      const prev = p.estado;
      p.estado = estado;
      audit({
        accion: estado === "baja" ? "proyecto.baja" : "proyecto.estado",
        entidad: "proyecto",
        entidadId: id,
        detalle: `${prev} → ${estado}${motivo ? `. Motivo: ${motivo}` : ""}`,
      });
      persist();
      return clone(p);
    },
    async eliminar(id, motivo) {
      await delay();
      const d = db();
      const mt = exigirMotivo(motivo, "La eliminación del proyecto");
      const p = must(
        d.proyectos.find((x) => x.id === id),
        "Proyecto no encontrado",
      );
      d.proyectos = d.proyectos.filter((x) => x.id !== id);
      audit({
        accion: "proyecto.eliminar",
        entidad: "proyecto",
        entidadId: id,
        detalle: `"${p.nombre}". Motivo: ${mt}`,
      });
      persist();
    },
  },

  trabajos: trabajosApi,
  respaldo: respaldoApi,

  inventario: {
    async listItems() {
      await delay();
      return clone(db().items);
    },
    async listMovimientos() {
      await delay();
      return clone(db().movimientos);
    },
    async createItem(data) {
      await delay();
      const d = db();
      const cfg = d.config.inventario;
      const grupo = data.grupo ?? grupoDeCategoria(cfg, data.categoria);
      if (!grupo) throw new Error(`La categoría «${data.categoria}» no existe.`);
      const err = errorCamposItem({ ...data, grupo }, undefined, cfg);
      if (err) throw new Error(err);
      const item: ItemInventario = {
        ...data,
        grupo,
        sku: reservarSku(data.categoria, d.secuencias, cfg.prefijos),
        costoInicial: data.valorUnitario ?? null,
      };
      d.items.push(item);
      audit({
        accion: "inventario.crear",
        entidad: "inventario",
        entidadId: item.sku,
        detalle: item.descripcion,
      });
      persist();
      return clone(item);
    },
    async updateItem(sku, data) {
      await delay(60);
      const d = db();
      const i = must(
        d.items.find((x) => x.sku === sku),
        "Ítem no encontrado",
      );
      if (data.estado === "Baja" && i.estado !== "Baja")
        throw new Error("La baja exige un motivo: use «Dar de baja».");
      const err = errorCamposItem(data, i, d.config.inventario);
      if (err) throw new Error(err);
      if (data.cantidad_inicial !== undefined) {
        const nuevoStock =
          (stockMap([i], d.movimientos).get(sku) ?? 0) - i.cantidad_inicial + data.cantidad_inicial;
        if (nuevoStock < 0)
          throw new Error(
            `Esa cantidad inicial dejaría el stock negativo (${nuevoStock}): ya se consumieron más unidades.`,
          );
      }
      const cambios = Object.entries(data).map(
        ([k, v]) =>
          `${k}: ${String((i as unknown as Record<string, unknown>)[k] ?? "—")} → ${String(v ?? "—")}`,
      );
      const cambiaValor =
        data.valorUnitario !== undefined && data.valorUnitario !== i.valorUnitario;
      Object.assign(i, data);
      // Mientras no haya compras costeadas, el valor editado es también el costo de lo inicial.
      if (cambiaValor && !tieneCompras(sku, d.movimientos))
        i.costoInicial = data.valorUnitario ?? null;
      audit({
        accion: "inventario.editar",
        entidad: "inventario",
        entidadId: sku,
        detalle: cambios.join("; "),
      });
      persist();
      return clone(i);
    },
    async darDeBaja(sku, motivo) {
      await delay();
      if (motivo.trim().length < 3) throw new Error("La baja exige un motivo.");
      const i = must(
        db().items.find((x) => x.sku === sku),
        "Ítem no encontrado",
      );
      const prev = i.estado;
      i.estado = "Baja";
      audit({
        accion: "inventario.baja",
        entidad: "inventario",
        entidadId: sku,
        detalle: `${prev} → Baja. Motivo: ${motivo.trim()}`,
      });
      persist();
      return clone(i);
    },
    async deleteItem(sku, motivo) {
      await delay();
      const d = db();
      if (motivo.trim().length < 3) throw new Error("La eliminación exige un motivo.");
      if (d.movimientos.some((m) => m.sku === sku))
        throw new Error(
          "El ítem tiene movimientos: no se elimina, se da de baja para conservar su historial.",
        );
      d.items = d.items.filter((x) => x.sku !== sku);
      audit({
        accion: "inventario.eliminar",
        entidad: "inventario",
        entidadId: sku,
        detalle: `Motivo: ${motivo}`,
      });
      persist();
    },
    async registrarMovimiento(data) {
      await delay();
      const m = aplicarMovimiento(data);
      persist();
      return clone(m);
    },
    async importarMovimientos(rows: NuevoMovimiento[]) {
      await delay();
      const d = db();
      const errores = new Map<number, string>();
      validarLote(d.items, d.movimientos, rows).forEach((e) => errores.set(e.fila, e.error));
      rows.forEach((r, i) => {
        const e = errorCamposMovimiento(r, existeDestino);
        if (e && !errores.has(i + 1)) errores.set(i + 1, e);
      });
      if (errores.size > 0)
        throw new Error(
          `Importación rechazada, no se aplicó nada. ${[...errores.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([fila, e]) => `Fila ${fila}: ${e}`)
            .join(" · ")}`,
        );
      rows.forEach((r) => aplicarMovimiento(r));
      audit({
        accion: "inventario.importar",
        entidad: "inventario",
        entidadId: "csv",
        detalle: `${rows.length} movimientos importados desde CSV`,
      });
      persist();
      return rows.length;
    },
    async importarValores(filas) {
      await delay();
      const d = db();
      const prev = previsualizarValores(d.items, d.movimientos, filas, d.config.inventario);
      const malas = prev.filter((p) => p.error);
      if (malas.length > 0)
        throw new Error(
          `Importación rechazada, no se aplicó nada. ${malas.map((p) => `Fila ${p.fila}: ${p.error}`).join(" · ")}`,
        );
      const resumen: string[] = [];
      for (const p of prev) {
        const it = must(
          d.items.find((x) => x.sku === p.sku),
          "Ítem no encontrado",
        );
        if (p.cambios.length === 0) continue;
        const valorCambia = p.cambios.some((c) => c.campo === "valorUnitario");
        for (const c of p.cambios) (it as unknown as Record<string, unknown>)[c.campo] = c.despues;
        if (valorCambia && !tieneCompras(it.sku, d.movimientos))
          it.costoInicial = it.valorUnitario ?? null;
        resumen.push(
          `${p.sku}: ${p.cambios.map((c) => `${c.campo} ${String(c.antes ?? "—")} → ${String(c.despues)}`).join(", ")}`,
        );
      }
      audit({
        accion: "inventario.importar_valores",
        entidad: "inventario",
        entidadId: "csv",
        detalle: `${filas.length} filas, ${resumen.length} con cambios. ${resumen.join(" | ")}`,
      });
      persist();
      return { aplicadas: filas.length };
    },
    async exportar() {
      const items = clone(db().items);
      const g = (grupo: ItemInventario["grupo"]) => items.filter((i) => i.grupo === grupo);
      return {
        componentes: g("componentes"),
        herramientas: g("herramientas"),
        equipos: g("equipos"),
      };
    },
  },

  configuracion: {
    async get() {
      await delay(40);
      return clone(db().config);
    },
    async actualizarInventario(cfg) {
      await delay();
      const d = db();
      const err = validarConfigInventario(cfg);
      if (err) throw new Error(err);
      const enUso = d.items.find((i) => !cfg.categorias[i.grupo]?.includes(i.categoria));
      if (enUso)
        throw new Error(
          `No se puede quitar la categoría «${enUso.categoria}»: la usa ${enUso.sku} (${enUso.grupo}).`,
        );
      d.config.inventario = clone(cfg);
      audit({
        accion: "configuracion.inventario",
        entidad: "configuracion",
        entidadId: "inventario",
        detalle: "Categorías, prefijos o parámetros de depreciación actualizados",
      });
      persist();
      return clone(d.config);
    },
    ...configuracionExtra,
  },
};
