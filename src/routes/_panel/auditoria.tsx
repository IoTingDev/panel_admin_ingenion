import { createFileRoute } from "@tanstack/react-router";
import { AuditoriaView } from "@/components/panel/sistema";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/auditoria")({
  head: () => pageHead("Auditoría", "Registro inmutable de acciones del panel IoTing Dev."),
  component: AuditoriaView,
});
