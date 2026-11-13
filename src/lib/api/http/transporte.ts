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

/**
 * Cuando la base de datos del backend está reanudándose tras una pausa, la API responde 503 con
 * `reintentable: true` y `Retry-After`. El cliente espera con pausas crecientes y reintenta; por
 * defecto (sin esta configuración) un 503 es un error normal.
 */
export interface ReintentoReanudacion {
  /** Pausas (ms) entre intentos; la suma es el tiempo máximo de espera (~90 s en producción). */
  esperasMs: readonly number[];
  /** Se llama con `true` al empezar a esperar y con `false` al terminar (éxito o error). */
  alEsperar?: (esperando: boolean) => void;
  /** Inyectable para pruebas. */
  dormir?: (ms: number) => Promise<void>;
}

/** ~91 s en total: lo que tarda en reanudarse Aurora serverless v2 desde 0 ACU, con margen. */
export const ESPERAS_REANUDACION_MS = [
  3000, 3000, 5000, 5000, 8000, 8000, 10000, 10000, 12000, 12000, 15000,
] as const;

export interface ConfigTransporteHttp {
  /** `VITE_API_BASE_URL`. Vacía → el cliente falla con «no configurado» sin hacer la llamada. */
  baseUrl: string;
  tokenProvider: AuthTokenProvider;
  /**
   * Cómo viaja la credencial. `bearer` (por defecto): `Authorization: Bearer <token>`. `cookie`
   * (la sesión del operador, ADR-0046): la sesión va en una cookie HttpOnly que el navegador envía
   * solo (`credentials: "include"`) y el token del proveedor es el valor ANTI-CSRF, que se repite
   * en el encabezado `x-csrf-token`.
   */
  esquema?: "bearer" | "cookie";
  fetchImpl?: typeof fetch;
  reintentoReanudacion?: ReintentoReanudacion;
  /**
   * Cómo se arma la URL de una operación. Por defecto `{base}/{interfaz}/{operacion}`; con el
   * enrutador único del backend (`POST /v1/{interfaz}/{operacion}`) la base es `…/v1`.
   */
  construirUrl?: (baseUrl: string, p: PeticionOperacion) => string;
}

const urlPorDefecto = (baseUrl: string, p: PeticionOperacion) =>
  `${baseUrl.replace(/\/+$/, "")}/${p.interfaz}/${p.operacion}`;

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const esReanudando = (estado: number, cuerpo: unknown) =>
  estado === 503 &&
  !!cuerpo &&
  typeof cuerpo === "object" &&
  (cuerpo as { reintentable?: unknown }).reintentable === true;

/**
 * Transporte HTTP delgado: `POST` con `{ args }` en JSON y respuesta `{ resultado }`. Un estado no
 * exitoso se traduce a `ErrorApi` conservando el mensaje del servidor.
 */
export function crearTransporteHttp(config: ConfigTransporteHttp): Transporte {
  const construirUrl = config.construirUrl ?? urlPorDefecto;
  const esquema = config.esquema ?? "bearer";
  return {
    async invocar(p) {
      if (!config.baseUrl.trim())
        throw errorNoConfigurado("VITE_API_BASE_URL no está configurada.");
      // Sin credenciales no se hace la llamada: el proveedor lanza y el error sube tal cual.
      const token = await config.tokenProvider.getToken();
      const f = config.fetchImpl ?? fetch;
      const reintento = config.reintentoReanudacion;
      const dormir = reintento?.dormir ?? dormirReal;
      const encabezados: Record<string, string> =
        esquema === "cookie"
          ? { "Content-Type": "application/json", "x-csrf-token": token }
          : { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      let esperando = false;
      try {
        for (let intento = 0; ; intento++) {
          let respuesta: Response;
          try {
            respuesta = await f(construirUrl(config.baseUrl, p), {
              method: "POST",
              headers: encabezados,
              body: JSON.stringify({ args: p.args }),
              ...(esquema === "cookie" ? { credentials: "include" as const } : {}),
            });
          } catch {
            throw errorRed();
          }
          const cuerpo: unknown = await respuesta.json().catch(() => undefined);
          if (respuesta.ok)
            return cuerpo && typeof cuerpo === "object"
              ? (cuerpo as { resultado?: unknown }).resultado
              : undefined;
          const espera = reintento?.esperasMs[intento];
          if (esReanudando(respuesta.status, cuerpo) && espera !== undefined) {
            if (!esperando) {
              esperando = true;
              reintento?.alEsperar?.(true);
            }
            await dormir(espera);
            continue;
          }
          throw errorDeRespuesta(respuesta.status, cuerpo);
        }
      } finally {
        if (esperando) reintento?.alEsperar?.(false);
      }
    },
  };
}

export { ErrorApi };
