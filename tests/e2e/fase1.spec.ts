// Fase 1 — correcciones de UI. Cada prueba mide el hecho (valores reales), no el nombre que lo apunta.
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { RUTAS } from "../visual/rutas";

async function entrar(page: Page) {
  await page.clock.install({ time: new Date("2026-11-12T10:00:00-05:00") });
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("móvil 390 px: ninguna ruta desborda en horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page);
  const fallos: string[] = [];
  let medidas = 0;
  for (const { ruta } of RUTAS) {
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
  expect(medidas).toBe(RUTAS.length);
  expect(fallos).toEqual([]);
});

test("404 y errores en español, con botón para volver al inicio", async ({ page }) => {
  await page.goto("/esta-ruta-no-existe");
  await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Page not found|Go home|Try again/);
  await page.getByRole("link", { name: "Volver al inicio" }).click();
  await expect(page).toHaveURL(/\/(login)?$/);
});

test("el logo no depende de Lovable: ninguna petición a /__l5e/ y sin recursos 404", async ({
  page,
}) => {
  const malas: string[] = [];
  const l5e: string[] = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/__l5e/")) l5e.push(u.pathname);
    if (u.origin === "http://localhost:8080" && r.status() >= 400)
      malas.push(`${r.status()} ${u.pathname}`);
  });
  // El archivo del logo es una precondición: si falta, la prueba falla en vez de degradarse.
  expect(existsSync("public/brand/ioting-logo.png")).toBe(true);
  await entrar(page);
  await page.waitForLoadState("networkidle");
  expect(l5e).toEqual([]);
  expect(malas).toEqual([]);
  // La imagen cargó de verdad (no el respaldo de texto): ancho natural > 0.
  const ancho = await page
    .locator("aside img[alt='IoTing Dev']")
    .first()
    .evaluate((i) => (i as HTMLImageElement).naturalWidth);
  expect(ancho).toBeGreaterThan(0);
});

test("notificaciones: se derivan de los datos reales, no son texto fijo", async ({ page }) => {
  await entrar(page);
  await page.goto("/");
  await page.waitForFunction(() => !!localStorage.getItem("ioting.mock.db.v1"));
  // Valores reales desde la base, no desde lo que diga la interfaz.
  const real = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("ioting.mock.db.v1") ?? "{}");
    return {
      pausados: db.proyectos.filter((p: { estado: string }) => p.estado === "pausado").length,
      suspendidos: db.clientes.filter((c: { estado: string }) => c.estado === "suspendido").length,
    };
  });
  // Precondición: con 0 reales la prueba compararía 0 con 0 y pasaría en vacío.
  expect(real.pausados).toBeGreaterThan(0);
  expect(real.suspendidos).toBeGreaterThan(0);
  const leer = async () => {
    const texto = await page.locator("[data-radix-popper-content-wrapper]").innerText();
    const num = (re: RegExp) => Number((texto.match(re) ?? [])[1] ?? 0);
    return {
      pausados: num(/(\d+)\s+proyectos?\s+pausados?/i),
      suspendidos: num(/(\d+)\s+clientes?\s+suspendidos?/i),
    };
  };
  await page.getByRole("button", { name: "Notificaciones" }).click();
  await expect.poll(leer).toEqual(real);
  // Y cambia cuando cambian los datos: se suspende un cliente activo más.
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("ioting.mock.db.v1") ?? "{}");
    const c = db.clientes.find((x: { estado: string }) => x.estado === "activo");
    c.estado = "suspendido";
    localStorage.setItem("ioting.mock.db.v1", JSON.stringify(db));
  });
  await page.reload();
  await page.getByRole("button", { name: "Notificaciones" }).click();
  await expect.poll(leer).toEqual({ pausados: real.pausados, suspendidos: real.suspendidos + 1 });
});

test("el usuario del encabezado sale de la sesión, no de texto fijo", async ({ page }) => {
  await entrar(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("ioting.mock.session.v1") ?? "{}");
    s.nombre = "Ana Prueba";
    localStorage.setItem("ioting.mock.session.v1", JSON.stringify(s));
  });
  await page.reload();
  await expect(page.locator("header")).toContainText("Ana Prueba");
  await expect(page.locator("header")).toContainText("AP");
  await expect(page.locator("header")).not.toContainText("Juan Camilo");
});

test("avatar: el usuario semilla «Juan Camilo Velásquez» da «JV», leído de la sesión", async ({
  page,
}) => {
  await entrar(page);
  const sesion = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("ioting.mock.session.v1") ?? "{}"),
  );
  // Precondición: el dato de partida es el esperado (no se asume, se lee).
  expect(sesion.nombre).toBe("Juan Camilo Velásquez");
  const avatar = page.locator("header span.rounded-full").filter({ hasText: /^[A-Z]{1,2}$/ });
  await expect(avatar).toHaveText("JV");
  await expect(page.locator("header")).toContainText("Juan Camilo");
});
