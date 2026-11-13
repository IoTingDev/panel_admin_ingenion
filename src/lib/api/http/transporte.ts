import type { AuthTokenProvider } from "./auth-token";
import { ErrorApi, errorDeRespuesta, errorNoConfigurado, errorRed } from "./errores";

/** Una operación de las interfaces de `types.ts`: nombre de interfaz, de operación y argumentos. */
export interface PeticionOperacion {
  interfaz: string;
  operacion: string;
  args: unknown[];
}

/** Puerto de transporte: lo único que el adaptador necesita para ejecutar una operación. */
export interface Transporte {
  invocar(peticion: PeticionOperacion): Promise<unknown>;
}

export interface ConfigTransporteHttp {
  /** `VITE_API_BASE_URL`. Vacía → el cliente falla con «no configurado» sin hacer la llamada. */
  baseUrl: string;
  tokenProvider: AuthTokenProvider;
  fetchImpl?: typeof fetch;
  /**
   * Cómo se arma la URL de una operación. **Por defecto, una convención PROVISIONAL del cliente**
   * derivada mecánicamente de los nombres de `types.ts` (`{base}/{interfaz}/{operacion}`); NO es el
   * diseño de endpoints del backend, que lo fija la propuesta de Fase 2. Cuando exista, se inyecta
   * aquí sin tocar el resto.
   */
  construirUrl?: (baseUrl: string, p: PeticionOperacion) => string;
}

const urlPorDefecto = (baseUrl: string, p: PeticionOperacion) =>
  `${baseUrl.replace(/\/+$/, "")}/${p.interfaz}/${p.operacion}`;

/**
 * Transporte HTTP delgado: `POST` con `{ args }` en JSON, `Authorization: Bearer <token>` y
 * respuesta `{ resultado }`. Un estado no exitoso se traduce a `ErrorApi` conservando el mensaje.
 * El esquema `Bearer` es el estándar de los autorizadores JWT; su confirmación forma parte del ADR de identidad.
 */
export function crearTransporteHttp(config: ConfigTransporteHttp): Transporte {
  const construirUrl = config.construirUrl ?? urlPorDefecto;
  return {
    async invocar(p) {
      if (!config.baseUrl.trim())
        throw errorNoConfigurado("VITE_API_BASE_URL no está configurada.");
      // Sin credenciales no se hace la llamada: el proveedor lanza y el error sube tal cual.
      const token = await config.tokenProvider.getToken();
      const f = config.fetchImpl ?? fetch;
      let respuesta: Response;
      try {
        respuesta = await f(construirUrl(config.baseUrl, p), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ args: p.args }),
        });
      } catch {
        throw errorRed();
      }
      const cuerpo: unknown = await respuesta.json().catch(() => undefined);
      if (!respuesta.ok) throw errorDeRespuesta(respuesta.status, cuerpo);
      return cuerpo && typeof cuerpo === "object"
        ? (cuerpo as { resultado?: unknown }).resultado
        : undefined;
    },
  };
}

export { ErrorApi };
