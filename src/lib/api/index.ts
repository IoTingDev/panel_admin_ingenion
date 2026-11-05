import { mockApi } from "./mock";
import type { Api } from "./types";

export type ApiMode = "mock" | "api";

export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === "api" ? "api" : "mock";
/** Declarada para la futura implementación HTTP; aún no se usa. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

function selectApi(): Api {
  if (API_MODE === "api") {
    // Punto único de cambio: aquí se conectará la implementación HTTP real.
    console.warn("VITE_API_MODE=api aún no tiene implementación; usando datos simulados.");
  }
  return mockApi;
}

export const api: Api = selectApi();
export type * from "./types";
