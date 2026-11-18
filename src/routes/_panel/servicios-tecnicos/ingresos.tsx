import { createFileRoute } from "@tanstack/react-router";
import { IngresosView } from "@/components/panel/ingresos";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/servicios-tecnicos/ingresos")({
  head: () =>
    pageHead(
      "Ingresos por servicios",
      "Ingresos y servicios por tipo de trabajo y por sector del cliente de IoTing Dev.",
    ),
  component: IngresosView,
});
