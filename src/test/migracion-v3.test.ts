// Panel v3 — vuelven a ser tres grupos: «seguridad» se funde en «componentes» (migración v2 → v3).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { migrarADbActual, migrarV2aV3 } from "@/lib/api/mock/migracion";
import { buildSeed, type MockDb } from "@/lib/api/mock/seed";
import { mockApi, resetMemoria, resetMockDb } from "@/lib/api/mock";
import { GRUPOS, CONFIG_INVENTARIO_DEFECTO } from "@/lib/config-inventario";
import { parseCsvValores } from "@/lib/import-valores";
import { previsualizarValores } from "@/lib/valoracion";

type Laxo = Record<string, unknown>;
const itemsDe = (db: Laxo) => db["items"] as Laxo[];

/**
 * Una base como la dejaba el panel v2: cuatro grupos, CAB-002..007 en «seguridad / Cableado y
 * conectividad», con su configuración de cuatro grupos. Se construye a mano (no con el código
 * nuevo) para que las expectativas sean literales y no circulares.
 */
function comoV2(db: MockDb): Laxo {
  const v2 = structuredClone(db) as unknown as Laxo;
  for (const i of itemsDe(v2)) {
    if (
      ["CAB-002", "CAB-003", "CAB-004", "CAB-005", "CAB-006", "CAB-007"].includes(String(i["sku"]))
    )
      i["grupo"] = "seguridad";
  }
  const cfg = v2["config"] as {
    inventario: {
      categorias: Record<string, string[]>;
      depreciacion: { aniosPorGrupo: Record<string, number | null> };
    };
  };
  cfg.inventario.categorias["componentes"] = [
    "Instrumentación",
    "Potencia y actuadores",
    "Comunicación",
    "Pantallas",
    "SBC y cámaras",
    "Microcontroladores",
  ];
  cfg.inventario.categorias["seguridad"] = [
    "Cámaras",
    "Grabadores (DVR/NVR)",
    "Alarmas y sensores",
    "Cableado y conectividad",
    "Redes y telecom",
    "Energía y respaldo",
    "Accesorios de instalación",
  ];
  cfg.inventario.depreciacion.aniosPorGrupo["seguridad"] = null;
  v2["version"] = 2;
  return v2;
}
const contar = (db: Laxo | MockDb, g: string) =>
  itemsDe(db as unknown as Laxo).filter((i) => i["grupo"] === g).length;
const unidades = (db: Laxo | MockDb) =>
  itemsDe(db as unknown as Laxo).reduce((a, i) => a + Number(i["cantidad_inicial"]), 0);

describe("la semilla y la configuración ya no conocen el grupo «seguridad»", () => {
  it("tres grupos, y en la semilla 106/36/8 = 150 referencias, 401 unidades", () => {
    expect(GRUPOS).toEqual(["componentes", "herramientas", "equipos"]);
    const s = buildSeed();
    expect([contar(s, "componentes"), contar(s, "herramientas"), contar(s, "equipos")]).toEqual([
      106, 36, 8,
    ]);
    expect(s.items).toHaveLength(150);
    expect(unidades(s)).toBe(401);
    expect(s.items.some((i) => (i.grupo as string) === "seguridad")).toBe(false);
    expect(Object.keys(s.config.inventario.categorias)).toEqual([
      "componentes",
      "herramientas",
      "equipos",
    ]);
    expect(Object.keys(s.config.inventario.depreciacion.aniosPorGrupo)).toEqual([
      "componentes",
      "herramientas",
      "equipos",
    ]);
  });
  it("las categorías de seguridad y telecom están dentro de Componentes (editables)", () => {
    const comp = CONFIG_INVENTARIO_DEFECTO.categorias.componentes;
    for (const c of [
      "Instrumentación",
      "Cámaras",
      "Grabadores (DVR/NVR)",
      "Alarmas y sensores",
      "Cableado y conectividad",
      "Redes y telecom",
      "Energía y respaldo",
      "Accesorios de instalación",
    ])
      expect(comp).toContain(c);
    expect(CONFIG_INVENTARIO_DEFECTO.prefijos["Cámaras"]).toBe("CAM"); // la numeración se conserva
  });
  it("CAB-002 a CAB-007 son componentes de «Cableado y conectividad»; los demás CAB siguen en herramientas", () => {
    const s = buildSeed();
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const i = s.items.find((x) => x.sku === `CAB-00${n}`)!;
      expect([i.grupo, i.categoria]).toEqual(["componentes", "Cableado y conectividad"]);
    }
    expect(s.items.find((x) => x.sku === "CAB-001")!.grupo).toBe("herramientas");
  });
});

describe("migración v2 → v3 con la base v2 de la semilla", () => {
  const v3 = migrarV2aV3(comoV2(buildSeed()));
  it("106 componentes, 36 herramientas, 8 equipos; 150 referencias, 401 unidades", () => {
    expect([contar(v3, "componentes"), contar(v3, "herramientas"), contar(v3, "equipos")]).toEqual([
      106, 36, 8,
    ]);
    expect(v3.items).toHaveLength(150);
    expect(unidades(v3)).toBe(401);
    expect(v3.version).toBe(3);
  });
  it("conserva SKU y categoría de cada ítem; solo cambia el grupo de los de seguridad", () => {
    const antes = comoV2(buildSeed());
    const mapa = (db: Laxo) => itemsDe(db).map((i) => `${i["sku"]}|${i["categoria"]}`);
    expect(mapa(v3 as unknown as Laxo)).toEqual(mapa(antes));
  });
  it("funde las categorías de seguridad en Componentes y quita el grupo de la configuración", () => {
    const c = v3.config.inventario;
    expect(Object.keys(c.categorias)).toEqual(["componentes", "herramientas", "equipos"]);
    expect(c.categorias.componentes).toContain("Cámaras");
    expect(c.categorias.componentes.filter((x) => x === "Cableado y conectividad")).toHaveLength(1);
    expect("seguridad" in c.depreciacion.aniosPorGrupo).toBe(false);
  });
  it("añade el evento de migración y conserva la auditoría y los movimientos", () => {
    const base = comoV2(buildSeed());
    const aud = (base["auditoria"] as unknown[]).length;
    expect(v3.auditoria).toHaveLength(aud + 1);
    expect(v3.auditoria[0]?.accion).toBe("sistema.migracion");
    expect(v3.movimientos).toHaveLength((base["movimientos"] as unknown[]).length);
  });
  it("es idempotente", () => {
    const otra = migrarV2aV3(structuredClone(v3) as unknown as Laxo);
    expect(otra.items).toEqual(v3.items);
    expect(otra.auditoria).toHaveLength(v3.auditoria.length);
  });
});

describe("migración v2 → v3 con una base v2 modificada por el usuario", () => {
  const base = comoV2(buildSeed());
  const items = itemsDe(base);
  const movs = base["movimientos"] as Laxo[];
  const nuevo = (sku: string, cat: string, ini: number): Laxo => ({
    sku,
    grupo: "seguridad",
    categoria: cat,
    subcategoria: "x",
    descripcion: sku,
    marca_referencia: "",
    cantidad_inicial: ini,
    unidad: "und",
    estado: "Disponible",
    ubicacion: "",
    stock_minimo: null,
    notas: "",
    valorUnitario: 150000,
    costoInicial: 150000,
    anioCompra: 2025,
  });
  items.push(
    nuevo("CAM-001", "Cámaras", 4),
    nuevo("GRB-001", "Grabadores (DVR/NVR)", 1),
    nuevo("ACC-001", "Control de acceso", 2),
  );
  movs.push(
    {
      id: "u1",
      fecha: "2026-10-01T10:00:00.000Z",
      sku: "CAM-001",
      tipo: "Salida",
      cantidad: 3,
      destinoTipo: "trabajo",
      destinoId: "t1",
      costoAlSalir: 150000,
    },
    {
      id: "u2",
      fecha: "2026-10-02T10:00:00.000Z",
      sku: "CAM-001",
      tipo: "Entrada",
      cantidad: 2,
      costoUnitario: 160000,
    },
  );
  // una categoría que el usuario agregó a seguridad desde Configuración
  const cfg = base["config"] as {
    inventario: { categorias: Record<string, string[]>; prefijos: Record<string, string> };
  };
  cfg.inventario.categorias["seguridad"]!.push("Control de acceso");
  cfg.inventario.prefijos["Control de acceso"] = "ACC";
  (base["secuencias"] as Record<string, number>)["CAM"] = 1;
  const v3 = migrarV2aV3(base);
  it("los ítems creados en seguridad pasan a componentes con su SKU, categoría, valor y movimientos", () => {
    for (const sku of ["CAM-001", "GRB-001", "ACC-001"]) {
      const i = v3.items.find((x) => x.sku === sku)!;
      expect(i.grupo).toBe("componentes");
      expect(i.valorUnitario).toBe(150000);
    }
    expect(v3.items.find((x) => x.sku === "ACC-001")!.categoria).toBe("Control de acceso");
    expect(v3.movimientos.filter((m) => m.sku === "CAM-001")).toHaveLength(2);
  });
  it("la categoría personalizada sobrevive dentro de Componentes y los totales cuadran", () => {
    expect(v3.config.inventario.categorias.componentes).toContain("Control de acceso");
    expect([contar(v3, "componentes"), contar(v3, "herramientas"), contar(v3, "equipos")]).toEqual([
      109, 36, 8,
    ]);
    expect(unidades(v3)).toBe(401 + 4 + 1 + 2);
  });
  it("el contador de SKU no retrocede", () => {
    expect(v3.secuencias["CAM"]).toBe(1);
  });
});

describe("cadena completa y carga desde localStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMemoria();
  });
  it("una base v1 llega a v3 con 106/36/8 pasando por v2", () => {
    const v1 = structuredClone(buildSeed()) as unknown as Laxo;
    for (const i of itemsDe(v1)) {
      for (const k of [
        "grupo",
        "anioCompra",
        "valorUnitario",
        "costoInicial",
        "vidaUtilAnios",
        "proveedor",
      ])
        delete i[k];
      const sku = String(i["sku"]);
      if (sku.startsWith("CAB-")) i["categoria"] = "Cableado";
      if (sku === "EQP-008" || sku === "EQP-009") i["categoria"] = "Equipos";
    }
    for (const k of ["secuencias", "config", "version"]) delete v1[k];
    const v3 = migrarADbActual(v1);
    expect([contar(v3, "componentes"), contar(v3, "herramientas"), contar(v3, "equipos")]).toEqual([
      106, 36, 8,
    ]);
    expect(v3.version).toBe(3);
  });
  it("una base v2 guardada se migra al leer, se guarda como v3 y la v2 queda de respaldo", async () => {
    window.localStorage.setItem("ioting.mock.db.v2", JSON.stringify(comoV2(buildSeed())));
    const items = await mockApi.inventario.listItems();
    expect(items).toHaveLength(150);
    expect(items.filter((i) => i.grupo === "componentes")).toHaveLength(106);
    const v3 = JSON.parse(window.localStorage.getItem("ioting.mock.db.v3") ?? "null");
    expect(v3?.version).toBe(3);
    expect(JSON.parse(window.localStorage.getItem("ioting.mock.db.v2")!).version).toBe(2); // intacta
  });
  it("si existen la v1 y la v2, se migra la v2 (la más reciente), no la v1", async () => {
    const v2 = comoV2(buildSeed());
    itemsDe(v2).push({
      sku: "ZZZ-001",
      grupo: "seguridad",
      categoria: "Cámaras",
      subcategoria: "x",
      descripcion: "solo en v2",
      marca_referencia: "",
      cantidad_inicial: 1,
      unidad: "und",
      estado: "Disponible",
      ubicacion: "",
      stock_minimo: null,
      notas: "",
    });
    window.localStorage.setItem("ioting.mock.db.v1", JSON.stringify(buildSeed()));
    window.localStorage.setItem("ioting.mock.db.v2", JSON.stringify(v2));
    const items = await mockApi.inventario.listItems();
    expect(items.find((i) => i.sku === "ZZZ-001")?.grupo).toBe("componentes");
  });
  it("un respaldo JSON hecho con el panel v2 se importa y se migra", async () => {
    resetMockDb();
    const respaldoV2 = {
      formato: "ioting-panel-respaldo",
      version: 2,
      exportadoEn: "2026-11-12T10:00:00.000Z",
      datos: comoV2(buildSeed()),
    };
    const res = await mockApi.respaldo.importar(JSON.stringify(respaldoV2));
    expect(res.entidades.find((e) => e.nombre === "items")?.enRespaldo).toBe(150);
    const items = await mockApi.inventario.listItems();
    expect(items.some((i) => (i.grupo as string) === "seguridad")).toBe(false);
    expect(items.filter((i) => i.grupo === "componentes")).toHaveLength(106);
  });
  it("el respaldo que exporta el panel v3 trae versión 3", async () => {
    resetMockDb();
    expect((await mockApi.respaldo.exportar()).version).toBe(3);
  });
});

describe("plantilla de valores sin «seguridad»", () => {
  const plantilla = readFileSync("public/plantillas/plantilla_valores_inventario.csv", "utf8");
  it("la plantilla vigente solo usa los tres grupos y 150 filas", () => {
    expect(plantilla).not.toMatch(/,seguridad,/); // la palabra puede aparecer en una descripción
    const filas = parseCsvValores(plantilla);
    expect(filas).toHaveLength(150);
    expect(new Set(filas.map((f) => f.grupo))).toEqual(
      new Set(["componentes", "herramientas", "equipos"]),
    );
  });
  it("un CSV viejo con «seguridad» se acepta, se toma como componentes y la vista previa avisa", async () => {
    resetMockDb();
    const viejo = [
      "sku,descripcion,marca_referencia,grupo_propuesto,categoria_propuesta,cantidad_inicial,anio_compra,valor_unitario",
      "CAB-003,Alambre,,seguridad,Cableado y conectividad,1,2025,8000",
    ].join("\n");
    const filas = parseCsvValores(viejo);
    expect(filas[0]!.grupo).toBe("componentes");
    const [items, movs, cfg] = await Promise.all([
      mockApi.inventario.listItems(),
      mockApi.inventario.listMovimientos(),
      mockApi.configuracion.get(),
    ]);
    const prev = previsualizarValores(items, movs, filas, cfg.inventario);
    expect(prev[0]!.error).toBe("");
    expect(prev[0]!.aviso).toMatch(/seguridad.*componentes/i);
    await expect(mockApi.inventario.importarValores(filas)).resolves.toEqual({ aplicadas: 1 });
  });
  it("un grupo desconocido sigue rechazándose", async () => {
    resetMockDb();
    const filas = parseCsvValores(
      [
        "sku,grupo_propuesto,categoria_propuesta,cantidad_inicial,anio_compra,valor_unitario",
        "SEN-001,otro,Instrumentación,4,2025,1000",
      ].join("\n"),
    );
    await expect(mockApi.inventario.importarValores(filas)).rejects.toThrow(/grupo/i);
  });
});
