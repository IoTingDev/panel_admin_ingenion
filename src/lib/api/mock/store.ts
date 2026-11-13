import { inicializarSecuencias } from "@/lib/inventario";
import { uid } from "@/lib/format";
import type { Auditoria, Cliente } from "../types";
import { completarV2, migrarV1aV2 } from "./migracion";
import { ACTOR, buildSeed, type MockDb } from "./seed";

export const DB_KEY = "ioting.mock.db.v2";
/** La v1 se conserva intacta como respaldo tras migrar. */
export const DB_KEY_V1 = "ioting.mock.db.v1";
export const SESSION_KEY = "ioting.mock.session.v1";
export const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

let cache: MockDb | null = null;

/** Base en memoria; la lee del almacenamiento (migrando si hace falta) o la siembra. */
export function db(): MockDb {
  if (cache) return cache;
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        const guardada = JSON.parse(raw) as MockDb;
        guardada.secuencias ??= inicializarSecuencias(guardada.items, guardada.movimientos);
        cache = completarV2(guardada);
        return cache;
      } catch {
        /* reseed */
      }
    }
    const v1 = window.localStorage.getItem(DB_KEY_V1);
    if (v1) {
      try {
        cache = migrarV1aV2(JSON.parse(v1) as Record<string, unknown>);
        persist();
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

export function persist() {
  if (typeof window !== "undefined" && cache)
    window.localStorage.setItem(DB_KEY, JSON.stringify(cache));
}

/** Reemplaza toda la base (respaldo importado). */
export function reemplazarDb(nueva: MockDb) {
  cache = nueva;
  persist();
}

/** Descarta la copia en memoria y vuelve a leer del almacenamiento (útil en pruebas). */
export function resetMemoria() {
  cache = null;
}

export function resetMockDb() {
  cache = buildSeed();
  persist();
}

export const clone = <T>(v: T): T => structuredClone(v);

export function audit(data: Omit<Auditoria, "id" | "fecha" | "actor">): Auditoria {
  const ev: Auditoria = { id: uid(), fecha: new Date().toISOString(), actor: ACTOR, ...data };
  db().auditoria.unshift(ev);
  return ev;
}

/** Un usuario/proyecto/trabajo no se reactiva mientras su cliente esté en baja o suspendido. */
export function exigirClienteActivo(cliente: Cliente | undefined, que: string) {
  if (!cliente || cliente.estado === "activo") return;
  throw new Error(
    `No se puede reactivar ${que}: el cliente ${cliente.razonSocial} está en ${cliente.estado}. Reactive primero al cliente.`,
  );
}

export function must<T>(v: T | undefined, msg: string): T {
  if (v === undefined) throw new Error(msg);
  return v;
}

export const exigirMotivo = (motivo: string | undefined, que: string) => {
  if (!motivo || motivo.trim().length < 3) throw new Error(`${que} exige un motivo.`);
  return motivo.trim();
};
