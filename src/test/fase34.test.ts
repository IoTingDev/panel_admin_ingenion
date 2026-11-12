// Fases 3 y 4 — proyectos, trabajos técnicos, datos de demostración y respaldo.
import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, resetMemoria, resetMockDb } from "@/lib/api/mock";
import { completarV2 } from "@/lib/api/mock/migracion";
import type { MockDb } from "@/lib/api/mock/seed";
import { derivarAvisos } from "@/lib/avisos";
import { materialDeDestino } from "@/lib/material";
import { COLUMNAS_PROYECTO, ROTULO_ESTADO_PROYECTO } from "@/lib/dominio";
import type { NuevoTrabajo } from "@/lib/api/types";

const api = mockApi;
const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const dia = (d: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date(Date.now() + d * 86_400_000),
  );

beforeEach(() => {
  window.localStorage.clear();
  resetMockDb();
});

const clienteActivo = async () => (await api.clientes.list()).find((c) => c.estado === "activo")!;
const nuevoTrabajo = async (over: Partial<NuevoTrabajo> = {}): Promise<NuevoTrabajo> => ({
  clienteId: (await clienteActivo()).id,
  tipo: "cctv",
  titulo: "Trabajo de prueba",
  ...over,
});

describe("Fase 3 — estados y fechas de proyectos", () => {
  it("el estado «borrador» pasó a «En desarrollo»; las columnas del tablero son cuatro", async () => {
    const ps = await api.proyectos.list();
    expect(ps.some((p) => (p.estado as string) === "borrador")).toBe(false);
    expect(ps.filter((p) => p.estado === "en_desarrollo")).toHaveLength(2);
    expect(COLUMNAS_PROYECTO.map((e) => ROTULO_ESTADO_PROYECTO[e])).toEqual([
      "En desarrollo",
      "En operación",
      "Pausado",
      "Finalizado",
    ]);
  });
  it("una base guardada con «borrador» se completa a «en_desarrollo»", () => {
    const db = structuredClone(
      JSON.parse(
        JSON.stringify({
          proyectos: [{ id: "p", estado: "borrador" }],
          clientes: [],
          items: [],
          movimientos: [],
          auditoria: [],
        }),
      ),
    ) as unknown as MockDb;
    completarV2(db);
    expect(db.proyectos[0]!.estado).toBe("en_desarrollo");
    expect(db.proyectos[0]!.registradoEn).toBeTruthy();
  });
  it("crea con fecha de inicio pasada, conserva aparte el momento de registro y valida fin ≥ inicio", async () => {
    const c = await clienteActivo();
    const p = await api.proyectos.create({
      clienteId: c.id,
      nombre: "Proyecto antiguo",
      estado: "en_desarrollo",
      fechaInicio: "2026-01-10",
    });
    expect(p.fechaInicio).toBe("2026-01-10");
    expect(Math.abs(Date.parse(p.registradoEn!) - Date.now())).toBeLessThan(60_000);
    await expect(
      api.proyectos.create({
        clienteId: c.id,
        nombre: "Mal",
        estado: "activo",
        fechaInicio: "2026-03-01",
        fechaFin: "2026-02-01",
      }),
    ).rejects.toThrow(/fin/i);
    await expect(api.proyectos.update(p.id, { fechaFin: "2026-01-01" })).rejects.toThrow(/fin/i);
  });
  it("no se crea un proyecto para un cliente en baja o suspendido", async () => {
    const susp = (await api.clientes.list()).find((c) => c.estado === "suspendido")!;
    await expect(
      api.proyectos.create({ clienteId: susp.id, nombre: "X", estado: "en_desarrollo" }),
    ).rejects.toThrow(/cliente/i);
  });
});

describe("Fase 3 — eliminar proyectos y datos de demostración", () => {
  it("eliminar exige motivo, deja auditoría y conserva los movimientos de inventario", async () => {
    const p = (await api.proyectos.list()).find((x) => x.id.startsWith("p3000000"))!;
    const movsAntes = (await api.inventario.listMovimientos()).length;
    await expect(api.proyectos.eliminar(p.id, " ")).rejects.toThrow(/motivo/i);
    await api.proyectos.eliminar(p.id, "proyecto de demostración");
    expect((await api.proyectos.list()).some((x) => x.id === p.id)).toBe(false);
    expect((await api.inventario.listMovimientos()).length).toBe(movsAntes);
    const aud = await api.auditoria.list();
    expect(aud.some((e) => e.accion === "proyecto.eliminar" && e.entidadId === p.id)).toBe(true);
  });
  it("«Limpiar datos de demostración» pide la frase exacta", async () => {
    await expect(api.configuracion.limpiarDemo("eliminar demo")).rejects.toThrow(/ELIMINAR DEMO/);
    expect((await api.clientes.list()).length).toBe(6);
  });
  it("elimina solo lo marcado esDemo y nunca lo que creó el usuario", async () => {
    const mio = await api.clientes.create({ razonSocial: "Cliente mío", sector: "otro" });
    const pMio = await api.proyectos.create({
      clienteId: mio.id,
      nombre: "Proyecto mío",
      estado: "en_desarrollo",
    });
    const tMio = await api.trabajos.create(
      await nuevoTrabajo({ clienteId: mio.id, titulo: "Trabajo mío" }),
    );
    const demoClienteConHijoMio = (await api.clientes.list()).find((c) => c.esDemo)!;
    const pHijoMio = await api.proyectos.create({
      clienteId: demoClienteConHijoMio.id,
      nombre: "Hijo creado por mí",
      estado: "en_desarrollo",
    });
    await api.inventario.registrarMovimiento({
      sku: "SEN-002",
      tipo: "Entrada",
      cantidad: 1,
      nota: "mío",
    });
    const r = await api.configuracion.limpiarDemo("ELIMINAR DEMO");
    expect(r.proyectos).toBeGreaterThan(0);
    expect(r.trabajos).toBe(3);
    expect(r.clientesConservados).toBe(1); // el demo con un proyecto creado por el usuario
    const [cs, ps, ts, ms] = await Promise.all([
      api.clientes.list(),
      api.proyectos.list(),
      api.trabajos.list(),
      api.inventario.listMovimientos(),
    ]);
    expect(cs.map((c) => c.id).sort()).toEqual([mio.id, demoClienteConHijoMio.id].sort());
    expect(ps.map((p) => p.id).sort()).toEqual([pMio.id, pHijoMio.id].sort());
    expect(ts.map((t) => t.id)).toEqual([tMio.id]);
    expect(ms.some((m) => m.esDemo)).toBe(false);
    expect(ms.some((m) => m.nota === "mío")).toBe(true);
    expect((await api.auditoria.list()).some((e) => e.accion === "sistema.limpiar_demo")).toBe(
      true,
    );
  });
});

describe("Fase 3/4 — material consumido y su costo", () => {
  it("el costo de una salida es el vigente al registrarla, aunque luego cambie el valor", async () => {
    const p = (await api.proyectos.list())[0]!;
    await api.inventario.updateItem("SEN-002", { valorUnitario: 1000 });
    await api.inventario.registrarMovimiento({
      sku: "SEN-002",
      tipo: "Salida",
      cantidad: 3,
      destinoTipo: "proyecto",
      destinoId: p.id,
    });
    await api.inventario.updateItem("SEN-002", { valorUnitario: 9999 });
    await api.inventario.registrarMovimiento({
      sku: "SEN-001",
      tipo: "Salida",
      cantidad: 1,
      destinoTipo: "proyecto",
      destinoId: p.id,
    });
    const movs = await api.inventario.listMovimientos();
    const r = materialDeDestino(movs, "proyecto", p.id);
    const propias = r.movimientos.filter((m) => m.sku === "SEN-002" && m.costoAlSalir === 1000);
    expect(propias).toHaveLength(1);
    expect(r.sinCosto).toBeGreaterThanOrEqual(1); // SEN-001 no tenía valor
    expect(r.costoTotal).toBe(3000);
  });
  it("sin movimientos da cero y no inventa costo", () => {
    expect(materialDeDestino([], "trabajo", "x")).toEqual({
      movimientos: [],
      costoTotal: 0,
      sinCosto: 0,
    });
  });
});

describe("Fase 4 — trabajos técnicos", () => {
  it("la semilla trae 3 trabajos de demostración con códigos consecutivos", async () => {
    const ts = await api.trabajos.list();
    expect(ts.map((t) => t.codigo).sort()).toEqual(["TT-0001", "TT-0002", "TT-0003"]);
    expect(ts.every((t) => t.esDemo)).toBe(true);
  });
  it("el consecutivo no se reutiliza al eliminar", async () => {
    const a = await api.trabajos.create(await nuevoTrabajo());
    expect(a.codigo).toBe("TT-0004");
    await api.trabajos.eliminar(a.id, "creado por error");
    const b = await api.trabajos.create(await nuevoTrabajo());
    expect(b.codigo).toBe("TT-0005");
  });
  it("valida cliente activo, tipo y fechas (pasado permitido, fin ≥ inicio)", async () => {
    const susp = (await api.clientes.list()).find((c) => c.estado === "suspendido")!;
    await expect(api.trabajos.create(await nuevoTrabajo({ clienteId: susp.id }))).rejects.toThrow(
      /cliente/i,
    );
    await expect(
      api.trabajos.create(await nuevoTrabajo({ clienteId: "no-existe" })),
    ).rejects.toThrow(/cliente/i);
    await expect(
      api.trabajos.create(
        await nuevoTrabajo({ fechaInicio: "2026-05-02", fechaFin: "2026-05-01" }),
      ),
    ).rejects.toThrow(/fin/i);
    await expect(api.trabajos.create(await nuevoTrabajo({ titulo: " " }))).rejects.toThrow(
      /título/i,
    );
    const t = await api.trabajos.create(
      await nuevoTrabajo({ fechaProgramada: "2026-01-05", fechaInicio: "2026-01-06" }),
    );
    expect(t.fechaInicio).toBe("2026-01-06");
    await expect(api.trabajos.create(await nuevoTrabajo({ valorPactado: -5 }))).rejects.toThrow(
      /valor/i,
    );
  });
  it("cancelar exige motivo; en curso y completado completan las fechas reales", async () => {
    const t = await api.trabajos.create(await nuevoTrabajo({ fechaProgramada: dia(2) }));
    const enCurso = await api.trabajos.cambiarEstado(t.id, "en_curso");
    expect(enCurso.fechaInicio).toBe(hoy());
    const hecho = await api.trabajos.cambiarEstado(t.id, "completado");
    expect(hecho.fechaFin).toBe(hoy());
    const t2 = await api.trabajos.create(await nuevoTrabajo());
    await expect(api.trabajos.cambiarEstado(t2.id, "cancelado")).rejects.toThrow(/motivo/i);
    const c = await api.trabajos.cambiarEstado(t2.id, "cancelado", "el cliente desistió");
    expect(c.motivoCancelacion).toBe("el cliente desistió");
  });
  it("eliminar exige motivo y audita", async () => {
    const t = await api.trabajos.create(await nuevoTrabajo());
    await expect(api.trabajos.eliminar(t.id, "")).rejects.toThrow(/motivo/i);
    await api.trabajos.eliminar(t.id, "duplicado");
    expect(
      (await api.auditoria.list()).some(
        (e) => e.accion === "trabajo.eliminar" && e.entidadId === t.id,
      ),
    ).toBe(true);
  });
  it("la baja del cliente cancela sus trabajos abiertos en cascada; los cerrados no se tocan", async () => {
    const ts = await api.trabajos.list();
    const abierto = ts.find((t) => t.estado === "en_curso")!;
    const cerrado = ts.find((t) => t.estado === "completado")!;
    const impacto = await api.clientes.impactoBaja(abierto.clienteId);
    expect(impacto.trabajos).toBe(1);
    await api.clientes.cambiarEstado(abierto.clienteId, "baja", "prueba");
    const luego = await api.trabajos.list();
    const a = luego.find((t) => t.id === abierto.id)!;
    expect([a.estado, a.bajaPorCliente]).toEqual(["cancelado", true]);
    expect(luego.find((t) => t.id === cerrado.id)!.estado).toBe("completado");
    await expect(api.trabajos.cambiarEstado(a.id, "programado")).rejects.toThrow(
      /reactiv.*cliente/i,
    );
  });
  it("reactivar el cliente no reactiva los trabajos: los ofrece, y luego se pueden reactivar", async () => {
    const abierto = (await api.trabajos.list()).find((t) => t.estado === "en_curso")!;
    await api.clientes.cambiarEstado(abierto.clienteId, "baja", "prueba");
    await api.clientes.cambiarEstado(abierto.clienteId, "activo", "vuelve");
    expect((await api.trabajos.get(abierto.id))!.estado).toBe("cancelado");
    const h = await api.clientes.hijosReactivables(abierto.clienteId);
    expect(h.trabajos.map((t) => t.id)).toContain(abierto.id);
    const r = await api.trabajos.cambiarEstado(abierto.id, "programado");
    expect(r.estado).toBe("programado");
    expect(r.bajaPorCliente).toBeFalsy();
  });
  it("una salida con destino a un trabajo existe y cuenta en el material del trabajo", async () => {
    const t = await api.trabajos.create(await nuevoTrabajo());
    await api.inventario.updateItem("SEN-002", { valorUnitario: 2000 });
    await api.inventario.registrarMovimiento({
      sku: "SEN-002",
      tipo: "Salida",
      cantidad: 2,
      destinoTipo: "trabajo",
      destinoId: t.id,
    });
    const r = materialDeDestino(await api.inventario.listMovimientos(), "trabajo", t.id);
    expect([r.movimientos.length, r.costoTotal]).toEqual([1, 4000]);
    await expect(
      api.inventario.registrarMovimiento({
        sku: "SEN-002",
        tipo: "Salida",
        cantidad: 1,
        destinoTipo: "trabajo",
        destinoId: "nope",
      }),
    ).rejects.toThrow(/destino/i);
  });
  it("un trabajo cerrado o cancelado no admite más material", async () => {
    const t = await api.trabajos.create(await nuevoTrabajo());
    await api.trabajos.cambiarEstado(t.id, "cancelado", "el cliente desistió");
    await expect(
      api.inventario.registrarMovimiento({
        sku: "SEN-002",
        tipo: "Salida",
        cantidad: 1,
        destinoTipo: "trabajo",
        destinoId: t.id,
      }),
    ).rejects.toThrow(/cancelado|cerrado/i);
  });
  it("los avisos incluyen los trabajos programados con fecha vencida", () => {
    const avisos = derivarAvisos({
      proyectos: [],
      clientes: [],
      items: [],
      movimientos: [],
      trabajos: [
        { estado: "programado", fechaProgramada: "2026-01-01" },
        { estado: "programado", fechaProgramada: "2099-01-01" },
        { estado: "completado", fechaProgramada: "2026-01-01" },
        { estado: "programado" },
      ],
      hoy: "2026-11-12",
    });
    expect(avisos.map((a) => a.texto)).toEqual(["1 trabajo vencido sin iniciar"]);
  });
});

describe("Fase 4 — clientes y sectores configurables", () => {
  it("incluye residencial, comercial, industrial e institucional y guarda dirección y tipo", async () => {
    const cfg = await api.configuracion.get();
    for (const s of [
      "cacao",
      "café",
      "mango",
      "residencial",
      "comercial",
      "industrial",
      "institucional",
      "otro",
    ])
      expect(cfg.sectores).toContain(s);
    const c = await api.clientes.create({
      razonSocial: "Casa Pérez",
      sector: "residencial",
      direccion: "Cra 5 # 10-20",
      tipoCliente: "persona",
    });
    expect([c.direccion, c.tipoCliente]).toEqual(["Cra 5 # 10-20", "persona"]);
  });
  it("un sector fuera de la lista se rechaza; la lista es editable y un sector en uso no se quita", async () => {
    await expect(api.clientes.create({ razonSocial: "X", sector: "minería" })).rejects.toThrow(
      /sector/i,
    );
    const cfg = await api.configuracion.get();
    await api.configuracion.actualizarSectores([...cfg.sectores, "minería"]);
    expect((await api.clientes.create({ razonSocial: "X", sector: "minería" })).sector).toBe(
      "minería",
    );
    await expect(api.configuracion.actualizarSectores(["cacao"])).rejects.toThrow(/sector/i);
  });
});

describe("Respaldo completo en JSON", () => {
  it("exporta y reimporta: el estado vuelve a ser el del respaldo", async () => {
    const respaldo = await api.respaldo.exportar();
    expect(respaldo.formato).toBe("ioting-panel-respaldo");
    const texto = JSON.stringify(respaldo);
    const antes = (await api.clientes.list()).length;
    await api.clientes.create({ razonSocial: "Posterior al respaldo", sector: "otro" });
    await api.trabajos.eliminar((await api.trabajos.list())[0]!.id, "prueba de respaldo");
    expect((await api.clientes.list()).length).toBe(antes + 1);
    const prev = await api.respaldo.previsualizar(texto);
    expect(prev.entidades.find((e) => e.nombre === "clientes")).toEqual({
      nombre: "clientes",
      enRespaldo: antes,
      actual: antes + 1,
    });
    await api.respaldo.importar(texto);
    expect((await api.clientes.list()).length).toBe(antes);
    expect((await api.trabajos.list()).length).toBe(3);
    expect((await api.auditoria.list())[0]!.accion).toBe("sistema.respaldo_importar");
  });
  it("un archivo inválido se rechaza y no toca los datos", async () => {
    const antes = (await api.clientes.list()).length;
    for (const malo of [
      "no es json",
      "{}",
      JSON.stringify({ formato: "otro", version: 2, datos: {} }),
      JSON.stringify({
        formato: "ioting-panel-respaldo",
        version: 2,
        exportadoEn: "x",
        datos: { clientes: "no" },
      }),
    ])
      await expect(api.respaldo.importar(malo)).rejects.toThrow(/respaldo|inválid/i);
    expect((await api.clientes.list()).length).toBe(antes);
  });
  it("un archivo con datos completos pero de otro formato o versión futura se rechaza", async () => {
    const ok = await api.respaldo.exportar();
    await expect(
      api.respaldo.importar(JSON.stringify({ ...ok, formato: "otro-programa" })),
    ).rejects.toThrow(/no es un respaldo/i);
    await expect(api.respaldo.importar(JSON.stringify({ ...ok, version: 99 }))).rejects.toThrow(
      /versión/i,
    );
  });
  it("persiste al recargar (se guardó en el almacenamiento)", async () => {
    await api.clientes.create({ razonSocial: "Persistente", sector: "otro" });
    resetMemoria();
    expect((await api.clientes.list()).some((c) => c.razonSocial === "Persistente")).toBe(true);
  });
});

describe("el motivo se exige en la API, no solo en el formulario", () => {
  it("baja y suspensión de clientes, usuarios y baja de proyectos rechazan un motivo vacío", async () => {
    const c = (await api.clientes.list()).find((x) => x.estado === "activo")!;
    await expect(api.clientes.cambiarEstado(c.id, "baja", "")).rejects.toThrow(/motivo/i);
    await expect(api.clientes.cambiarEstado(c.id, "suspendido", "  ")).rejects.toThrow(/motivo/i);
    const u = (await api.usuarios.list()).find((x) => x.estado === "activo")!;
    await expect(api.usuarios.cambiarEstado(u.id, "baja", "")).rejects.toThrow(/motivo/i);
    const p = (await api.proyectos.list()).find((x) => x.estado === "activo")!;
    await expect(api.proyectos.cambiarEstado(p.id, "baja")).rejects.toThrow(/motivo/i);
    // y no cambió nada
    expect((await api.clientes.get(c.id))!.estado).toBe("activo");
    expect((await api.proyectos.get(p.id))!.estado).toBe("activo");
  });
});
