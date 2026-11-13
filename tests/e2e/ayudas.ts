// Utilidades compartidas por las pruebas E2E de las fases 3 y 4 y la prueba integral.
import { expect, type Locator, type Page } from "@playwright/test";

export const FECHA_FIJA = "2026-11-12T10:00:00-05:00";

export async function entrar(page: Page) {
  await page.clock.install({ time: new Date(FECHA_FIJA) });
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export type DbE2E = {
  clientes: { id: string; razonSocial: string; estado: string; esDemo?: boolean; sector: string }[];
  usuarios: { id: string; esDemo?: boolean }[];
  proyectos: {
    id: string;
    nombre: string;
    estado: string;
    esDemo?: boolean;
    clienteId: string;
    fechaInicio?: string;
  }[];
  trabajos: {
    id: string;
    codigo: string;
    titulo: string;
    estado: string;
    esDemo?: boolean;
    clienteId: string;
  }[];
  items: {
    sku: string;
    grupo: string;
    estado: string;
    cantidad_inicial: number;
    valorUnitario?: number | null;
  }[];
  movimientos: {
    id: string;
    sku: string;
    tipo: string;
    cantidad: number;
    fecha: string;
    esDemo?: boolean;
    destinoTipo?: string;
    destinoId?: string;
    costoAlSalir?: number | null;
    proyecto?: string;
  }[];
  auditoria: { accion: string; entidadId: string }[];
  config: { sectores: string[] };
};

/** Lee la base guardada (esperando a que exista: se crea con la primera consulta). */
export async function leerDb(page: Page): Promise<DbE2E> {
  await page.waitForFunction(() => !!localStorage.getItem("ioting.mock.db.v3"));
  return page.evaluate(() => JSON.parse(localStorage.getItem("ioting.mock.db.v3")!));
}

/** Arrastra y suelta con eventos de ratón por pasos (el drag HTML5 necesita movimiento intermedio). */
export async function arrastrar(page: Page, origen: Locator, destino: Locator) {
  // El tablero puede estar redibujándose tras un cambio anterior: se mide con reintentos y, si no se
  // logra, falla con un mensaje claro en vez de un TypeError.
  const medir = async (l: Locator, que: string) => {
    for (let i = 0; i < 30; i++) {
      const caja = await l.boundingBox().catch(() => null);
      if (caja) return caja;
      await page.waitForTimeout(100);
    }
    throw new Error(`no se pudo medir ${que} del arrastre`);
  };
  const o = await medir(origen, "el origen");
  const d = await medir(destino, "el destino");
  await page.mouse.move(o.x + 20, o.y + 20);
  await page.mouse.down();
  await page.mouse.move(o.x + 40, o.y + 40, { steps: 5 });
  await page.mouse.move(d.x + 60, d.y + 60, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/** «$ 1.250.000» → 1250000 */
export const numDe = (t: string) => Number(t.replace(/[^\d]/g, ""));

export async function sinDesborde(page: Page, rutas: string[]) {
  const fallos: string[] = [];
  let medidas = 0;
  for (const ruta of rutas) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({
      ancho: document.documentElement.scrollWidth,
      ventana: window.innerWidth,
    }));
    medidas++;
    if (m.ancho > m.ventana) fallos.push(`${ruta}: scrollWidth ${m.ancho} > ${m.ventana}`);
  }
  expect(medidas).toBe(rutas.length);
  expect(fallos).toEqual([]);
}

export const leerDbV3 = leerDb;
