import { describe, expect, it } from "vitest";
import { fmtFecha } from "@/lib/format";
import { diasSinRespaldo, hayQueRecordarRespaldo, marcarRespaldo } from "@/lib/respaldo-estado";

describe("fechas sin hora", () => {
  it("un día AAAA-MM-DD se muestra como ese día (no el anterior por la zona horaria)", () => {
    expect(fmtFecha("2026-11-15")).toContain("15");
    expect(fmtFecha("2026-01-01")).toContain("2026");
    expect(fmtFecha("2026-01-01")).toContain("01");
  });
  it("un instante ISO sigue convirtiéndose a Bogotá", () => {
    // 2026-11-16T03:00Z son las 22:00 del 15 en Bogotá
    expect(fmtFecha("2026-11-16T03:00:00.000Z")).toContain("15");
  });
});

describe("recordatorio de respaldo", () => {
  const dia = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000);
  it("cuenta desde el primer uso si nunca se hizo un respaldo", () => {
    window.localStorage.clear();
    expect(diasSinRespaldo(dia(0))).toBe(0); // fija el primer uso
    expect(hayQueRecordarRespaldo(dia(7))).toBe(false);
    expect(hayQueRecordarRespaldo(dia(8))).toBe(true);
  });
  it("un respaldo reinicia la cuenta", () => {
    window.localStorage.clear();
    diasSinRespaldo(dia(0));
    marcarRespaldo(dia(20));
    expect(hayQueRecordarRespaldo(dia(26))).toBe(false);
    expect(hayQueRecordarRespaldo(dia(28))).toBe(true);
  });
});
