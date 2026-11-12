import { createFileRoute } from "@tanstack/react-router";
import { ItemDetail } from "@/components/panel/inventario";
import { pageHead } from "@/lib/meta";
export const Route = createFileRoute("/_panel/inventario/$sku")({
  head: () => pageHead("Ítem de inventario", "Stock, estado e historial del ítem."),
  component: function C() {
    return <ItemDetail sku={Route.useParams().sku} />;
  },
});
