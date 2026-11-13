/**
 * SUITE DE CONTRATO. Una sola suite parametrizada por la implementación de `Api`: hoy se ejecuta
 * contra `mock` y contra el cliente HTTP servido por el fixture; mañana, contra el backend real.
 * Solo usa las operaciones de `types.ts` y las reglas e invariantes del contrato (§5 y §6): nada de
 * internos de ninguna implementación.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Api, ItemInventario, MovimientoInventario, NuevoTrabajo } from "@/lib/api/types";

export interface EntornoContrato {
  api: Api;
  /** Deja el sistema en el estado inicial de prueba (la semilla). */
  reiniciar(): Promise<void>;
}
export interface OpcionesSuite {
  /** El respaldo JSON es solo del modo mock: en el backend real no aplica (contrato §3.7). */
  incluirRespaldo: boolean;
}

const dia = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(
    new Date(Date.now() + n * 86_400_000),
  );

const nuevoItem = (
  over: Partial<Omit<ItemInventario, "sku">> = {},
): Omit<ItemInventario, "sku"> => ({
  grupo: "componentes",
  categoria: "Cámaras",
  subcategoria: "Domo",
  descripcion: "Cámara de prueba",
  marca_referencia: "X",
  cantidad_inicial: 5,
  unidad: "und",
  estado: "Disponible",
  ubicacion: "",
  stock_minimo: null,
  notas: "",
  valorUnitario: 100_000,
  ...over,
});

/** Stock = cantidad inicial + Σ entradas − Σ salidas, calculado aquí desde las listas del contrato. */
const stockDe = (items: ItemInventario[], movs: MovimientoInventario[], sku: string) => {
  const it = items.find((i) => i.sku === sku);
  if (!it) throw new Error(`no hay ítem ${sku}`);
  return movs.reduce(
    (a, m) => (m.sku !== sku ? a : m.tipo === "Entrada" ? a + m.cantidad : a - m.cantidad),
    it.cantidad_inicial,
  );
};

export function ejecutarSuiteContrato(
  nombre: string,
  crear: () => Promise<EntornoContrato>,
  opciones: OpcionesSuite,
) {
  describe(`Contrato de la API — ${nombre}`, () => {
    let api: Api;
    const stock = async (sku: string) =>
      stockDe(await api.inventario.listItems(), await api.inventario.listMovimientos(), sku);
    const clienteActivo = async () =>
      (await api.clientes.list()).find((c) => c.estado === "activo")!;
    const nuevoTrabajo = async (over: Partial<NuevoTrabajo> = {}): Promise<NuevoTrabajo> => ({
      clienteId: (await clienteActivo()).id,
      tipo: "cctv",
      titulo: "Servicio de prueba",
      ...over,
    });

    beforeEach(async () => {
      const entorno = await crear();
      await entorno.reiniciar();
      api = entorno.api;
    });

    describe("inventario (contrato §5.1, §5.2, §6)", () => {
      it("el stock es derivado: no existe como campo y se calcula con la fórmula", async () => {
        const it = await api.inventario.createItem(nuevoItem({ cantidad_inicial: 5 }));
        await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 2 });
        await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Entrada", cantidad: 1 });
        expect(await stock(it.sku)).toBe(4);
        const items = await api.inventario.listItems();
        expect(Object.keys(items[0]!)).not.toContain("stock");
        expect(Object.keys(items[0]!)).not.toContain("stockActual");
      });

      it("nunca queda stock negativo, tampoco con fecha pasada", async () => {
        const it = await api.inventario.createItem(nuevoItem({ cantidad_inicial: 1 }));
        await expect(
          api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 2 }),
        ).rejects.toThrow(/Stock insuficiente/);
        await expect(
          api.inventario.registrarMovimiento({
            sku: it.sku,
            tipo: "Salida",
            cantidad: 2,
            fecha: "2026-01-01",
          }),
        ).rejects.toThrow(/Stock insuficiente/);
        expect(await stock(it.sku)).toBe(1);
      });

      it("el SKU no se reutiliza al eliminar el último ítem", async () => {
        const a = await api.inventario.createItem(nuevoItem());
        await api.inventario.deleteItem(a.sku, "creado por error");
        const b = await api.inventario.createItem(nuevoItem());
        expect(b.sku).not.toBe(a.sku);
      });

      it("con movimientos no se elimina: se da de baja con motivo y se conserva el historial", async () => {
        const it = await api.inventario.createItem(nuevoItem());
        await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 1 });
        await expect(api.inventario.deleteItem(it.sku, "limpieza")).rejects.toThrow(/baja/i);
        await expect(api.inventario.darDeBaja(it.sku, "")).rejects.toThrow(/motivo/i);
        await api.inventario.darDeBaja(it.sku, "ya no se usa");
        const items = await api.inventario.listItems();
        expect(items.find((i) => i.sku === it.sku)?.estado).toBe("Baja");
        expect(
          (await api.inventario.listMovimientos()).filter((m) => m.sku === it.sku),
        ).toHaveLength(1);
      });

      it("la baja no se puede saltar editando el estado", async () => {
        const it = await api.inventario.createItem(nuevoItem());
        await expect(api.inventario.updateItem(it.sku, { estado: "Baja" })).rejects.toThrow(
          /motivo/i,
        );
      });

      it("la importación de movimientos es todo o nada y valida el stock acumulado", async () => {
        const it = await api.inventario.createItem(nuevoItem({ cantidad_inicial: 3 }));
        const antes = (await api.inventario.listMovimientos()).length;
        await expect(
          api.inventario.importarMovimientos([
            { sku: it.sku, tipo: "Salida", cantidad: 2 },
            { sku: it.sku, tipo: "Salida", cantidad: 2 },
          ]),
        ).rejects.toThrow(/Importación rechazada.*Fila 2/);
        expect((await api.inventario.listMovimientos()).length).toBe(antes);
        const n = await api.inventario.importarMovimientos([
          { sku: it.sku, tipo: "Entrada", cantidad: 4 },
          { sku: it.sku, tipo: "Salida", cantidad: 5 },
        ]);
        expect(n).toBe(2);
        expect(await stock(it.sku)).toBe(2);
      });

      it("la fecha puede ser pasada pero no futura", async () => {
        const it = await api.inventario.createItem(nuevoItem());
        const m = await api.inventario.registrarMovimiento({
          sku: it.sku,
          tipo: "Salida",
          cantidad: 1,
          fecha: "2026-01-15",
        });
        expect(m.fecha.startsWith("2026-01-15")).toBe(true);
        await expect(
          api.inventario.registrarMovimiento({
            sku: it.sku,
            tipo: "Salida",
            cantidad: 1,
            fecha: dia(3),
          }),
        ).rejects.toThrow(/futura/i);
      });

      it("una entrada con costo recalcula el valor como promedio ponderado de las existencias reales", async () => {
        const it = await api.inventario.createItem(
          nuevoItem({ cantidad_inicial: 10, valorUnitario: 1000 }),
        );
        await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 8 });
        await api.inventario.registrarMovimiento({
          sku: it.sku,
          tipo: "Entrada",
          cantidad: 5,
          costoUnitario: 2000,
        });
        const act = (await api.inventario.listItems()).find((i) => i.sku === it.sku)!;
        expect(act.valorUnitario).toBe(Math.round((2 * 1000 + 5 * 2000) / 7));
      });

      it("el costo de una salida es el vigente al registrarla y no cambia después", async () => {
        const it = await api.inventario.createItem(nuevoItem({ valorUnitario: 1000 }));
        await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 1 });
        await api.inventario.updateItem(it.sku, { valorUnitario: 9999 });
        const m = (await api.inventario.listMovimientos()).find((x) => x.sku === it.sku)!;
        expect(m.costoAlSalir).toBe(1000);
      });

      it("el destino solo aplica a salidas y debe existir; el costo solo a entradas", async () => {
        const it = await api.inventario.createItem(nuevoItem());
        const p = (await api.proyectos.list())[0]!;
        await expect(
          api.inventario.registrarMovimiento({
            sku: it.sku,
            tipo: "Entrada",
            cantidad: 1,
            destinoTipo: "proyecto",
            destinoId: p.id,
          }),
        ).rejects.toThrow(/salida/i);
        await expect(
          api.inventario.registrarMovimiento({
            sku: it.sku,
            tipo: "Salida",
            cantidad: 1,
            destinoTipo: "proyecto",
            destinoId: "no-existe",
          }),
        ).rejects.toThrow(/destino/i);
        await expect(
          api.inventario.registrarMovimiento({
            sku: it.sku,
            tipo: "Salida",
            cantidad: 1,
            costoUnitario: 5,
          }),
        ).rejects.toThrow(/entradas/i);
      });

      it("la importación de valores es todo o nada y una celda vacía no borra lo que ya había", async () => {
        const fila = (sku: string, valor: number | null) => ({
          sku,
          grupo: "componentes" as const,
          categoria: "Instrumentación",
          cantidad_inicial: -1, // se corrige abajo con el valor real de cada ítem
          anioCompra: 2025 as number | null,
          valorUnitario: valor,
        });
        const items = await api.inventario.listItems();
        const ini = (sku: string) => items.find((i) => i.sku === sku)!.cantidad_inicial;
        const f1 = { ...fila("SEN-001", 35_000), cantidad_inicial: ini("SEN-001") };
        const f2 = { ...fila("NO-EXISTE", 1), cantidad_inicial: 1 };
        await expect(api.inventario.importarValores([f1, f2])).rejects.toThrow(/Fila 2/);
        expect(
          (await api.inventario.listItems()).find((i) => i.sku === "SEN-001")?.valorUnitario ??
            null,
        ).toBeNull();
        await api.inventario.importarValores([f1]);
        await api.inventario.importarValores([{ ...f1, valorUnitario: null, anioCompra: 2024 }]);
        const it = (await api.inventario.listItems()).find((i) => i.sku === "SEN-001")!;
        expect([it.valorUnitario, it.anioCompra]).toEqual([35_000, 2024]);
      });

      it("hay tres grupos y la semilla trae 106/36/8 = 150 referencias y 401 unidades", async () => {
        const cfg = await api.configuracion.get();
        expect(Object.keys(cfg.inventario.categorias)).toEqual([
          "componentes",
          "herramientas",
          "equipos",
        ]);
        const items = await api.inventario.listItems();
        const n = (g: string) => items.filter((i) => i.grupo === g).length;
        expect([n("componentes"), n("herramientas"), n("equipos")]).toEqual([106, 36, 8]);
        expect(items.reduce((a, i) => a + i.cantidad_inicial, 0)).toBe(401);
      });
    });

    describe("proyectos y servicios técnicos (contrato §5.3, §5.5)", () => {
      it("las fechas son reales: pasado permitido, fin ≥ inicio, y el cliente debe estar activo", async () => {
        const c = await clienteActivo();
        const p = await api.proyectos.create({
          clienteId: c.id,
          nombre: "Proyecto antiguo",
          estado: "en_desarrollo",
          fechaInicio: "2026-01-10",
        });
        expect(p.fechaInicio).toBe("2026-01-10");
        expect(p.registradoEn).toBeTruthy();
        await expect(api.proyectos.update(p.id, { fechaFin: "2026-01-01" })).rejects.toThrow(
          /fin/i,
        );
        const susp = (await api.clientes.list()).find((x) => x.estado === "suspendido")!;
        await expect(
          api.proyectos.create({ clienteId: susp.id, nombre: "X", estado: "en_desarrollo" }),
        ).rejects.toThrow(/cliente/i);
      });

      it("eliminar un proyecto exige motivo, queda auditado y conserva sus movimientos", async () => {
        const p = (await api.proyectos.list())[0]!;
        const movs = (await api.inventario.listMovimientos()).length;
        await expect(api.proyectos.eliminar(p.id, " ")).rejects.toThrow(/motivo/i);
        await api.proyectos.eliminar(p.id, "proyecto de demostración");
        expect((await api.proyectos.list()).some((x) => x.id === p.id)).toBe(false);
        expect((await api.inventario.listMovimientos()).length).toBe(movs);
        expect(
          (await api.auditoria.list()).some(
            (e) => e.accion === "proyecto.eliminar" && e.entidadId === p.id,
          ),
        ).toBe(true);
      });

      it("el código TT- es consecutivo y no se reutiliza", async () => {
        const a = await api.trabajos.create(await nuevoTrabajo());
        expect(a.codigo).toBe("TT-0004");
        await api.trabajos.eliminar(a.id, "creado por error");
        const b = await api.trabajos.create(await nuevoTrabajo());
        expect(b.codigo).toBe("TT-0005");
      });

      it("cancelar exige motivo y un servicio cancelado no admite más material", async () => {
        const t = await api.trabajos.create(await nuevoTrabajo());
        await expect(api.trabajos.cambiarEstado(t.id, "cancelado")).rejects.toThrow(/motivo/i);
        await api.trabajos.cambiarEstado(t.id, "cancelado", "el cliente desistió");
        await expect(
          api.inventario.registrarMovimiento({
            sku: "SEN-002",
            tipo: "Salida",
            cantidad: 1,
            destinoTipo: "trabajo",
            destinoId: t.id,
          }),
        ).rejects.toThrow(/cancelado/i);
      });
    });

    describe("clientes: cascada y reactivación (contrato §5.4)", () => {
      it("la baja del cliente cancela sus servicios abiertos y no se reactiva a los hijos solos", async () => {
        const abierto = (await api.trabajos.list()).find((t) => t.estado === "en_curso")!;
        const cerrado = (await api.trabajos.list()).find((t) => t.estado === "completado")!;
        expect((await api.clientes.impactoBaja(abierto.clienteId)).trabajos).toBe(1);
        await api.clientes.cambiarEstado(abierto.clienteId, "baja", "prueba");
        const luego = await api.trabajos.list();
        expect(luego.find((t) => t.id === abierto.id)?.estado).toBe("cancelado");
        expect(luego.find((t) => t.id === cerrado.id)?.estado).toBe("completado");
        const u = (await api.usuarios.list()).find((x) => x.clienteId === abierto.clienteId)!;
        await expect(api.usuarios.cambiarEstado(u.id, "activo", "x")).rejects.toThrow(
          /Reactive primero/,
        );
        await api.clientes.cambiarEstado(abierto.clienteId, "activo", "vuelve");
        expect((await api.trabajos.get(abierto.id))?.estado).toBe("cancelado"); // no se reactivó solo
        const h = await api.clientes.hijosReactivables(abierto.clienteId);
        expect(h.trabajos.map((t) => t.id)).toContain(abierto.id);
        expect((await api.trabajos.cambiarEstado(abierto.id, "programado")).estado).toBe(
          "programado",
        );
      });

      it("baja, suspensión y eliminación exigen motivo en la API, no solo en el formulario", async () => {
        const c = await clienteActivo();
        await expect(api.clientes.cambiarEstado(c.id, "baja", "")).rejects.toThrow(/motivo/i);
        await expect(api.clientes.cambiarEstado(c.id, "suspendido", "  ")).rejects.toThrow(
          /motivo/i,
        );
        expect((await api.clientes.get(c.id))?.estado).toBe("activo");
      });

      it("el sector debe estar en la lista configurada y uno en uso no se puede quitar", async () => {
        await expect(api.clientes.create({ razonSocial: "X", sector: "minería" })).rejects.toThrow(
          /sector/i,
        );
        await expect(api.configuracion.actualizarSectores(["cacao"])).rejects.toThrow(/sector/i);
      });
    });

    describe("configuración y datos de demostración (contrato §5.7)", () => {
      it("limpiar demo pide la frase exacta y conserva lo creado por el usuario", async () => {
        await expect(api.configuracion.limpiarDemo("eliminar demo")).rejects.toThrow(
          /ELIMINAR DEMO/,
        );
        const mio = await api.clientes.create({ razonSocial: "Cliente mío", sector: "otro" });
        const r = await api.configuracion.limpiarDemo("ELIMINAR DEMO");
        expect(r.trabajos).toBe(3);
        expect((await api.clientes.list()).map((c) => c.id)).toEqual([mio.id]);
        expect((await api.inventario.listItems()).length).toBe(150); // el inventario real no se toca
      });

      it("la configuración de inventario valida prefijos y no deja quitar una categoría en uso", async () => {
        const cfg = await api.configuracion.get();
        const mala = structuredClone(cfg.inventario);
        mala.categorias.componentes.push("Otra");
        mala.prefijos["Otra"] = "";
        await expect(api.configuracion.actualizarInventario(mala)).rejects.toThrow(/prefijo/i);
        const sin = structuredClone(cfg.inventario);
        sin.categorias.componentes = sin.categorias.componentes.filter(
          (c) => c !== "Instrumentación",
        );
        await expect(api.configuracion.actualizarInventario(sin)).rejects.toThrow(/categoría/i);
      });
    });

    describe("auditoría (contrato §7)", () => {
      it("las operaciones relevantes dejan un evento con actor, acción y motivo", async () => {
        const it = await api.inventario.createItem(nuevoItem());
        await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 1 });
        await api.inventario.darDeBaja(it.sku, "ya no se usa");
        const aud = await api.auditoria.list();
        const baja = aud.find((e) => e.accion === "inventario.baja" && e.entidadId === it.sku);
        expect(baja?.actor).toBeTruthy();
        expect(baja?.detalle).toContain("ya no se usa");
        expect(aud.some((e) => e.accion === "inventario.crear" && e.entidadId === it.sku)).toBe(
          true,
        );
        expect(
          aud.some((e) => e.accion === "inventario.movimiento" && e.entidadId === it.sku),
        ).toBe(true);
      });
    });

    if (opciones.incluirRespaldo) {
      describe("respaldo JSON (solo modo mock, contrato §3.7)", () => {
        it("exporta y reimporta; un archivo inválido se rechaza sin tocar los datos", async () => {
          const respaldo = await api.respaldo.exportar();
          const antes = (await api.clientes.list()).length;
          await api.clientes.create({ razonSocial: "Posterior al respaldo", sector: "otro" });
          await api.respaldo.importar(JSON.stringify(respaldo));
          expect((await api.clientes.list()).length).toBe(antes);
          await expect(api.respaldo.importar("no es json")).rejects.toThrow(/Respaldo inválido/);
          expect((await api.clientes.list()).length).toBe(antes);
        });
      });
    }
  });
}
