import { crearApiHttp } from "./http/cliente";
import { proveedorCsrfPorCookie, type AuthTokenProvider } from "./http/auth-token";
import { crearAuthSesion } from "./http/auth-sesion";
import { marcarDespertando } from "./http/estado-conexion";
import { crearTransporteHttp, ESPERAS_REANUDACION_MS } from "./http/transporte";
import { mockApi } from "./mock";
import type { Api } from "./types";

export type ApiMode = "mock" | "api";

export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === "api" ? "api" : "mock";
/** Base del backend para `VITE_API_MODE=api`. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * Sesión real del operador (ADR-0046, propuesto): cookie HttpOnly + valor anti-CSRF, con espera y
 * reintento cuando la base de datos se está reanudando («Despertando la base de datos…»).
 */
function crearApiSesionReal(): Api {
  const transporte = crearTransporteHttp({
    baseUrl: API_BASE_URL,
    tokenProvider: proveedorCsrfPorCookie(),
    esquema: "cookie",
    reintentoReanudacion: { esperasMs: ESPERAS_REANUDACION_MS, alEsperar: marcarDespertando },
  });
  return crearApiHttp(
    transporte,
    crearAuthSesion(transporte, { urlPortal: import.meta.env.VITE_PORTAL_ACCESO_URL }),
  );
}

/**
 * Único punto de conexión. `mock` (por defecto) es la capa simulada de siempre. `api` usa el
 * cliente HTTP: con la configuración que se le inyecte (pruebas) o, por defecto, con la sesión real
 * del operador.
 */
export function seleccionarApi(
  modo: ApiMode,
  config?: { baseUrl: string; tokenProvider: AuthTokenProvider },
): Api {
  if (modo !== "api") return mockApi;
  if (config) return crearApiHttp(crearTransporteHttp(config));
  return crearApiSesionReal();
}

export const api: Api = seleccionarApi(API_MODE);
export type * from "./types";
export { ErrorApi } from "./http/errores";
