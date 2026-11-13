import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { crearApiHttp, OPERACIONES } from "@/lib/api/http/cliente";
import { proveedorNoConfigurado } from "@/lib/api/http/auth-token";
import { codigoDeEstado, ErrorApi, errorDeRespuesta } from "@/lib/api/http/errores";
import { crearTransporteHttp, type Transporte } from "@/lib/api/http/transporte";
import { seleccionarApi } from "@/lib/api";
import { mockApi } from "@/lib/api/mock";
import { estadoHttpDeError, iniciarFixture, type Fixture } from "./contrato/servidor-fixture";

describe("las operaciones del cliente cubren exactamente las de types.ts", () => {
  it("cada interfaz del mock coincide con OPERACIONES (ninguna falta ni sobra)", () => {
    const mock = mockApi as unknown as Record<string, Record<string, unknown>>;
    for (const interfaz of Object.keys(mock).filter((k) => k !== "auth")) {
      expect(Object.keys(mock[interfaz]!).sort(), interfaz).toEqual(
        [...(OPERACIONES as Record<string, readonly string[]>)[interfaz]!].sort(),
      );
    }
    expect(Object.keys(OPERACIONES).sort()).toEqual(
      Object.keys(mock)
        .filter((k) => k !== "auth")
        .sort(),
    );
  });

  it("cada método delega una llamada con interfaz, operación y argumentos", async () => {
    const invocar = vi.fn(async () => "ok");
    const t: Transporte = { invocar };
    const api = crearApiHttp(t);
    await api.inventario.darDeBaja("SEN-001", "motivo");
    await api.clientes.list();
    expect(invocar).toHaveBeenNthCalledWith(1, {
      interfaz: "inventario",
      operacion: "darDeBaja",
      args: ["SEN-001", "motivo"],
    });
    expect(invocar).toHaveBeenNthCalledWith(2, {
      interfaz: "clientes",
      operacion: "list",
      args: [],
    });
  });
});

describe("mapeo de errores HTTP → errores del contrato §8", () => {
  it.each([
    [404, "no_encontrado"],
    [422, "validacion"],
    [400, "validacion"],
    [409, "regla_negocio"],
    [401, "sin_sesion"],
    [403, "sin_permiso"],
    [500, "desconocido"],
    [503, "desconocido"],
  ])("estado %i → %s", (estado, codigo) => {
    expect(codigoDeEstado(estado)).toBe(codigo);
    expect(errorDeRespuesta(estado, { mensaje: "x" }).codigo).toBe(codigo);
  });
  it("conserva el mensaje del servidor y, sin cuerpo, usa uno por defecto", () => {
    expect(
      errorDeRespuesta(409, { mensaje: "Stock insuficiente: hay 1 und y se intenta sacar 2." })
        .message,
    ).toBe("Stock insuficiente: hay 1 und y se intenta sacar 2.");
    expect(errorDeRespuesta(404, undefined).message).toMatch(/no encontrado/i);
    expect(errorDeRespuesta(422, { otra: 1 }).message).toMatch(/no son válidos/i);
  });
  it("la clasificación del fixture sigue la tabla del contrato §8", () => {
    expect(estadoHttpDeError("Ítem no encontrado")).toBe(404);
    expect(estadoHttpDeError("Año de compra inválido (1990..2026).")).toBe(422);
    expect(estadoHttpDeError("Stock insuficiente: hay 1 und y se intenta sacar 2.")).toBe(409);
    expect(estadoHttpDeError("La baja exige un motivo.")).toBe(422);
    expect(
      estadoHttpDeError("Importación rechazada, no se aplicó nada. Fila 3: SKU inexistente: X"),
    ).toBe(409);
    expect(estadoHttpDeError("Escriba exactamente ELIMINAR DEMO para confirmar.")).toBe(422);
    expect(estadoHttpDeError("Respaldo inválido: no es un respaldo del panel de IoTing Dev.")).toBe(
      422,
    );
  });
});

describe("transporte HTTP", () => {
  const ok = (cuerpo: unknown, estado = 200) =>
    vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: estado }));

  it("arma POST con token Bearer y cuerpo { args }, y devuelve el resultado", async () => {
    const fetchImpl = ok({ resultado: [1, 2] });
    const t = crearTransporteHttp({
      baseUrl: "https://api.ejemplo.test/",
      tokenProvider: { getToken: async () => "abc" },
      fetchImpl,
    });
    expect(await t.invocar({ interfaz: "clientes", operacion: "list", args: [7] })).toEqual([1, 2]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.ejemplo.test/clientes/list");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer abc");
    expect(JSON.parse(String(init.body))).toEqual({ args: [7] });
  });

  it("sin credenciales NO hace la llamada y falla con «no configurado» (proveedor actual)", async () => {
    const fetchImpl = ok({});
    const t = crearTransporteHttp({
      baseUrl: "https://x.test",
      tokenProvider: proveedorNoConfigurado,
      fetchImpl,
    });
    await expect(
      t.invocar({ interfaz: "clientes", operacion: "list", args: [] }),
    ).rejects.toMatchObject({
      codigo: "no_configurado",
      message: expect.stringMatching(/ADR de identidad/),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sin URL base tampoco llama y dice qué falta", async () => {
    const fetchImpl = ok({});
    const t = crearTransporteHttp({
      baseUrl: "  ",
      tokenProvider: { getToken: async () => "t" },
      fetchImpl,
    });
    await expect(t.invocar({ interfaz: "a", operacion: "b", args: [] })).rejects.toThrow(
      /VITE_API_BASE_URL/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("un fallo de red es un error «red», y una respuesta de error conserva estado y mensaje", async () => {
    const caida = crearTransporteHttp({
      baseUrl: "https://x.test",
      tokenProvider: { getToken: async () => "t" },
      fetchImpl: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    await expect(caida.invocar({ interfaz: "a", operacion: "b", args: [] })).rejects.toMatchObject({
      codigo: "red",
    });
    const conflicto = crearTransporteHttp({
      baseUrl: "https://x.test",
      tokenProvider: { getToken: async () => "t" },
      fetchImpl: ok({ mensaje: "El ítem tiene movimientos" }, 409),
    });
    const e = await conflicto
      .invocar({ interfaz: "a", operacion: "b", args: [] })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e).toMatchObject({
      codigo: "regla_negocio",
      estado: 409,
      message: "El ítem tiene movimientos",
    });
  });
});

describe("contra el fixture: autenticación y errores con sus códigos", () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await iniciarFixture();
  });
  afterAll(async () => {
    await fixture.cerrar();
  });
  const api = (token: string) =>
    crearApiHttp(
      crearTransporteHttp({ baseUrl: fixture.url, tokenProvider: { getToken: async () => token } }),
    );

  it("sin el token correcto el servidor responde 401 y el cliente lo reporta como sin_sesion", async () => {
    await fetch(`${fixture.url}/__prueba__/reiniciar`, { method: "POST", body: "{}" });
    await expect(api("otro").clientes.list()).rejects.toMatchObject({
      codigo: "sin_sesion",
      estado: 401,
    });
    expect((await api(fixture.token).clientes.list()).length).toBeGreaterThan(0);
  });

  it("cada regla del contrato llega con su código: 404, 409 y 422", async () => {
    await fetch(`${fixture.url}/__prueba__/reiniciar`, { method: "POST", body: "{}" });
    const a = api(fixture.token);
    await expect(a.inventario.darDeBaja("NO-EXISTE", "motivo largo")).rejects.toMatchObject({
      codigo: "no_encontrado",
    });
    await expect(a.inventario.darDeBaja("SEN-001", "")).rejects.toMatchObject({
      codigo: "validacion",
    });
    await expect(
      a.inventario.registrarMovimiento({ sku: "SEN-001", tipo: "Salida", cantidad: 99 }),
    ).rejects.toMatchObject({
      codigo: "regla_negocio",
      estado: 409,
      message: expect.stringMatching(/Stock insuficiente/),
    });
    await expect(
      a.inventario.importarMovimientos([{ sku: "NO-EXISTE", tipo: "Salida", cantidad: 1 }]),
    ).rejects.toMatchObject({ codigo: "regla_negocio" });
  });
});

describe("selección de la implementación", () => {
  it("el modo mock (por defecto) devuelve la capa simulada, sin cambios", () => {
    expect(seleccionarApi("mock")).toBe(mockApi);
  });
  it("el modo api devuelve el cliente HTTP; la autenticación del operador queda como puerto pendiente", async () => {
    const a = seleccionarApi("api", { baseUrl: "", tokenProvider: proveedorNoConfigurado });
    expect(a).not.toBe(mockApi);
    expect(await a.auth.currentUser()).toBeNull();
    await expect(a.auth.login("x@y.co", "1234")).rejects.toMatchObject({
      codigo: "no_configurado",
    });
    await expect(a.clientes.list()).rejects.toMatchObject({ codigo: "no_configurado" });
  });
});
