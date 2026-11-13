/**
 * Servidor de prueba LOCAL (fixture). Sirve el cliente HTTP en las pruebas para demostrar que el
 * adaptador cumple el contrato sin AWS: recibe las mismas llamadas que haría contra un backend y las
 * resuelve con la implementación `mock`, devolviendo errores con los estados HTTP del contrato §8.
 *
 * NO es un backend ni define endpoints de ningún backend: la forma de las rutas es la convención
 * provisional del cliente (`POST /{interfaz}/{operacion}`) y solo existe dentro de las pruebas.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mockApi, resetMockDb } from "@/lib/api/mock";

/** Estado HTTP del contrato §8 para un error de la implementación de referencia. */
export function estadoHttpDeError(mensaje: string): number {
  if (/^Importación rechazada/.test(mensaje)) return 409; // lote rechazado
  if (/exige un motivo|Escriba exactamente|Respaldo inválido/i.test(mensaje)) return 422;
  if (/no encontrad|inexistente/i.test(mensaje) && !/destino/i.test(mensaje)) return 404;
  if (
    /Stock insuficiente|tiene movimientos|No se puede reactivar|está cancelado|dejaría el stock negativo|No se puede quitar|no admite/i.test(
      mensaje,
    )
  )
    return 409;
  return 422; // validación de campo
}

export interface PeticionRegistrada {
  ruta: string;
  authorization: string | undefined;
  cuerpo: unknown;
}
export interface Fixture {
  url: string;
  token: string;
  peticiones: PeticionRegistrada[];
  cerrar(): Promise<void>;
}

const leerCuerpo = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = "";
    req.on("data", (c: Buffer) => (s += c.toString("utf8")));
    req.on("end", () => resolve(s));
  });

export async function iniciarFixture(token = "token-de-prueba"): Promise<Fixture> {
  const peticiones: PeticionRegistrada[] = [];
  const api = mockApi as unknown as Record<
    string,
    Record<string, (...a: unknown[]) => Promise<unknown>>
  >;
  const servidor: Server = createServer(async (req, res) => {
    const responder = (estado: number, cuerpo: unknown) => {
      res.writeHead(estado, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cuerpo));
    };
    const ruta = (req.url ?? "").split("?")[0] ?? "";
    const texto = await leerCuerpo(req);
    let cuerpo: unknown;
    try {
      cuerpo = texto ? JSON.parse(texto) : undefined;
    } catch {
      return responder(422, { mensaje: "El cuerpo no es JSON." });
    }
    peticiones.push({ ruta, authorization: req.headers.authorization, cuerpo });

    // Control de la prueba (no es parte del contrato): vuelve a la semilla.
    if (ruta === "/__prueba__/reiniciar") {
      resetMockDb();
      return responder(200, {});
    }
    if (req.headers.authorization !== `Bearer ${token}`)
      return responder(401, { mensaje: "No hay sesión: ingrese de nuevo." });
    const [, interfaz = "", operacion = ""] = ruta.split("/");
    const op = api[interfaz]?.[operacion];
    if (req.method !== "POST" || !op)
      return responder(404, { mensaje: "Operación no encontrada." });
    try {
      const args = ((cuerpo as { args?: unknown[] } | undefined)?.args ?? []) as unknown[];
      const resultado = await op(...args);
      return responder(200, resultado === undefined ? {} : { resultado });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      return responder(estadoHttpDeError(mensaje), { mensaje });
    }
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    peticiones,
    cerrar: () => new Promise<void>((r) => servidor.close(() => r())),
  };
}
