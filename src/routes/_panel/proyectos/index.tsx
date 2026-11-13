import { createFileRoute } from "@tanstack/react-router";
import { ProyectosView } from "@/components/panel/proyectos";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/proyectos/")({
  head: () => pageHead("Proyectos I+D+I", "Proyectos IoT de IoTing Dev en tabla y tablero."),
  component: ProyectosView,
});
