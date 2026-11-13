import { mockApi, resetMockDb } from "@/lib/api/mock";
import { ejecutarSuiteContrato } from "./suite";

// La suite contra la implementación de referencia (mock).
ejecutarSuiteContrato(
  "mock",
  async () => {
    window.localStorage.clear();
    return { api: mockApi, reiniciar: async () => resetMockDb() };
  },
  { incluirRespaldo: true },
);
