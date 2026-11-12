import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    locale: "es-CO",
    timezoneId: "America/Bogota",
    // Congela la animación de las gráficas: capturas deterministas, sin diferencias falsas.
    reducedMotion: "reduce",
  },
  webServer: {
    command: "bun run dev",
    url: "http://localhost:8080/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
