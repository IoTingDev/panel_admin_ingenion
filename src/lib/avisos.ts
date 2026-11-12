import type { Cliente, ItemInventario, MovimientoInventario, Proyecto } from "@/lib/api/types";
import { esStockBajo, stockMap } from "@/lib/inventario";

export interface Aviso {
  clave: string;
  texto: string;
  to: "/proyectos" | "/clientes" | "/inventario";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Avisos del encabezado: todo se calcula de los datos, nada es texto fijo. */
export function derivarAvisos(d: {
  proyectos: Pick<Proyecto, "estado">[];
  clientes: Pick<Cliente, "estado">[];
  items: ItemInventario[];
  movimientos: MovimientoInventario[];
}): Aviso[] {
  const avisos: Aviso[] = [];
  const pausados = d.proyectos.filter((p) => p.estado === "pausado").length;
  if (pausados > 0)
    avisos.push({
      clave: "proyectos-pausados",
      texto: plural(pausados, "proyecto pausado", "proyectos pausados"),
      to: "/proyectos",
    });
  const suspendidos = d.clientes.filter((c) => c.estado === "suspendido").length;
  if (suspendidos > 0)
    avisos.push({
      clave: "clientes-suspendidos",
      texto: plural(suspendidos, "cliente suspendido", "clientes suspendidos"),
      to: "/clientes",
    });
  const activos = d.items.filter((i) => i.estado !== "Baja");
  const stocks = stockMap(activos, d.movimientos);
  const bajos = activos.filter((i) => esStockBajo(stocks.get(i.sku) ?? 0, i.stock_minimo)).length;
  if (bajos > 0)
    avisos.push({
      clave: "stock-bajo",
      texto: plural(bajos, "ítem bajo el mínimo", "ítems bajo el mínimo"),
      to: "/inventario",
    });
  return avisos;
}
