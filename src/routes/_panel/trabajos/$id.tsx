import { createFileRoute } from "@tanstack/react-router";
import { TrabajoDetail } from "@/components/panel/trabajos";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/trabajos/$id")({
  head: () => pageHead("Detalle de trabajo", "Estado, materiales y actividad del trabajo técnico."),
  component: function C() {
    return <TrabajoDetail id={Route.useParams().id} />;
  },
});
