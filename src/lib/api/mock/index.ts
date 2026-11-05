import { stockMap, siguienteSku, validarSalida } from "@/lib/inventario";
import { uid } from "@/lib/format";
import type { Api, Auditoria, NuevoMovimiento, Operador } from "../types";
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
        cache = JSON.parse(raw) as MockDb;
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
  if (typeof window !== "undefined" && cache) window.localStorage.setItem(DB_KEY, JSON.stringify(cache));
}
const clone = <T>(v: T): T => structuredClone(v);

function audit(data: Omit<Auditoria, "id" | "fecha" | "actor">): Auditoria {
  const ev: Auditoria = { id: uid(), fecha: new Date().toISOString(), actor: ACTOR, ...data };
  db().auditoria.unshift(ev);
  return ev;
}

function must<T>(v: T | undefined, msg: string): T {
  if (v === undefined) throw new Error(msg);
  return v;
}

const OPERADOR: Operador = { id: "op-0001", nombre: ACTOR, email: "juan.velasquez@ioting.dev", rol: "Administrador" };

export function resetMockDb() {
  cache = buildSeed();
  persist();
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
    async list() { await delay(); return clone(db().auditoria); },
    async registrar(data) { const ev = audit(data); persist(); return clone(ev); },
  },

  clientes: {
    async list() { await delay(); return clone(db().clientes); },
    async get(id) { await delay(); return clone(db().clientes.find((c) => c.id === id) ?? null); },
    async create(data) {
      await delay();
      const c = { ...data, id: uid(), estado: "activo" as const, creadoEn: new Date().toISOString() };
      db().clientes.unshift(c);
      audit({ accion: "cliente.crear", entidad: "cliente", entidadId: c.id, detalle: `Alta de ${c.razonSocial}` });
      persist();
      return clone(c);
    },
    async update(id, data) {
      await delay();
      const c = must(db().clientes.find((x) => x.id === id), "Cliente no encontrado");
      Object.assign(c, data);
      audit({ accion: "cliente.editar", entidad: "cliente", entidadId: id, detalle: `Campos: ${Object.keys(data).join(", ")}` });
      persist();
      return clone(c);
    },
    async impactoBaja(id) {
      const d = db();
      return {
        usuarios: d.usuarios.filter((u) => u.clienteId === id && u.estado !== "baja").length,
        proyectos: d.proyectos.filter((p) => p.clienteId === id && p.estado !== "baja" && p.estado !== "finalizado").length,
      };
    },
    async cambiarEstado(id, estado, motivo) {
      await delay();
      const d = db();
      const c = must(d.clientes.find((x) => x.id === id), "Cliente no encontrado");
      const prev = c.estado;
      c.estado = estado;
      const accion = estado === "baja" ? "cliente.baja" : estado === "suspendido" ? "cliente.suspender" : "cliente.reactivar";
      audit({ accion, entidad: "cliente", entidadId: id, detalle: `${prev} → ${estado}. Motivo: ${motivo}` });
      if (estado === "baja") {
        d.usuarios.filter((u) => u.clienteId === id && u.estado !== "baja").forEach((u) => {
          u.estado = "baja";
          audit({ accion: "usuario.baja", entidad: "usuario", entidadId: u.id, detalle: `Baja en cascada por baja del cliente ${c.razonSocial}` });
        });
        d.proyectos.filter((p) => p.clienteId === id && p.estado !== "baja" && p.estado !== "finalizado").forEach((p) => {
          p.estado = "baja";
          audit({ accion: "proyecto.baja", entidad: "proyecto", entidadId: p.id, detalle: `Baja en cascada por baja del cliente ${c.razonSocial}` });
        });
      }
      persist();
      return clone(c);
    },
  },

  usuarios: {
    async list() { await delay(); return clone(db().usuarios); },
    async invitar(data) {
      await delay();
      const d = db();
      if (d.usuarios.some((u) => u.email.toLowerCase() === data.email.toLowerCase() && u.estado !== "baja")) {
        throw new Error("Ya existe un usuario activo con ese correo.");
      }
      const u = { ...data, id: uid(), estado: "activo" as const, creadoEn: new Date().toISOString() };
      d.usuarios.unshift(u);
      audit({ accion: "usuario.invitar", entidad: "usuario", entidadId: u.id, detalle: `Invitación a ${u.email} (${u.rol})` });
      persist();
      return clone(u);
    },
    async cambiarRol(id, rol) {
      await delay();
      const u = must(db().usuarios.find((x) => x.id === id), "Usuario no encontrado");
      const prev = u.rol;
      u.rol = rol;
      audit({ accion: "usuario.rol", entidad: "usuario", entidadId: id, detalle: `${prev} → ${rol}` });
      persist();
      return clone(u);
    },
    async cambiarEstado(id, estado, motivo) {
      await delay();
      const u = must(db().usuarios.find((x) => x.id === id), "Usuario no encontrado");
      const prev = u.estado;
      u.estado = estado;
      const accion = estado === "baja" ? "usuario.baja" : estado === "suspendido" ? "usuario.suspender" : "usuario.reactivar";
      audit({ accion, entidad: "usuario", entidadId: id, detalle: `${prev} → ${estado}. Motivo: ${motivo}` });
      persist();
      return clone(u);
    },
  },

  proyectos: {
    async list() { await delay(); return clone(db().proyectos); },
    async get(id) { await delay(); return clone(db().proyectos.find((p) => p.id === id) ?? null); },
    async create(data) {
      await delay();
      const p = { ...data, id: uid() };
      db().proyectos.unshift(p);
      audit({ accion: "proyecto.crear", entidad: "proyecto", entidadId: p.id, detalle: `Proyecto "${p.nombre}"` });
      persist();
      return clone(p);
    },
    async update(id, data) {
      await delay();
      const p = must(db().proyectos.find((x) => x.id === id), "Proyecto no encontrado");
      Object.assign(p, data);
      audit({ accion: "proyecto.editar", entidad: "proyecto", entidadId: id, detalle: `Campos: ${Object.keys(data).join(", ")}` });
      persist();
      return clone(p);
    },
    async cambiarEstado(id, estado, motivo) {
      await delay(60);
      const p = must(db().proyectos.find((x) => x.id === id), "Proyecto no encontrado");
      const prev = p.estado;
      p.estado = estado;
      audit({ accion: estado === "baja" ? "proyecto.baja" : "proyecto.estado", entidad: "proyecto", entidadId: id, detalle: `${prev} → ${estado}${motivo ? `. Motivo: ${motivo}` : ""}` });
      persist();
      return clone(p);
    },
  },

  inventario: {
    async listItems() { await delay(); return clone(db().items); },
    async listMovimientos() { await delay(); return clone(db().movimientos); },
    async createItem(data) {
      await delay();
      const d = db();
      const item = { ...data, sku: siguienteSku(data.categoria, d.items) };
      d.items.push(item);
      audit({ accion: "inventario.crear", entidad: "inventario", entidadId: item.sku, detalle: item.descripcion });
      persist();
      return clone(item);
    },
    async updateItem(sku, data) {
      await delay(60);
      const i = must(db().items.find((x) => x.sku === sku), "Ítem no encontrado");
      const cambios = Object.entries(data).map(([k, v]) => `${k}: ${String((i as unknown as Record<string, unknown>)[k] ?? "—")} → ${String(v ?? "—")}`);
      Object.assign(i, data);
      audit({ accion: "inventario.editar", entidad: "inventario", entidadId: sku, detalle: cambios.join("; ") });
      persist();
      return clone(i);
    },
    async deleteItem(sku, motivo) {
      await delay();
      const d = db();
      d.items = d.items.filter((x) => x.sku !== sku);
      audit({ accion: "inventario.eliminar", entidad: "inventario", entidadId: sku, detalle: `Motivo: ${motivo}` });
      persist();
    },
    async registrarMovimiento(data) {
      await delay();
      const d = db();
      const item = must(d.items.find((x) => x.sku === data.sku), `SKU inexistente: ${data.sku}`);
      if (!Number.isInteger(data.cantidad) || data.cantidad <= 0) throw new Error("La cantidad debe ser un entero mayor que 0.");
      if (data.tipo === "Salida") {
        const err = validarSalida(stockMap([item], d.movimientos).get(item.sku) ?? 0, data.cantidad);
        if (err) throw new Error(err);
      }
      const m = { id: uid(), fecha: data.fecha ?? new Date().toISOString(), sku: data.sku, tipo: data.tipo, cantidad: data.cantidad, proyecto: data.proyecto || undefined, nota: data.nota || undefined };
      d.movimientos.push(m);
      audit({ accion: "inventario.movimiento", entidad: "inventario", entidadId: m.sku, detalle: `${m.tipo} de ${m.cantidad} ${item.unidad}${m.proyecto ? ` · ${m.proyecto}` : ""}${m.nota ? ` · ${m.nota}` : ""}` });
      persist();
      return clone(m);
    },
    async importarMovimientos(rows: NuevoMovimiento[]) {
      let n = 0;
      for (const r of rows) {
        await mockApi.inventario.registrarMovimiento(r);
        n++;
      }
      audit({ accion: "inventario.importar", entidad: "inventario", entidadId: "csv", detalle: `${n} movimientos importados desde CSV` });
      persist();
      return n;
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
