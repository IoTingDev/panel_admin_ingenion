import { createFileRoute } from "@tanstack/react-router";
import { ValorInventarioView } from "@/components/panel/inventario-valor";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/inventario/valor")({
  head: () =>
    pageHead(
      "Valor del inventario",
      "Invertido, existencia a costo y valor estimado del inventario de IoTing Dev.",
    ),
  component: ValorInventarioView,
});
