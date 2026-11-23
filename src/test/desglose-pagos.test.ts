import { describe, expect, it } from "vitest";
import { desglose, horasDeMinutos, minutosDeHoras } from "@/lib/desglose";
import { generarPlan, resumenPagos, sumarMeses } from "@/lib/pagos";
import { errorPlanPagos } from "@/lib/dominio";

describe("desglose: todo se deriva de lo digitado", () => {
  it("2,5 h a 80.000 COP/h son 200.000 de desarrollo; con 45.000 de material cuesta 245.000", () => {
    const d = desglose({ valorPactado: 300_000, materiales: 45_000, minutosTrabajo: minutosDeHoras(2.5), valorHora: 80_000 });
    expect(d.desarrollo).toBe(200_000);
    expect(d.costoTotal).toBe(245_000);
    expect(d.diferencia).toBe(55_000);
    expect(d.sobreMateriales).toBe(255_000);
  });
  it("cobrar por debajo del costo da diferencia negativa", () => {
    const d = desglose({ valorPactado: 100_000, materiales: 45_000, minutosTrabajo: 120, valorHora: 80_000 });
    expect(d.costoTotal).toBe(205_000);
    expect(d.diferencia).toBe(-105_000);
  });
  it("sin horas o sin valor por hora NO inventa: desarrollo, costo total y diferencia son null", () => {
    for (const e of [
      { valorPactado: 300_000, materiales: 45_000 },
      { valorPactado: 300_000, materiales: 45_000, minutosTrabajo: 60 },
      { valorPactado: 300_000, materiales: 45_000, valorHora: 80_000 },
    ]) {
      const d = desglose(e);
      expect(d.desarrollo).toBeNull();
      expect(d.costoTotal).toBeNull();
      expect(d.diferencia).toBeNull();
      expect(d.sobreMateriales).toBe(255_000);
    }
  });
  it("sin valor pactado la diferencia es null, aunque haya horas", () => {
    expect(desglose({ materiales: 0, minutosTrabajo: 60, valorHora: 50_000 }).diferencia).toBeNull();
  });
  it("el redondeo es a peso entero y horas<->minutos son inversas", () => {
    expect(desglose({ materiales: 0, minutosTrabajo: 20, valorHora: 100_000 }).desarrollo).toBe(33_333);
    expect(minutosDeHoras(1.25)).toBe(75);
    expect(horasDeMinutos(75)).toBe(1.25);
  });
});

describe("plan de pagos: la suma es exactamente el valor pactado", () => {
  it("reparte 8.500.000 en 3 cuotas: la ultima absorbe el residuo y suma exacto", () => {
    const plan = generarPlan(8_500_000, 3, "2026-12-05");
    expect(plan.map((c) => c.valor)).toEqual([2_833_333, 2_833_333, 2_833_334]);
    expect(plan.reduce((s, c) => s + c.valor, 0)).toBe(8_500_000);
    expect(plan.map((c) => c.vence)).toEqual(["2026-12-05", "2027-01-05", "2027-02-05"]);
    expect(errorPlanPagos(plan, 8_500_000)).toBe("");
  });
  it("para cualquier total y n, la suma es exacta y el validador lo acepta", () => {
    for (const total of [1, 7, 1_000_000, 8_500_001, 123_456_789]) {
      for (const n of [1, 2, 3, 7, 12]) {
        if (n > total) continue;
        const plan = generarPlan(total, n, "2026-01-31");
        expect(plan.reduce((s, c) => s + c.valor, 0)).toBe(total);
        expect(errorPlanPagos(plan, total)).toBe("");
      }
    }
  });
  it("un fin de mes conserva el ultimo dia disponible", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(sumarMeses("2026-11-30", 3)).toBe("2027-02-28");
    expect(sumarMeses("2026-12-15", 2)).toBe("2027-02-15");
  });
  it("rechaza lo imposible: cuotas > total, n fuera de rango, total no entero", () => {
    expect(() => generarPlan(0, 3, "2026-12-05")).toThrow(/entero COP > 0/);
    expect(() => generarPlan(1_000, 0, "2026-12-05")).toThrow(/1 a 120/);
    expect(() => generarPlan(1_000, 121, "2026-12-05")).toThrow(/1 a 120/);
    expect(() => generarPlan(10.5, 2, "2026-12-05")).toThrow(/entero COP > 0/);
  });
  it("el validador detecta un plan que no suma el valor pactado", () => {
    const plan = generarPlan(900, 3, "2026-12-05");
    expect(errorPlanPagos(plan, 1_000)).toMatch(/suman 900.*1000/);
  });
  it("resumen: cobrado, por cobrar y vencido salen de las cuotas", () => {
    const plan = generarPlan(900, 3, "2026-12-05").map((c, i) => (i === 0 ? { ...c, pagadaEn: "2026-12-04" } : c));
    const r = resumenPagos(plan, "2027-01-20");
    expect(r).toEqual({ total: 900, cobrado: 300, porCobrar: 600, vencido: 300, pagadas: 1, cuotas: 3 });
    expect(r.cobrado + r.porCobrar).toBe(r.total);
  });
});
