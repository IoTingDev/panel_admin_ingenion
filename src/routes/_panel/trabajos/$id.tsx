import { createFileRoute, redirect } from "@tanstack/react-router";
/** Ruta anterior (v2): se conserva solo para redirigir a /servicios-tecnicos/$id. */
export const Route = createFileRoute("/_panel/trabajos/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/servicios-tecnicos/$id", params: { id: params.id }, replace: true });
  },
});
