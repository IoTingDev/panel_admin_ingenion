import { crearApiHttp } from "./http/cliente";
import { proveedorNoConfigurado, type AuthTokenProvider } from "./http/auth-token";
import { crearTransporteHttp } from "./http/transporte";
import { mockApi } from "./mock";
import type { Api } from "./types";

export type ApiMode = "mock" | "api";

export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === "api" ? "api" : "mock";
/** Base del backend para `VITE_API_MODE=api`. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Único punto de conexión. `mock` (por defecto) es la capa simulada de siempre. `api` usa el
 * cliente HTTP con el proveedor de credenciales que se le inyecte; hoy es uno que lanza «no
 * configurado» (implementación real pendiente del ADR de identidad).
 */
export function seleccionarApi(
  modo: ApiMode,
  config: { baseUrl: string; tokenProvider: AuthTokenProvider } = {
    baseUrl: API_BASE_URL,
    tokenProvider: proveedorNoConfigurado,
  },
): Api {
  if (modo === "api") return crearApiHttp(crearTransporteHttp(config));
  return mockApi;
}

export const api: Api = seleccionarApi(API_MODE);
export type * from "./types";
export { ErrorApi } from "./http/errores";
