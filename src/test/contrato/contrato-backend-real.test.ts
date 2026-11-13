import { describe, it } from "vitest";
import { ejecutarSuiteContrato } from "./suite";

/**
 * La misma suite contra el BACKEND REAL. Hoy se omite: **backend no disponible**. Cuando exista, se
 * sustituye la fábrica por el cliente HTTP con el `AuthTokenProvider` real (pendiente del ADR de
 * identidad), la URL de `VITE_API_BASE_URL` y un `reiniciar()` contra un tenant de prueba.
 */
const MOTIVO_OMISION = "backend no disponible";

describe.skip(`Contrato de la API — backend real (omitida: ${MOTIVO_OMISION})`, () => {
  ejecutarSuiteContrato(
    "backend real",
    async () => {
      throw new Error(MOTIVO_OMISION);
    },
    { incluirRespaldo: false },
  );
  it("pendiente", () => {});
});
