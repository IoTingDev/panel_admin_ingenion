// Fase 2 — inventario: grupos, valoración, movimientos con fecha/destino/costo, importación de valores.
import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, resetMockDb } from "@/lib/api/mock";
import type { FilaValores, ItemInventario } from "@/lib/api/types";
import { previsualizarValores } from "@/lib/valoracion";
import inventarioJson from "@/data/inventario_ioting.json";

const inicialDe: Record<string, number> = Object.fromEntries(
  Object.values(inventarioJson)
    .flat()
    .map((i) => [i.sku, i.cantidad_inicial]),
);

const api = mockApi;
const nuevo = (over: Partial<Omit<ItemInventario, "sku">> = {}): Omit<ItemInventario, "sku"> => ({
  grupo: "seguridad",
  categoria: "Cámaras",
  subcategoria: "Domo",
  descripcion: "Cámara domo 2 MP",
  marca_referencia: "Hikvision",
  cantidad_inicial: 4,
  unidad: "und",
  estado: "Disponible",
  ubicacion: "",
  stock_minimo: null,
  notas: "",
  anioCompra: 2025,
  valorUnitario: 150_000,
  vidaUtilAnios: null,
  proveedor: "Distribuidora X",
  ...over,
});
const stockDe = async (sku: string) => {
  const [items, movs] = await Promise.all([
    api.inventario.listItems(),
    api.inventario.listMovimientos(),
  ]);
  const it = items.find((i) => i.sku === sku)!;
  return movs.reduce(
    (a, m) => (m.sku !== sku ? a : m.tipo === "Entrada" ? a + m.cantidad : a - m.cantidad),
    it.cantidad_inicial,
  );
};
const hoy = () => new Date().toISOString();
const enDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

beforeEach(() => {
  window.localStorage.clear();
  resetMockDb();
});

describe("2.1 grupos explícitos y configuración editable", () => {
  it("la semilla trae el grupo en cada ítem y el SKU ya no lo determina", async () => {
    const items = await api.inventario.listItems();
    const g = (s: string) => items.find((i) => i.sku === s)!.grupo;
    expect([g("CAB-001"), g("CAB-003"), g("EQP-009"), g("EQP-001"), g("SEN-001")]).toEqual([
      "herramientas",
      "seguridad",
      "herramientas",
      "equipos",
      "componentes",
    ]);
  });
  it("un ítem nuevo de seguridad numera con el prefijo de su categoría", async () => {
    const cam = await api.inventario.createItem(nuevo());
    expect(cam.sku).toBe("CAM-001");
    expect(cam.grupo).toBe("seguridad");
    const grb = await api.inventario.createItem(nuevo({ categoria: "Grabadores (DVR/NVR)" }));
    expect(grb.sku).toBe("GRB-001");
    const cam2 = await api.inventario.createItem(nuevo());
    expect(cam2.sku).toBe("CAM-002");
  });
  it("rechaza una categoría que no pertenece al grupo", async () => {
    await expect(
      api.inventario.createItem(nuevo({ categoria: "Instrumentación" })),
    ).rejects.toThrow(/categor/i);
  });
  it("la lista de categorías y prefijos es editable desde configuración y queda auditada", async () => {
    const cfg = await api.configuracion.get();
    const inv = structuredClone(cfg.inventario);
    inv.categorias.seguridad.push("Control de acceso");
    inv.prefijos["Control de acceso"] = "ACC";
    await api.configuracion.actualizarInventario(inv);
    const it = await api.inventario.createItem(nuevo({ categoria: "Control de acceso" }));
    expect(it.sku).toBe("ACC-001");
    const aud = await api.auditoria.list();
    expect(aud.some((e) => e.accion === "configuracion.inventario")).toBe(true);
  });
  it("no deja repetir un prefijo ya usado por otra categoría con ítems distintos grupos ni vaciar un prefijo", async () => {
    const cfg = await api.configuracion.get();
    const inv = structuredClone(cfg.inventario);
    inv.categorias.seguridad.push("Otra");
    inv.prefijos["Otra"] = "";
    await expect(api.configuracion.actualizarInventario(inv)).rejects.toThrow(/prefijo/i);
  });
});

describe("2.3 valoración: costo promedio ponderado", () => {
  it("una entrada con costo recalcula el valor como promedio ponderado de las existencias", async () => {
    const it = await api.inventario.createItem(
      nuevo({ cantidad_inicial: 2, valorUnitario: 100_000 }),
    );
    await api.inventario.registrarMovimiento({
      sku: it.sku,
      tipo: "Entrada",
      cantidad: 3,
      costoUnitario: 200_000,
    });
    const act = (await api.inventario.listItems()).find((i) => i.sku === it.sku)!;
    expect(act.valorUnitario).toBe((2 * 100_000 + 3 * 200_000) / 5); // 160.000
  });
  it("pondera con las existencias reales, no con la cantidad inicial", async () => {
    const it = await api.inventario.createItem(
      nuevo({ cantidad_inicial: 10, valorUnitario: 1000 }),
    );
    await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 8 }); // quedan 2
    await api.inventario.registrarMovimiento({
      sku: it.sku,
      tipo: "Entrada",
      cantidad: 5,
      costoUnitario: 2000,
    });
    const act = (await api.inventario.listItems()).find((i) => i.sku === it.sku)!;
    expect(act.valorUnitario).toBe(Math.round((2 * 1000 + 5 * 2000) / 7)); // 1714
  });
  it("si el ítem no tenía valor, el costo de la primera compra pasa a ser su valor", async () => {
    const it = await api.inventario.createItem(nuevo({ valorUnitario: null }));
    await api.inventario.registrarMovimiento({
      sku: it.sku,
      tipo: "Entrada",
      cantidad: 1,
      costoUnitario: 90_000,
    });
    expect((await api.inventario.listItems()).find((i) => i.sku === it.sku)!.valorUnitario).toBe(
      90_000,
    );
  });
  it("una entrada sin costo no mueve el valor; una salida tampoco", async () => {
    const it = await api.inventario.createItem(nuevo({ valorUnitario: 100_000 }));
    await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Entrada", cantidad: 3 });
    await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 1 });
    expect((await api.inventario.listItems()).find((i) => i.sku === it.sku)!.valorUnitario).toBe(
      100_000,
    );
  });
  it("el costo debe ser un entero en COP ≥ 0", async () => {
    const it = await api.inventario.createItem(nuevo());
    for (const costo of [-1, 10.5, Number.NaN]) {
      await expect(
        api.inventario.registrarMovimiento({
          sku: it.sku,
          tipo: "Entrada",
          cantidad: 1,
          costoUnitario: costo,
        }),
      ).rejects.toThrow(/costo/i);
    }
  });
});

describe("2.4 movimientos: fecha editable y destino", () => {
  it("acepta fechas pasadas y rechaza las futuras", async () => {
    const it = await api.inventario.createItem(nuevo());
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
        fecha: enDias(2),
      }),
    ).rejects.toThrow(/futur/i);
  });
  it("la fecha por defecto es hoy", async () => {
    const it = await api.inventario.createItem(nuevo());
    const m = await api.inventario.registrarMovimiento({
      sku: it.sku,
      tipo: "Salida",
      cantidad: 1,
    });
    expect(Math.abs(Date.parse(m.fecha) - Date.parse(hoy()))).toBeLessThan(60_000);
  });
  it("una salida con destino proyecto guarda tipo e id, y el destino debe existir", async () => {
    const it = await api.inventario.createItem(nuevo());
    const p = (await api.proyectos.list())[0]!;
    const m = await api.inventario.registrarMovimiento({
      sku: it.sku,
      tipo: "Salida",
      cantidad: 1,
      destinoTipo: "proyecto",
      destinoId: p.id,
    });
    expect([m.destinoTipo, m.destinoId]).toEqual(["proyecto", p.id]);
    await expect(
      api.inventario.registrarMovimiento({
        sku: it.sku,
        tipo: "Salida",
        cantidad: 1,
        destinoTipo: "proyecto",
        destinoId: "no-existe",
      }),
    ).rejects.toThrow(/destino/i);
  });
  it("el destino solo aplica a salidas", async () => {
    const it = await api.inventario.createItem(nuevo());
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
  });
  it("el stock nunca queda negativo aunque la fecha sea pasada", async () => {
    const it = await api.inventario.createItem(nuevo({ cantidad_inicial: 1 }));
    await expect(
      api.inventario.registrarMovimiento({
        sku: it.sku,
        tipo: "Salida",
        cantidad: 2,
        fecha: "2026-01-01",
      }),
    ).rejects.toThrow(/insuficiente/i);
    expect(await stockDe(it.sku)).toBe(1);
  });
});

describe("2.4 edición con trazabilidad antes → después", () => {
  it("cambiar el valor o la cantidad inicial queda auditado con ambos valores", async () => {
    const it = await api.inventario.createItem(
      nuevo({ cantidad_inicial: 4, valorUnitario: 150_000 }),
    );
    await api.inventario.updateItem(it.sku, { valorUnitario: 170_000, cantidad_inicial: 5 });
    const ev = (await api.auditoria.list()).find(
      (e) => e.accion === "inventario.editar" && e.entidadId === it.sku,
    )!;
    expect(ev.detalle).toContain("valorUnitario: 150000 → 170000");
    expect(ev.detalle).toContain("cantidad_inicial: 4 → 5");
  });
  it("no se puede bajar la cantidad inicial por debajo de lo ya consumido", async () => {
    const it = await api.inventario.createItem(nuevo({ cantidad_inicial: 4 }));
    await api.inventario.registrarMovimiento({ sku: it.sku, tipo: "Salida", cantidad: 3 });
    await expect(api.inventario.updateItem(it.sku, { cantidad_inicial: 2 })).rejects.toThrow(
      /negativ|insuficiente/i,
    );
    expect(await stockDe(it.sku)).toBe(1);
  });
  it("valida año de compra (1990..año actual) y valor entero ≥ 0", async () => {
    const it = await api.inventario.createItem(nuevo());
    await expect(api.inventario.updateItem(it.sku, { anioCompra: 1989 })).rejects.toThrow(/año/i);
    await expect(
      api.inventario.updateItem(it.sku, { anioCompra: new Date().getFullYear() + 1 }),
    ).rejects.toThrow(/año/i);
    await expect(api.inventario.updateItem(it.sku, { valorUnitario: -5 })).rejects.toThrow(
      /valor/i,
    );
    await expect(api.inventario.updateItem(it.sku, { valorUnitario: 10.5 })).rejects.toThrow(
      /valor/i,
    );
  });
});

describe("2.3 importación de valores desde CSV (todo o nada)", () => {
  const fila = (over: Partial<FilaValores>): FilaValores => ({
    sku: "SEN-001",
    grupo: "componentes",
    categoria: "Instrumentación",
    cantidad_inicial: inicialDe[over.sku ?? "SEN-001"] ?? 0,
    anioCompra: 2025,
    valorUnitario: 35_000,
    ...over,
  });
  it("aplica el lote completo, previsualiza diferencias y deja un evento de auditoría", async () => {
    const [items, movs, cfg] = await Promise.all([
      api.inventario.listItems(),
      api.inventario.listMovimientos(),
      api.configuracion.get(),
    ]);
    const antes = items.find((i) => i.sku === "SEN-001")!;
    const prev = previsualizarValores(
      items,
      movs,
      [fila({}), fila({ sku: "SEN-002", valorUnitario: 52_000 })],
      cfg.inventario,
    );
    expect(prev.every((p) => p.error === "")).toBe(true);
    expect(prev[0]!.cambios.map((c) => c.campo)).toContain("valorUnitario");
    const r = await api.inventario.importarValores([
      fila({}),
      fila({ sku: "SEN-002", valorUnitario: 52_000 }),
    ]);
    expect(r.aplicadas).toBe(2);
    const despues = (await api.inventario.listItems()).find((i) => i.sku === "SEN-001")!;
    expect(despues.valorUnitario).toBe(35_000);
    expect(antes.valorUnitario ?? null).toBeNull();
    const aud = await api.auditoria.list();
    expect(aud.filter((e) => e.accion === "inventario.importar_valores")).toHaveLength(1);
  });
  it("si una fila falla no se aplica ninguna, con el error por fila", async () => {
    await expect(
      api.inventario.importarValores([
        fila({}),
        fila({ sku: "NO-EXISTE" }),
        fila({ sku: "SEN-002", valorUnitario: -1 }),
      ]),
    ).rejects.toThrow(/fila 2.*fila 3|fila 2/i);
    const it = (await api.inventario.listItems()).find((i) => i.sku === "SEN-001")!;
    expect(it.valorUnitario ?? null).toBeNull();
  });
  it("una fila con grupo/categoría distintos reclasifica; una inválida se rechaza", async () => {
    await api.inventario.importarValores([
      fila({
        sku: "CAB-005",
        grupo: "herramientas",
        categoria: "Accesorios de taller",
        valorUnitario: 8000,
      }),
    ]);
    const it = (await api.inventario.listItems()).find((i) => i.sku === "CAB-005")!;
    expect([it.grupo, it.categoria, it.sku]).toEqual([
      "herramientas",
      "Accesorios de taller",
      "CAB-005",
    ]);
    await expect(api.inventario.importarValores([fila({ categoria: "Cámaras" })])).rejects.toThrow(
      /categor/i,
    );
  });
  it("un valor vacío no borra el que ya tenía el ítem", async () => {
    await api.inventario.importarValores([fila({ valorUnitario: 35_000 })]);
    await api.inventario.importarValores([fila({ valorUnitario: null, anioCompra: 2024 })]);
    const it = (await api.inventario.listItems()).find((i) => i.sku === "SEN-001")!;
    expect([it.valorUnitario, it.anioCompra]).toEqual([35_000, 2024]);
  });
  it("cambiar la cantidad inicial que dejaría stock negativo rechaza todo el lote", async () => {
    const hay = await stockDe("SEN-002");
    await api.inventario.registrarMovimiento({ sku: "SEN-002", tipo: "Salida", cantidad: hay });
    await expect(
      api.inventario.importarValores([
        fila({ sku: "SEN-002", cantidad_inicial: inicialDe["SEN-002"]! - 1 }),
      ]),
    ).rejects.toThrow(/negativ/i);
  });
});
