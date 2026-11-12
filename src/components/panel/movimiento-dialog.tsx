import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApiMutation, useItems, useMovimientos, useProyectos } from "@/hooks/use-api";
import { stockActual, validarSalida } from "@/lib/inventario";
import { useUi } from "./ui-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function MovimientoDialog() {
  const { movimiento, closeMovimiento } = useUi();
  const { data: items = [] } = useItems();
  const { data: movs = [] } = useMovimientos();
  const { data: proyectos = [] } = useProyectos();
  const [sku, setSku] = useState("");
  const [tipo, setTipo] = useState<"Entrada" | "Salida">("Salida");
  const [cantidad, setCantidad] = useState(1);
  const [proyecto, setProyecto] = useState("");
  const [nota, setNota] = useState("");
  useEffect(() => {
    if (movimiento) {
      setSku(movimiento.sku ?? "");
      setProyecto(movimiento.proyecto ?? "");
      setTipo(movimiento.tipo ?? "Salida");
      setCantidad(1);
      setNota("");
    }
  }, [movimiento]);
  const selected = items.find((i) => i.sku === sku);
  const stock = selected ? stockActual(selected, movs) : 0;
  const error = tipo === "Salida" && selected ? validarSalida(stock, cantidad) : null;
  const mutation = useApiMutation(api.inventario.registrarMovimiento, "Movimiento registrado");
  return (
    <Dialog open={!!movimiento} onOpenChange={(o) => !o && closeMovimiento()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>Entrada o salida de material del inventario.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await mutation.mutateAsync({ sku, tipo, cantidad, proyecto, nota });
            closeMovimiento();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="mov-sku">Ítem de inventario</Label>
            <Input
              id="mov-sku"
              list="sku-list"
              value={sku}
              onChange={(e) => setSku(e.target.value.split(" · ")[0] ?? "")}
              placeholder="SKU o descripción"
              required
            />
            <datalist id="sku-list">
              {items.map((i) => (
                <option key={i.sku} value={i.sku}>
                  {i.descripcion}
                </option>
              ))}
            </datalist>
            {selected && <p className="text-xs text-muted-foreground">{selected.descripcion}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={tipo === "Entrada" ? "default" : "outline"}
              onClick={() => setTipo("Entrada")}
            >
              <ArrowDownLeft />
              Entrada
            </Button>
            <Button
              type="button"
              variant={tipo === "Salida" ? "default" : "outline"}
              onClick={() => setTipo("Salida")}
            >
              <ArrowUpRight />
              Salida
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mov-cantidad">Cantidad</Label>
            <Input
              id="mov-cantidad"
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mov-proyecto">Proyecto (opcional)</Label>
            <select
              id="mov-proyecto"
              className="app-select w-full"
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
            >
              <option value="">Sin proyecto</option>
              {proyectos
                .filter((p) => p.estado !== "baja")
                .map((p) => (
                  <option key={p.id}>{p.nombre}</option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mov-nota">Nota</Label>
            <Textarea id="mov-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
          <div className="flex justify-between rounded-lg bg-primary-soft p-3 text-sm">
            <span>
              Stock actual <strong>{stock}</strong>
            </span>
            <span>
              Resultante <strong>{stock + (tipo === "Entrada" ? cantidad : -cantidad)}</strong> und
            </span>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeMovimiento}>
              Cancelar
            </Button>
            <Button
              disabled={
                !selected ||
                !!error ||
                cantidad <= 0 ||
                !Number.isInteger(cantidad) ||
                mutation.isPending
              }
            >
              Confirmar movimiento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
