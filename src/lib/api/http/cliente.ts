import type { Api, AuthApi } from "../types";
import { errorNoConfigurado } from "./errores";
import type { Transporte } from "./transporte";

/**
 * Operaciones de cada interfaz de `types.ts` (salvo `auth`). Una prueba la compara con la
 * implementación `mock` para que ninguna operación se olvide ni sobre.
 */
export const OPERACIONES = {
  clientes: [
    "list",
    "get",
    "create",
    "update",
    "impactoBaja",
    "hijosReactivables",
    "cambiarEstado",
  ],
  usuarios: ["list", "invitar", "cambiarRol", "cambiarEstado"],
  proyectos: ["list", "get", "create", "update", "cambiarEstado", "eliminar"],
  trabajos: ["list", "get", "create", "update", "cambiarEstado", "eliminar"],
  inventario: [
    "listItems",
    "listMovimientos",
    "createItem",
    "updateItem",
    "deleteItem",
    "darDeBaja",
    "registrarMovimiento",
    "importarMovimientos",
    "importarValores",
    "exportar",
  ],
  auditoria: ["list", "registrar"],
  configuracion: ["get", "actualizarInventario", "actualizarSectores", "limpiarDemo"],
  respaldo: ["exportar", "previsualizar", "importar"],
} as const satisfies Record<Exclude<keyof Api, "auth">, readonly string[]>;

/**
 * `AuthApi` en modo `api`: **puerto pendiente** del ADR de identidad. El operador entra por la vía
 * corporativa (CONTRATO-API-PANEL.md §9.1), cuyo mecanismo aún no está definido. Sin sesión, la
 * interfaz muestra el ingreso, y `login` explica por qué todavía no se puede.
 */
export const authPendiente: AuthApi = {
  async login() {
    throw errorNoConfigurado(
      "El ingreso del operador no está configurado: pendiente del ADR de identidad.",
    );
  },
  async logout() {},
  async currentUser() {
    return null;
  },
  async role() {
    return null;
  },
};

type OperacionDe = (...args: unknown[]) => Promise<unknown>;

/** Implementa las interfaces de `types.ts` sobre un transporte: cada método es una llamada delgada. */
export function crearApiHttp(transporte: Transporte, auth: AuthApi = authPendiente): Api {
  const construida: Record<string, Record<string, OperacionDe>> = {};
  for (const [interfaz, operaciones] of Object.entries(OPERACIONES)) {
    construida[interfaz] = {};
    for (const operacion of operaciones)
      construida[interfaz][operacion] = (...args) =>
        transporte.invocar({ interfaz, operacion, args });
  }
  return { ...construida, auth } as unknown as Api;
}
