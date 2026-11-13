import { afterAll, beforeAll } from "vitest";
import { crearApiHttp } from "@/lib/api/http/cliente";
import { crearTransporteHttp } from "@/lib/api/http/transporte";
import { iniciarFixture, type Fixture } from "./servidor-fixture";
import { ejecutarSuiteContrato } from "./suite";

// La MISMA suite, ahora pasando por el cliente HTTP y un servidor local de prueba (sin AWS).
let fixture: Fixture;
beforeAll(async () => {
  fixture = await iniciarFixture();
});
afterAll(async () => {
  await fixture.cerrar();
});

ejecutarSuiteContrato(
  "cliente HTTP ↔ fixture local",
  async () => {
    const api = crearApiHttp(
      crearTransporteHttp({
        baseUrl: fixture.url,
        tokenProvider: { getToken: async () => fixture.token },
      }),
    );
    return {
      api,
      reiniciar: async () => {
        await fetch(`${fixture.url}/__prueba__/reiniciar`, { method: "POST", body: "{}" });
      },
    };
  },
  { incluirRespaldo: true },
);
