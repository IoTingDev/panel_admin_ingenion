import { describe, expect, it, vi } from "vitest";
import { proveedorCsrfPorCookie } from "@/lib/api/http/auth-token";
import { crearAuthSesion } from "@/lib/api/http/auth-sesion";
import { ErrorApi } from "@/lib/api/http/errores";
import { estaDespertando, marcarDespertando } from "@/lib/api/http/estado-conexion";
import {
  crearTransporteHttp,
  ESPERAS_REANUDACION_MS,
  type ConfigTransporteHttp,
} from "@/lib/api/http/transporte";

const json = (estado: number, cuerpo: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json", ...extra },
  });
const DESPIERTA = { mensaje: "Despertando la base de datos…", reintentable: true };

function transporte(
  respuestas: Response[],
  extra: Partial<ConfigTransporteHttp> = {},
): { t: ReturnType<typeof crearTransporteHttp>; llamadas: { url: string; init: RequestInit }[] } {
  const llamadas: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return respuestas[Math.min(i++, respuestas.length - 1)]!.clone();
  }) as unknown as typeof fetch;
  return {
    t: crearTransporteHttp({
      baseUrl: "/v1",
      tokenProvider: { getToken: async () => "csrf-123" },
      esquema: "cookie",
      fetchImpl,
      ...extra,
    }),
    llamadas,
  };
}
const peticion = { interfaz: "clientes", operacion: "list", args: [] as unknown[] };

describe("transporte con sesión por cookie (ADR-0046)", () => {
  it("envía la cookie (credentials: include) y el valor anti-CSRF, y NO un Bearer", async () => {
    const { t, llamadas } = transporte([json(200, { resultado: [1] })]);
    expect(await t.invocar(peticion)).toEqual([1]);
    const { url, init } = llamadas[0]!;
    expect(url).toBe("/v1/clientes/list");
    expect(init.credentials).toBe("include");
    const h = init.headers as Record<string, string>;
    expect(h["x-csrf-token"]).toBe("csrf-123");
    expect(h["Authorization"]).toBeUndefined();
  });

  it("el esquema Bearer (por defecto) sigue igual: Authorization y sin credentials", async () => {
    const llamadas: RequestInit[] = [];
    const t = crearTransporteHttp({
      baseUrl: "/x",
      tokenProvider: { getToken: async () => "tok" },
      fetchImpl: (async (_u: string, init: RequestInit) => {
        llamadas.push(init);
        return json(200, { resultado: 1 });
      }) as unknown as typeof fetch,
    });
    await t.invocar(peticion);
    expect((llamadas[0]!.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect(llamadas[0]!.credentials).toBeUndefined();
  });
});

describe("reintento mientras la base de datos se reanuda", () => {
  it("espera con pausas crecientes, avisa a la interfaz y termina con el resultado", async () => {
    const pausas: number[] = [];
    const avisos: boolean[] = [];
    const { t, llamadas } = transporte(
      [
        json(503, DESPIERTA),
        json(503, DESPIERTA),
        json(503, DESPIERTA),
        json(200, { resultado: "ok" }),
      ],
      {
        reintentoReanudacion: {
          esperasMs: ESPERAS_REANUDACION_MS,
          dormir: async (ms) => void pausas.push(ms),
          alEsperar: (e) => void avisos.push(e),
        },
      },
    );
    expect(await t.invocar(peticion)).toBe("ok");
    expect(llamadas).toHaveLength(4);
    expect(pausas).toEqual([3000, 3000, 5000]);
    expect(avisos).toEqual([true, false]); // «Despertando…» se muestra una vez y se retira
  });

  it("agota unos 90 s y entonces falla con el mensaje del servidor (no espera para siempre)", async () => {
    const pausas: number[] = [];
    const avisos: boolean[] = [];
    const { t, llamadas } = transporte([json(503, DESPIERTA)], {
      reintentoReanudacion: {
        esperasMs: ESPERAS_REANUDACION_MS,
        dormir: async (ms) => {
          pausas.push(ms);
          if (pausas.length > 50) throw new Error("bucle de reintento sin fin");
        },
        alEsperar: (e) => void avisos.push(e),
      },
    });
    await expect(t.invocar(peticion)).rejects.toMatchObject({
      name: "ErrorApi",
      estado: 503,
      message: "Despertando la base de datos…",
    });
    const total = pausas.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(85_000);
    expect(total).toBeLessThanOrEqual(95_000);
    expect(llamadas).toHaveLength(ESPERAS_REANUDACION_MS.length + 1);
    expect(avisos).toEqual([true, false]);
  });

  it("un 503 que NO es reintentable, o un error de negocio, no se reintenta", async () => {
    for (const r of [json(503, { mensaje: "caído" }), json(409, { mensaje: "regla" })]) {
      const pausas: number[] = [];
      const { t, llamadas } = transporte([r], {
        reintentoReanudacion: {
          esperasMs: ESPERAS_REANUDACION_MS,
          dormir: async (m) => void pausas.push(m),
        },
      });
      await expect(t.invocar(peticion)).rejects.toBeInstanceOf(ErrorApi);
      expect(llamadas).toHaveLength(1);
      expect(pausas).toEqual([]);
    }
  });

  it("sin configuración de reintento, un 503 reintentable es un error inmediato", async () => {
    const { t, llamadas } = transporte([json(503, DESPIERTA)]);
    await expect(t.invocar(peticion)).rejects.toMatchObject({ estado: 503 });
    expect(llamadas).toHaveLength(1);
  });

  it("si el reintento termina en error de red, el aviso también se retira", async () => {
    const avisos: boolean[] = [];
    let n = 0;
    const t = crearTransporteHttp({
      baseUrl: "/v1",
      tokenProvider: { getToken: async () => "c" },
      esquema: "cookie",
      fetchImpl: (async () => {
        if (n++ === 0) return json(503, DESPIERTA);
        throw new TypeError("red");
      }) as unknown as typeof fetch,
      reintentoReanudacion: {
        esperasMs: [1],
        dormir: async () => {},
        alEsperar: (e) => void avisos.push(e),
      },
    });
    await expect(t.invocar(peticion)).rejects.toMatchObject({ codigo: "red" });
    expect(avisos).toEqual([true, false]);
  });
});

describe("proveedor de CSRF por cookie", () => {
  it("lee el valor de panel_csrf entre otras cookies", async () => {
    const p = proveedorCsrfPorCookie(() => "a=1; panel_csrf=abc-123; b=2");
    expect(await p.getToken()).toBe("abc-123");
  });
  it("sin la cookie no hay sesión: lanza sin_sesion (y el cliente no llama)", async () => {
    await expect(proveedorCsrfPorCookie(() => "a=1").getToken()).rejects.toMatchObject({
      codigo: "sin_sesion",
    });
    await expect(proveedorCsrfPorCookie(() => "panel_csrf=").getToken()).rejects.toMatchObject({
      codigo: "sin_sesion",
    });
    // un nombre parecido no vale
    await expect(proveedorCsrfPorCookie(() => "x_panel_csrf=zzz").getToken()).rejects.toMatchObject(
      {
        codigo: "sin_sesion",
      },
    );
  });
});

describe("AuthApi de sesión real", () => {
  const operador = {
    id: "j@ioting.dev",
    nombre: "Juan",
    email: "j@ioting.dev",
    rol: "Administrador",
  };
  it("currentUser devuelve al operador de la sesión y null cuando no hay sesión (401)", async () => {
    const con = crearAuthSesion(transporte([json(200, { resultado: operador })]).t);
    expect(await con.currentUser()).toEqual(operador);
    expect(await con.role()).toBe("Administrador");
    const sin = crearAuthSesion(transporte([json(401, { mensaje: "No hay sesión" })]).t);
    expect(await sin.currentUser()).toBeNull();
    expect(await sin.role()).toBeNull();
  });
  it("un error que no es de sesión (p. ej. 500) NO se disfraza de «sin sesión»", async () => {
    const roto = crearAuthSesion(transporte([json(500, { mensaje: "Error interno." })]).t);
    await expect(roto.currentUser()).rejects.toMatchObject({ estado: 500 });
  });
  it("login lleva al portal de acceso corporativo (no hay contraseña propia)", async () => {
    const irA = vi.fn();
    const a = crearAuthSesion(transporte([json(200, {})]).t, {
      urlPortal: "https://portal.test/start",
      irA,
    });
    void a.login("x", "y");
    expect(irA).toHaveBeenCalledWith("https://portal.test/start");
  });
  it("logout pide al backend cerrar la sesión y no falla si el backend no responde", async () => {
    const { t, llamadas } = transporte([json(200, {})]);
    await crearAuthSesion(t).logout();
    expect(llamadas[0]!.url).toBe("/v1/auth/salir");
    const caido = crearTransporteHttp({
      baseUrl: "/v1",
      tokenProvider: { getToken: async () => "c" },
      esquema: "cookie",
      fetchImpl: (async () => {
        throw new TypeError("sin red");
      }) as unknown as typeof fetch,
    });
    await expect(crearAuthSesion(caido).logout()).resolves.toBeUndefined();
  });
});

describe("estado de conexión", () => {
  it("marcarDespertando alterna el estado que lee la interfaz", () => {
    expect(estaDespertando()).toBe(false);
    marcarDespertando(true);
    expect(estaDespertando()).toBe(true);
    marcarDespertando(false);
    expect(estaDespertando()).toBe(false);
  });
});
