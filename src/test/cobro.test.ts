import { describe, expect, it } from "vitest";
import { cobroAData, cobroDeEntidad, cobroVacio } from "@/lib/cobro";
import { ingresoRecurrente, rotuloSuscripcion } from "@/lib/cobro";

describe("ingreso recurrente", () => {
  it("mensualidad y anualidad activas se convierten a mes y año; lo inactivo o sin valor no suma", () => {
    const r = ingresoRecurrente([
      { modalidad: "mensual", valorRecurrente: 450_000, activa: true },
      { modalidad: "anual", valorRecurrente: 1_200_000, activa: true },
      { modalidad: "mensual", valorRecurrente: 999_999, activa: false },
      { modalidad: "anual", activa: true },
      { activa: true, valorRecurrente: 5 },
    ]);
    expect(r).toEqual({ activas: 2, mensual: 550_000, anual: 6_600_000 });
  });
  it("sin suscripciones da cero", () => {
    expect(ingresoRecurrente([])).toEqual({ activas: 0, mensual: 0, anual: 0 });
  });
});

describe("etiqueta de suscripcion", () => {
  it("solo si hay modalidad y esta en operacion", () => {
    expect(rotuloSuscripcion("mensual", true)).toBe("Mensualidad activa");
    expect(rotuloSuscripcion("anual", true)).toBe("Anualidad activa");
    expect(rotuloSuscripcion("mensual", false)).toBeNull();
    expect(rotuloSuscripcion(undefined, true)).toBeNull();
  });
});

describe("formulario de cobro -> API", () => {
  it("convierte horas decimales a minutos y valida", () => {
    const d = cobroAData({ ...cobroVacio, horas: "2,5", valorHora: "80000" }, undefined);
    expect(d.minutosTrabajo).toBe(150);
    expect(d.valorHora).toBe(80_000);
    expect(() => cobroAData({ ...cobroVacio, horas: "abc" }, undefined)).toThrow(/horas/);
    expect(() => cobroAData({ ...cobroVacio, valorHora: "12.5" }, undefined)).toThrow(/enteros/);
  });
  it("un plan en cuotas exige valor pactado y suma exacto", () => {
    expect(() =>
      cobroAData({ ...cobroVacio, nCuotas: "3", primeraCuota: "2026-12-05" }, undefined),
    ).toThrow(/valor pactado/);
    const d = cobroAData({ ...cobroVacio, nCuotas: "3", primeraCuota: "2026-12-05" }, 8_500_000);
    expect(d.planPagos?.reduce((s, c) => s + c.valor, 0)).toBe(8_500_000);
  });
  it("editar otra cosa NO rehace el plan ni pierde los pagos; cambiar el valor lo rehace conservando las fechas de pago", () => {
    const base = cobroAData({ ...cobroVacio, nCuotas: "2", primeraCuota: "2026-12-05" }, 1_000);
    const conPago = {
      planPagos: base.planPagos?.map((c) =>
        c.numero === 1 ? { ...c, pagadaEn: "2026-12-04" } : c,
      ),
    };
    const igual = cobroAData(cobroDeEntidad(conPago), 1_000, conPago);
    expect(igual.planPagos).toEqual(conPago.planPagos);
    const nuevo = cobroAData(cobroDeEntidad(conPago), 2_000, conPago);
    expect(nuevo.planPagos?.map((c) => c.valor)).toEqual([1_000, 1_000]);
    expect(nuevo.planPagos?.[0]?.pagadaEn).toBe("2026-12-04");
    expect(nuevo.planPagos?.[1]?.pagadaEn).toBeUndefined();
  });
  it("un plan con cuotas desiguales (distintas de las que generaria el reparto) se conserva intacto al editar otra cosa", () => {
    const plan = {
      planPagos: [
        { numero: 1, vence: "2026-12-05", valor: 700, pagadaEn: "2026-12-01" },
        { numero: 2, vence: "2027-01-05", valor: 300 },
      ],
    };
    const d = cobroAData(cobroDeEntidad(plan), 1_000, plan);
    expect(d.planPagos).toEqual(plan.planPagos);
    const r = cobroAData({ ...cobroDeEntidad(plan), nCuotas: "3" }, 1_000, plan);
    expect(r.planPagos?.map((c) => c.valor)).toEqual([333, 333, 334]);
  });
  it("vaciar las cuotas de un plan existente lo quita; sin plan previo no inventa nada", () => {
    const conPlan = {
      planPagos: [
        { numero: 1, vence: "2026-12-05", valor: 10 },
        { numero: 2, vence: "2027-01-05", valor: 10 },
      ],
    };
    expect(cobroAData({ ...cobroDeEntidad(conPlan), nCuotas: "" }, 20, conPlan).planPagos).toEqual(
      [],
    );
    expect(cobroAData({ ...cobroVacio }, 20).planPagos).toBeUndefined();
  });
  it("sin modalidad no se envian valor recurrente ni inicio", () => {
    const d = cobroAData(
      { ...cobroVacio, valorRecurrente: "100", inicioSuscripcion: "2026-12-01" },
      undefined,
    );
    expect(d.valorRecurrente).toBeUndefined();
    expect(d.inicioSuscripcion).toBeUndefined();
  });
});

import { servicioSuscripcionActiva } from "@/lib/cobro";
import { conteoUnidades, unidadesParaConteo } from "@/lib/inventario";
import { fmtUnidades } from "@/lib/format";

describe("servicio por suscripcion: sigue activo aunque figure completado", () => {
  it("en curso y completado cuentan; programado y cancelado no", () => {
    expect(servicioSuscripcionActiva("en_curso")).toBe(true);
    expect(servicioSuscripcionActiva("completado")).toBe(true);
    expect(servicioSuscripcionActiva("programado")).toBe(false);
    expect(servicioSuscripcionActiva("cancelado")).toBe(false);
    expect(rotuloSuscripcion("mensual", servicioSuscripcionActiva("completado"))).toBe(
      "Mensualidad activa",
    );
    expect(rotuloSuscripcion("mensual", servicioSuscripcionActiva("cancelado"))).toBeNull();
  });
});

describe("conteo de unidades en stock: 1000 g = 1 unidad", () => {
  it("un rollo de 1000 g cuenta 1, no 1000; el resto cuenta tal cual", () => {
    expect(unidadesParaConteo(1000, "g")).toBe(1);
    expect(unidadesParaConteo(955, "g")).toBe(0.955);
    expect(unidadesParaConteo(7, "und")).toBe(7);
    expect(unidadesParaConteo(1000, "kg")).toBe(1000);
  });
  it("la suma mezcla componentes y filamento sin inflarse", () => {
    const items = [
      { sku: "A", unidad: "und" },
      { sku: "B", unidad: "g" },
      { sku: "C", unidad: "g" },
    ];
    const stocks = new Map([
      ["A", 20],
      ["B", 1000],
      ["C", 6000],
    ]);
    const r = conteoUnidades(items, stocks);
    expect(r.total).toBe(27);
    expect(r.hayGramos).toBe(true);
    expect(conteoUnidades([{ sku: "A", unidad: "und" }], stocks)).toEqual({
      total: 20,
      hayGramos: false,
    });
  });
  it("el formato admite un decimal", () => {
    expect(fmtUnidades(27)).toBe("27");
    expect(fmtUnidades(26.955)).toBe("27");
    expect(fmtUnidades(26.45)).toBe("26,5");
  });
});
