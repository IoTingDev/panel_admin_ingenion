import { errorNoConfigurado } from "./errores";

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
