import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ClientesView } from "@/components/panel/clientes";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/clientes/")({
  validateSearch: z.object({ nuevo: z.boolean().optional().catch(undefined) }),
  head: () => pageHead("Clientes", "Gestión de clientes agroindustriales de IoTing Dev."),
  component: function C() {
    const { nuevo } = Route.useSearch();
    return <ClientesView nuevo={nuevo ?? false} />;
  },
});
