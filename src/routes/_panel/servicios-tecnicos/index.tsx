import { createFileRoute } from "@tanstack/react-router";
import { TrabajosView } from "@/components/panel/trabajos";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/servicios-tecnicos/")({
  head: () =>
    pageHead(
      "Servicios técnicos",
      "CCTV, alarmas, telecomunicaciones, mantenimiento e instalación de IoTing Dev.",
    ),
  component: TrabajosView,
});
