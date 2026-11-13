import { describe, it } from "vitest";
import { crearApiHttp } from "@/lib/api/http/cliente";
import { crearTransporteHttp } from "@/lib/api/http/transporte";
import { ejecutarSuiteContrato } from "./suite";

/**
 * La MISMA suite contra el BACKEND REAL (API desplegada, o el servidor local sobre Aurora real).
 * Se activa con variables de entorno; sin ellas se omite y lo dice (no hay backend al que llamar):
 *
 *   PANEL_API_URL      base de la API (sin /v1), p. ej. https://xxxx.execute-api.us-east-1.amazonaws.com
 *   PANEL_API_COOKIE   (API desplegada) valor completo de la cabecera Cookie de una sesion valida
 *   PANEL_API_CSRF     (API desplegada) valor de la cookie panel_csrf
 *   PANEL_API_ORIGIN   (API desplegada) origen del panel, p. ej. https://admin.iotingdev.com
 *
 * Cada prueba trabaja en un AMBITO NUEVO (cliente propietario de prueba): los movimientos y la
 * auditoria son inmutables en la base, asi que «volver a la semilla» es sembrar otro ambito. Ese
 * mecanismo solo existe en entornos de prueba (PANEL_PRUEBAS=1 en el backend).
 */
const URL_API = process.env["PANEL_API_URL"];
const COOKIE = process.env["PANEL_API_COOKIE"];
const CSRF = process.env["PANEL_API_CSRF"];
const ORIGEN = process.env["PANEL_API_ORIGEN"] ?? process.env["PANEL_API_ORIGIN"];

if (!URL_API) {
  describe.skip("Contrato de la API — backend real (omitida: PANEL_API_URL no definida)", () => {
    it("pendiente", () => {});
  });
} else {
  const base = URL_API.replace(/\/+$/, "");
  ejecutarSuiteContrato(
    "backend real",
    async () => {
      const ambito = crypto.randomUUID();
      const cabeceras = (): Record<string, string> => ({
        "x-panel-ambito-prueba": ambito,
        ...(COOKIE ? { Cookie: COOKIE } : {}),
        ...(CSRF ? { "x-csrf-token": CSRF } : {}),
        ...(ORIGEN ? { Origin: ORIGEN } : {}),
      });
      // Reintenta mientras la base despierta (503 reintentable con Retry-After), como el cliente real.
      const fetchPanel: typeof fetch = async (input, init) => {
        for (let intento = 0; ; intento++) {
          const r = await fetch(input, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), ...cabeceras() },
          });
          if (r.status !== 503 || intento >= 30) return r;
          await new Promise((ok) => setTimeout(ok, 4000));
        }
      };
      const api = crearApiHttp(
        crearTransporteHttp({
          baseUrl: base,
          tokenProvider: { getToken: async () => "cookie" },
          fetchImpl: fetchPanel,
          construirUrl: (b, p) => `${b}/v1/${p.interfaz}/${p.operacion}`,
        }),
      );
      return {
        api,
        reiniciar: async () => {
          const r = await fetchPanel(`${base}/v1/__prueba__/reiniciar`, {
            method: "POST",
            body: "{}",
          });
          if (!r.ok)
            throw new Error(
              `No se pudo sembrar el ámbito de prueba: HTTP ${r.status} ${await r.text()}`,
            );
        },
      };
    },
    { incluirRespaldo: false },
  );
}
