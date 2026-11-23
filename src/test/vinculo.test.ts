import { describe, expect, it } from "vitest";
import { sugerirPuntual, ultimaActividad } from "@/lib/vinculo";

const c = {
  id: "c1",
  creadoEn: "2020-03-10T10:00:00-05:00",
  estado: "activo" as const,
  vinculo: undefined,
};
const tt = (o: Record<string, unknown>) =>
  ({
    clienteId: "c1",
    estado: "completado",
    registradoEn: "2021-01-01T00:00:00-05:00",
    ...o,
  }) as never;
const pr = (o: Record<string, unknown>) =>
  ({ clienteId: "c1", estado: "finalizado", ...o }) as never;

describe("sugerencia de cliente puntual (derivada, no se guarda)", () => {
  it("un cliente de un solo trabajo viejo y sin nada abierto se sugiere puntual", () => {
    const r = sugerirPuntual(c, [tt({ fechaFin: "2021-02-01" })], [], "2026-11-22");
    expect(r).toEqual({ desde: "2021-02-01" });
  });
  it("actividad reciente (menos de 12 meses) NO se sugiere", () => {
    expect(sugerirPuntual(c, [tt({ fechaFin: "2026-03-01" })], [], "2026-11-22")).toBeNull();
  });
  it("justo en el limite de 12 meses se sugiere; un dia antes no", () => {
    expect(sugerirPuntual(c, [tt({ fechaFin: "2025-11-22" })], [], "2026-11-22")).not.toBeNull();
    expect(sugerirPuntual(c, [tt({ fechaFin: "2025-11-23" })], [], "2026-11-22")).toBeNull();
  });
  it("con un servicio o proyecto abierto NO se sugiere, aunque lo ultimo sea viejo", () => {
    expect(
      sugerirPuntual(
        c,
        [
          tt({
            estado: "en_curso",
            fechaFin: undefined,
            registradoEn: "2021-01-01T00:00:00-05:00",
          }),
        ],
        [],
        "2026-11-22",
      ),
    ).toBeNull();
    expect(
      sugerirPuntual(c, [], [pr({ estado: "activo", fechaInicio: "2021-01-01" })], "2026-11-22"),
    ).toBeNull();
  });
  it("un cliente ya clasificado o dado de baja no se sugiere", () => {
    expect(
      sugerirPuntual({ ...c, vinculo: "recurrente" as never }, [], [], "2026-11-22"),
    ).toBeNull();
    expect(sugerirPuntual({ ...c, estado: "baja" as never }, [], [], "2026-11-22")).toBeNull();
  });
  it("la actividad de OTRO cliente no cuenta", () => {
    expect(
      sugerirPuntual(c, [tt({ clienteId: "otro", fechaFin: "2026-10-01" })], [], "2026-11-22"),
    ).not.toBeNull();
  });
  it("sin trabajos ni proyectos usa la fecha de alta", () => {
    expect(ultimaActividad(c, [], [])).toBe("2020-03-10");
  });
});
