/**
 * Errores del cliente HTTP. Traducen el estado de la respuesta a los errores del contrato §8 y
 * **conservan el mensaje del servidor**, porque el panel lo muestra tal cual y las pruebas lo verifican.
 */
export type CodigoError =
  | "no_encontrado" // 404
  | "validacion" // 400 / 422
  | "regla_negocio" // 409
  | "sin_sesion" // 401
  | "sin_permiso" // 403
  | "no_configurado" // el cliente no tiene con qué llamar (URL o credenciales sin definir)
  | "red" // no hubo respuesta
  | "desconocido"; // cualquier otro estado

export class ErrorApi extends Error {
  readonly codigo: CodigoError;
  readonly estado: number | undefined;
  constructor(codigo: CodigoError, mensaje: string, estado?: number) {
    super(mensaje);
    this.name = "ErrorApi";
    this.codigo = codigo;
    this.estado = estado;
  }
}

/** Código de error del contrato §8 para un estado HTTP. */
export function codigoDeEstado(estado: number): CodigoError {
  switch (estado) {
    case 400:
    case 422:
      return "validacion";
    case 401:
      return "sin_sesion";
    case 403:
      return "sin_permiso";
    case 404:
      return "no_encontrado";
    case 409:
      return "regla_negocio";
    default:
      return "desconocido";
  }
}

const MENSAJE_POR_DEFECTO: Record<CodigoError, string> = {
  no_encontrado: "Recurso no encontrado.",
  validacion: "Los datos enviados no son válidos.",
  regla_negocio: "La operación incumple una regla de negocio.",
  sin_sesion: "No hay sesión: ingrese de nuevo.",
  sin_permiso: "No tiene permiso para esta operación.",
  no_configurado: "El cliente de la API no está configurado.",
  red: "No se pudo conectar con el servidor.",
  desconocido: "El servidor no pudo completar la operación.",
};

/** Construye el error a partir del estado y del cuerpo (`{ mensaje }`) de una respuesta no exitosa. */
export function errorDeRespuesta(estado: number, cuerpo: unknown): ErrorApi {
  const codigo = codigoDeEstado(estado);
  const mensaje =
    cuerpo &&
    typeof cuerpo === "object" &&
    typeof (cuerpo as { mensaje?: unknown }).mensaje === "string"
      ? (cuerpo as { mensaje: string }).mensaje
      : MENSAJE_POR_DEFECTO[codigo];
  return new ErrorApi(codigo, mensaje, estado);
}

export const errorRed = () => new ErrorApi("red", MENSAJE_POR_DEFECTO.red);
export const errorNoConfigurado = (mensaje?: string) =>
  new ErrorApi("no_configurado", mensaje ?? MENSAJE_POR_DEFECTO.no_configurado);
