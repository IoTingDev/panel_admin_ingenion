import { createFileRoute, redirect } from "@tanstack/react-router";
/** Ruta anterior (v2): se conserva solo para redirigir a /servicios-tecnicos. */
export const Route = createFileRoute("/_panel/trabajos/")({
  beforeLoad: () => {
    throw redirect({ to: "/servicios-tecnicos", replace: true });
  },
});
