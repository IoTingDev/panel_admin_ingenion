import { createFileRoute } from "@tanstack/react-router";
import { TrabajoDetail } from "@/components/panel/trabajos";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/servicios-tecnicos/$id")({
  head: () =>
    pageHead("Detalle de servicio técnico", "Estado, materiales y actividad del servicio técnico."),
  component: function C() {
    return <TrabajoDetail id={Route.useParams().id} />;
  },
});
