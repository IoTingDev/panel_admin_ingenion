import { createFileRoute } from "@tanstack/react-router";
import { IngresosProyectosView } from "@/components/panel/ingresos-proyectos";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/proyectos/ingresos")({
  head: () =>
    pageHead(
      "Ingresos por proyectos",
      "Ingresos y proyectos por tipo de proyecto y por sector del cliente de IoTing Dev.",
    ),
  component: IngresosProyectosView,
});
