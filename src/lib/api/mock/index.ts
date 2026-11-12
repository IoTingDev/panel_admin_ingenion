import {
  inicializarSecuencias,
  reservarSku,
  stockMap,
  validarLote,
  validarSalida,
} from "@/lib/inventario";
import { uid } from "@/lib/format";
import type { Api, Auditoria, Cliente, NuevoMovimiento, Operador } from "../types";
import { ACTOR, buildSeed, type MockDb } from "./seed";

const DB_KEY = "ioting.mock.db.v1";
const SESSION_KEY = "ioting.mock.session.v1";
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

let cache: MockDb | null = null;
function db(): MockDb {
  if (cache) return cache;
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        const guardada = JSON.parse(raw) as MockDb;
        // Bases guardadas antes de existir el contador: se siembra con ítems y movimientos.
        guardada.secuencias ??= inicializarSecuencias(guardada.items, guardada.movimientos);
        cache = guardada;
        return cache;
      } catch {
        /* reseed */
      }
    }
  }
  cache = buildSeed();
  persist();
  return cache;
}
function persist() {
  if (typeof window !== "undefined" && cache)
    window.localStorage.setItem(DB_KEY, JSON.stringify(cache));
}
const clone = <T>(v: T): T => structuredClone(v);

function audit(data: Omit<Auditoria, "id" | "fecha" | "actor">): Auditoria {
  const ev: Auditoria = { id: uid(), fecha: new Date().toISOString(), actor: ACTOR, ...data };
  db().auditoria.unshift(ev);
  return ev;
}

/** Un usuario/proyecto no se reactiva mientras su cliente esté en baja o suspendido. */
function exigirClienteActivo(cliente: Cliente | undefined, que: string) {
  if (!cliente || cliente.estado === "activo") return;
  throw new Error(
    `No se puede reactivar ${que}: el cliente ${cliente.razonSocial} está en ${cliente.estado}. Reactive primero al cliente.`,
  );
}

function must<T>(v: T | undefined, msg: string): T {
  if (v === undefined) throw new Error(msg);
  return v;
}

const OPERADOR: Operador = {
  id: "op-0001",
  nombre: ACTOR,
  email: "juan.velasquez@ioting.dev",
  rol: "Administrador",
};

/** Descarta la copia en memoria y vuelve a leer del almacenamiento (útil en pruebas). */
export function resetMemoria() {
  cache = null;
}

export function resetMockDb() {
  cache = buildSeed();
  persist();
}

/** Aplica un movimiento ya validado o lo valida si va suelto. No persiste. */
function aplicarMovimiento(data: NuevoMovimiento) {
  const d = db();
  const item = must(
    d.items.find((x) => x.sku === data.sku),
    `SKU inexistente: ${data.sku}`,
  );
  if (!Number.isInteger(data.cantidad) || data.cantidad <= 0)
    throw new Error("La cantidad debe ser un entero mayor que 0.");
  if (data.tipo === "Salida") {
    const err = validarSalida(stockMap([item], d.movimientos).get(item.sku) ?? 0, data.cantidad);
    if (err) throw new Error(err);
  }
  const m = {
    id: uid(),
    fecha: data.fecha ?? new Date().toISOString(),
    sku: data.sku,
    tipo: data.tipo,
    cantidad: data.cantidad,
    proyecto: data.proyecto || undefined,
    nota: data.nota || undefined,
  };
  d.movimientos.push(m);
  audit({
    accion: "inventario.movimiento",
    entidad: "inventario",
    entidadId: m.sku,
    detalle: `${m.tipo} de ${m.cantidad} ${item.unidad}${m.proyecto ? ` · ${m.proyecto}` : ""}${m.nota ? ` · ${m.nota}` : ""}`,
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
      };
    },
    async hijosReactivables(id) {
      const d = db();
      return clone({
        usuarios: d.usuarios.filter((u) => u.clienteId === id && u.estado === "baja"),
        proyectos: d.proyectos.filter((p) => p.clienteId === id && p.estado === "baja"),
      });
    },
    async cambiarEstado(id, estado, motivo) {
      await delay();
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
      const p = { ...data, id: uid() };
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
  },

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
      const item = { ...data, sku: reservarSku(data.categoria, d.secuencias) };
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
      const i = must(
        db().items.find((x) => x.sku === sku),
        "Ítem no encontrado",
      );
      if (data.estado === "Baja" && i.estado !== "Baja")
        throw new Error("La baja exige un motivo: use «Dar de baja».");
      const cambios = Object.entries(data).map(
        ([k, v]) =>
          `${k}: ${String((i as unknown as Record<string, unknown>)[k] ?? "—")} → ${String(v ?? "—")}`,
      );
      Object.assign(i, data);
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
      const errores = validarLote(d.items, d.movimientos, rows);
      if (errores.length > 0)
        throw new Error(
          `Importación rechazada, no se aplicó nada. ${errores.map((e) => `Fila ${e.fila}: ${e.error}`).join(" · ")}`,
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
    async exportar() {
      const items = clone(db().items);
      const g = (pfx: string[]) => items.filter((i) => pfx.includes(i.sku.slice(0, 3)));
      return {
        componentes: g(["SEN", "POT", "COM", "DSP", "SBC", "MCU"]),
        herramientas: g(["HER", "CAB", "MAN"]),
        equipos: g(["EQP"]),
      };
    },
  },
};
