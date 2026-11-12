import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracionView } from "@/components/panel/sistema";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/configuracion")({
  head: () => pageHead("Configuración", "Perfil, tema y conexión de datos del panel."),
  component: ConfiguracionView,
});
