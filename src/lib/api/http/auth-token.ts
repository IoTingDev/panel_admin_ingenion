import { ErrorApi, errorNoConfigurado } from "./errores";

/**
 * Puerto de credenciales: entrega el token con el que el cliente HTTP llama al backend.
 *
 * La implementación REAL queda **pendiente del ADR de identidad** (cómo una aplicación web consume
 * IAM Identity Center y cómo la API valida esa identidad; CONTRATO-API-PANEL.md §1 punto 2). Este
 * módulo no asume ningún proveedor, flujo ni pool: solo fija la forma de lo que se inyectará.
 */
export interface AuthTokenProvider {
  /** Token vigente. Debe lanzar si no hay credenciales; el cliente no hace la llamada en ese caso. */
  getToken(): Promise<string>;
}

/** Versión actual: no hay credenciales posibles todavía, así que falla en voz alta. */
export const proveedorNoConfigurado: AuthTokenProvider = {
  async getToken() {
    throw errorNoConfigurado(
      "La autenticación del operador no está configurada: pendiente del ADR de identidad.",
    );
  },
};

/** Nombre de la cookie con el valor anti-CSRF que emite la capa de sesión (ADR-0046). */
export const COOKIE_CSRF = "panel_csrf";

/**
 * Proveedor de la sesión real del operador (ADR-0046, propuesto): la sesión viaja en una cookie
 * HttpOnly (el script no la ve) y lo único legible es el valor anti-CSRF de la cookie `panel_csrf`,
 * que el transporte repite en `x-csrf-token`. Sin esa cookie no hay sesión: lanza `sin_sesion` y no
 * se hace ninguna llamada.
 */
export function proveedorCsrfPorCookie(
  leerCookies: () => string = () => (typeof document === "undefined" ? "" : document.cookie),
): AuthTokenProvider {
  return {
    async getToken() {
      for (const par of leerCookies().split(";")) {
        const i = par.indexOf("=");
        if (i > 0 && par.slice(0, i).trim() === COOKIE_CSRF) {
          const valor = decodeURIComponent(par.slice(i + 1).trim());
          if (valor) return valor;
        }
      }
      throw new ErrorApi("sin_sesion", "No hay sesión: ingrese de nuevo.", 401);
    },
  };
}
