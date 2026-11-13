/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: "mock" | "api";
  readonly VITE_API_BASE_URL?: string;
  /** Portal de acceso de IAM Identity Center (inicio del flujo SAML del operador). */
  readonly VITE_PORTAL_ACCESO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
