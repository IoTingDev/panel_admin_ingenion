// Fase 1 — integridad de datos. Cada prueba reproduce un defecto del código v1.
import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, resetMockDb } from "@/lib/api/mock";
import type { ItemInventario, NuevoMovimiento } from "@/lib/api/types";

const api = mockApi;
const nuevoItem = (
  over: Partial<Omit<ItemInventario, "sku">> = {},
): Omit<ItemInventario, "sku"> => ({
  grupo: "componentes",
  categoria: "Instrumentación",
  subcategoria: "Nivel",
  descripcion: "Ítem de prueba",
  marca_referencia: "X",
  cantidad_inicial: 2,
  unidad: "und",
  estado: "Disponible",
  ubicacion: "",
  stock_minimo: null,
  notas: "",
  ...over,
});
const stockDe = async (sku: string) => {
  const [items, movs] = await Promise.all([
    api.inventario.listItems(),
    api.inventario.listMovimientos(),
  ]);
  const it = items.find((i) => i.sku === sku);
  if (!it) throw new Error(`no hay ítem ${sku}`);
  return movs.reduce(
    (a, m) => (m.sku !== sku ? a : m.tipo === "Entrada" ? a + m.cantidad : a - m.cantidad),
    it.cantidad_inicial,
  );
};

beforeEach(() => {
  window.localStorage.clear();
  resetMockDb();
});

describe("1.1 SKU no se reutiliza", () => {
  it("tras eliminar el último ítem, el siguiente SKU es distinto", async () => {
    const a = await api.inventario.createItem(nuevoItem());
    await api.inventario.deleteItem(a.sku, "creado por error");
    const b = await api.inventario.createItem(nuevoItem());
    expect(b.sku).not.toBe(a.sku);
  });

  it("no reasigna el SKU de movimientos huérfanos de una base ya guardada", async () => {
    // Una base v1 con un ítem borrado que dejó movimientos: el SKU SEN-099 sigue "ocupado".
    const raw = JSON.parse(window.localStorage.getItem("ioting.mock.db.v3") ?? "{}");
    delete raw.secuencias; // una base v1 real no tiene contador
    raw.movimientos.push({
      id: "huerfano",
      fecha: "2026-01-01T00:00:00.000Z",
      sku: "SEN-099",
      tipo: "Entrada",
      cantidad: 5,
    });
    // Se guarda como base v1 (sin contador ni versión) y se quita la v2: la app debe migrarla.
    delete raw.version;
    window.localStorage.removeItem("ioting.mock.db.v3");
    window.localStorage.setItem("ioting.mock.db.v1", JSON.stringify(raw));
    const { resetMemoria } = await import("@/lib/api/mock");
    resetMemoria();
    const n = await api.inventario.createItem(nuevoItem());
    expect(Number.parseInt(n.sku.slice(4), 10)).toBeGreaterThan(99);
    expect(await stockDe(n.sku)).toBe(2); // sin heredar las 5 unidades huérfanas
  });
});

describe("1.2 baja vs eliminación", () => {
  it("un ítem con movimientos no se elimina: se da de baja y conserva el historial", async () => {
    const it = await api.inventario.createItem(nuevoItem());
    await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 1 });
    await expect(api.inventario.deleteItem(it.sku, "limpieza")).rejects.toThrow(/baja/i);
    await api.inventario.darDeBaja(it.sku, "ya no se usa");
    const items = await api.inventario.listItems();
    expect(items.find((i) => i.sku === it.sku)?.estado).toBe("Baja");
    const movs = await api.inventario.listMovimientos();
    expect(movs.filter((m) => m.sku === it.sku)).toHaveLength(1);
    const aud = await api.auditoria.list();
    expect(aud.some((e) => e.accion === "inventario.baja" && e.entidadId === it.sku)).toBe(true);
  });

  it("un ítem sin movimientos sí se elimina, con motivo y auditoría", async () => {
    const it = await api.inventario.createItem(nuevoItem());
    await expect(api.inventario.deleteItem(it.sku, "  ")).rejects.toThrow(/motivo/i);
    await api.inventario.deleteItem(it.sku, "creado por error");
    expect((await api.inventario.listItems()).some((i) => i.sku === it.sku)).toBe(false);
    const aud = await api.auditoria.list();
    expect(aud.some((e) => e.accion === "inventario.eliminar" && e.entidadId === it.sku)).toBe(
      true,
    );
  });

  it("dar de baja exige motivo", async () => {
    const it = await api.inventario.createItem(nuevoItem());
    await expect(api.inventario.darDeBaja(it.sku, "")).rejects.toThrow(/motivo/i);
  });
});

describe("1.3 importación atómica", () => {
  it("si una fila falla, no se aplica ninguna", async () => {
    const it = await api.inventario.createItem(nuevoItem({ cantidad_inicial: 3 }));
    const antes = (await api.inventario.listMovimientos()).length;
    const filas: NuevoMovimiento[] = [
      { sku: it.sku, tipo: "Salida", cantidad: 1 },
      { sku: it.sku, tipo: "Salida", cantidad: 1 },
      { sku: "NO-EXISTE", tipo: "Salida", cantidad: 1 },
    ];
    await expect(api.inventario.importarMovimientos(filas)).rejects.toThrow(/fila 3/i);
    expect((await api.inventario.listMovimientos()).length).toBe(antes);
    expect(await stockDe(it.sku)).toBe(3);
  });

  it("valida el stock acumulado fila a fila (cada salida cabe sola, juntas no)", async () => {
    const it = await api.inventario.createItem(nuevoItem({ cantidad_inicial: 3 }));
    const filas: NuevoMovimiento[] = [
      { sku: it.sku, tipo: "Salida", cantidad: 2 },
      { sku: it.sku, tipo: "Salida", cantidad: 2 },
    ];
    await expect(api.inventario.importarMovimientos(filas)).rejects.toThrow(/fila 2/i);
    expect(await stockDe(it.sku)).toBe(3);
  });

  it("un lote válido se aplica completo, y una entrada habilita la salida siguiente", async () => {
    const it = await api.inventario.createItem(nuevoItem({ cantidad_inicial: 1 }));
    const n = await api.inventario.importarMovimientos([
      { sku: it.sku, tipo: "Entrada", cantidad: 4 },
      { sku: it.sku, tipo: "Salida", cantidad: 5 },
    ]);
    expect(n).toBe(2);
    expect(await stockDe(it.sku)).toBe(0);
  });
});

describe("1.4 cascada y reactivación", () => {
  const primerCliente = async () => {
    const [clientes, usuarios, proyectos] = await Promise.all([
      api.clientes.list(),
      api.usuarios.list(),
      api.proyectos.list(),
    ]);
    const c = clientes.find(
      (x) =>
        x.estado === "activo" &&
        usuarios.some((u) => u.clienteId === x.id && u.estado === "activo") &&
        proyectos.some(
          (p) => p.clienteId === x.id && p.estado !== "baja" && p.estado !== "finalizado",
        ),
    );
    if (!c) throw new Error("la semilla no trae un cliente con usuarios y proyectos activos");
    return c;
  };

  it("no se puede reactivar un usuario de un cliente en baja, y el mensaje dice qué hacer", async () => {
    const c = await primerCliente();
    await api.clientes.cambiarEstado(c.id, "baja", "prueba");
    const u = (await api.usuarios.list()).find((x) => x.clienteId === c.id);
    expect(u?.estado).toBe("baja");
    await expect(api.usuarios.cambiarEstado(u!.id, "activo", "x")).rejects.toThrow(
      /reactiv.*cliente/i,
    );
    expect((await api.usuarios.list()).find((x) => x.id === u!.id)?.estado).toBe("baja");
  });

  it("no se puede reactivar un proyecto de un cliente en baja", async () => {
    const c = await primerCliente();
    await api.clientes.cambiarEstado(c.id, "baja", "prueba");
    const p = (await api.proyectos.list()).find((x) => x.clienteId === c.id && x.estado === "baja");
    expect(p).toBeDefined();
    await expect(api.proyectos.cambiarEstado(p!.id, "activo", "x")).rejects.toThrow(
      /reactiv.*cliente/i,
    );
  });

  it("reactivar el cliente NO reactiva a los hijos; los ofrece para reactivar selectivamente", async () => {
    const c = await primerCliente();
    await api.clientes.cambiarEstado(c.id, "baja", "prueba");
    await api.clientes.cambiarEstado(c.id, "activo", "volvió");
    const usuarios = (await api.usuarios.list()).filter((x) => x.clienteId === c.id);
    expect(usuarios.every((u) => u.estado === "baja")).toBe(true);
    const hijos = await api.clientes.hijosReactivables(c.id);
    expect(hijos.usuarios.length).toBe(usuarios.length);
    expect(hijos.proyectos.length).toBeGreaterThan(0);
    // ahora sí se puede reactivar uno
    await api.usuarios.cambiarEstado(usuarios[0]!.id, "activo", "vuelve");
    expect((await api.usuarios.list()).find((x) => x.id === usuarios[0]!.id)?.estado).toBe(
      "activo",
    );
  });
});

describe("1.2 la baja no se puede saltar por la edición", () => {
  it("updateItem no acepta estado Baja: debe pasar por darDeBaja, que exige motivo", async () => {
    const it = await api.inventario.createItem(nuevoItem());
    await expect(api.inventario.updateItem(it.sku, { estado: "Baja" })).rejects.toThrow(/motivo/i);
    expect((await api.inventario.listItems()).find((i) => i.sku === it.sku)?.estado).toBe(
      "Disponible",
    );
  });
});
