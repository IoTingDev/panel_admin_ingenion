import { test, expect, type Page } from "@playwright/test";
import { RUTAS } from "./rutas";

// MODO=baseline escribe en tests/visual/baseline; MODO=actual en tests/visual/actual.
const MODO = process.env.MODO === "baseline" ? "baseline" : "actual";
const ANCHOS = [
  { nombre: "1440", width: 1440, height: 900 },
  { nombre: "390", width: 390, height: 844 },
];

async function entrar(page: Page, tema: "light" | "dark") {
  await page.addInitScript((t) => window.localStorage.setItem("theme", t), tema);
  // Solo en pruebas: detiene las animaciones CSS (p. ej. el punto pulsante de «Datos de
  // demostración») para que el comparador no marque diferencias que no son de la fase.
  await page.addInitScript(() => {
    const congelar = () => {
      const s = document.createElement("style");
      s.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
      document.head.appendChild(s);
    };
    if (document.head) congelar();
    else document.addEventListener("DOMContentLoaded", congelar);
  });
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

for (const ancho of ANCHOS) {
  for (const tema of ["light", "dark"] as const) {
    test(`capturas ${ancho.nombre}px ${tema}`, async ({ page }) => {
      await page.setViewportSize({ width: ancho.width, height: ancho.height });
      await page.clock.install({ time: new Date("2026-11-12T10:00:00-05:00") });
      await entrar(page, tema);
      let hechas = 0;
      for (const { nombre, ruta } of RUTAS) {
        await page.goto(ruta);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        // La captura debe ser de una página real, no del 404 ni del login.
        await expect(page.locator("body")).not.toContainText(/no encontrad|404/i);
        expect(new URL(page.url()).pathname).toBe(ruta);
        await page.screenshot({
          path: `tests/visual/${MODO}/${ancho.nombre}-${tema}-${nombre}.png`,
          fullPage: true,
        });
        hechas++;
      }
      expect(hechas).toBe(RUTAS.length);
    });
  }
}
