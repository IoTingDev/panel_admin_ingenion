import type { AuthApi, Operador } from "../types";
import { ErrorApi } from "./errores";
import type { Transporte } from "./transporte";

/**
 * Enlace directo a la aplicación SAML del panel en el portal de acceso de IAM Identity Center
 * (ADR-0046). Con sesión del portal vigente entra al panel sin elegir la aplicación; sin ella, el
 * portal pide el inicio de sesión (con MFA) y continúa hacia la aplicación. Es la dirección que
 * enlaza el icono del portal. El identificador `ins-…` es de la aplicación, no un secreto; si la
 * aplicación se recrea, cambia (ver `docs/operacion/panel-saml-identity-center.md` del monorepo).
 */
export const URL_PORTAL_ACCESO_DEFECTO =
  "https://iotingdev.awsapps.com/start/#/saml/default/Panel%20de%20administraci%C3%B3n%20IoTing%20Dev/ins-722365902024ff67";

/**
 * `AuthApi` sobre la sesión real del operador. No hay usuario y contraseña propios: el ingreso es
 * corporativo (IAM Identity Center, doble factor) y se inicia desde el portal de acceso, que entrega
 * una aserción SAML al backend; este responde con la cookie de sesión. `currentUser` pregunta al
 * backend quién es el operador de la sesión vigente (`auth.sesion`); sin sesión (401) devuelve null.
 */
export function crearAuthSesion(
  transporte: Transporte,
  opciones: { urlPortal?: string | undefined; irA?: (url: string) => void } = {},
): AuthApi {
  const urlPortal = opciones.urlPortal || URL_PORTAL_ACCESO_DEFECTO;
  const irA = opciones.irA ?? ((url: string) => window.location.assign(url));
  const consultar = async (): Promise<Operador | null> => {
    try {
      return (await transporte.invocar({
        interfaz: "auth",
        operacion: "sesion",
        args: [],
      })) as Operador;
    } catch (e) {
      if (e instanceof ErrorApi && (e.codigo === "sin_sesion" || e.codigo === "sin_permiso"))
        return null;
      throw e;
    }
  };
  return {
    async login() {
      irA(urlPortal);
      // La página se abandona: nunca resuelve con un Operador.
      return new Promise<Operador>(() => {});
    },
    async logout() {
      await transporte.invocar({ interfaz: "auth", operacion: "salir", args: [] }).catch(() => {});
    },
    currentUser: consultar,
    async role() {
      return (await consultar())?.rol ?? null;
    },
  };
}
