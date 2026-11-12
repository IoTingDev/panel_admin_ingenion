import { useState } from "react";
import { api, type GrupoInventario, type ItemInventario } from "@/lib/api";
import { useApiMutation, useConfiguracion } from "@/hooks/use-api";
import { siguienteSku } from "@/lib/inventario";
import { GRUPOS, ROTULO_GRUPO } from "@/lib/config-inventario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const VACIO = {
  subcategoria: "",
  descripcion: "",
  marca_referencia: "",
  cantidad_inicial: 0,
  ubicacion: "",
  notas: "",
  proveedor: "",
  anioCompra: "",
  valorUnitario: "",
  vidaUtilAnios: "",
};

/** Alta de un ítem: grupo explícito, categoría del grupo, valoración opcional. */
export function NuevoItemSheet({
  open,
  onClose,
  grupo: grupoActivo,
  items,
}: {
  open: boolean;
  onClose: () => void;
  grupo: GrupoInventario;
  items: ItemInventario[];
}) {
  const { data: config } = useConfiguracion();
  const [grupoElegido, setGrupoElegido] = useState<GrupoInventario | "">("");
  const [categoria, setCategoria] = useState("");
  const [f, setF] = useState(VACIO);
  const grupo = grupoElegido || grupoActivo;
  const categorias = config?.inventario.categorias[grupo] ?? [];
  const cat = categorias.includes(categoria) ? categoria : (categorias[0] ?? "");
  const prefijos = config?.inventario.prefijos;
  const crear = useApiMutation(api.inventario.createItem, (r) => `Ítem ${r.sku} creado`);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nuevo ítem</SheetTitle>
          <SheetDescription>
            El SKU se genera según la categoría:{" "}
            <span className="code-id">
              {cat && prefijos ? siguienteSku(cat, items, prefijos) : "—"}
            </span>
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await crear.mutateAsync({
              subcategoria: f.subcategoria,
              descripcion: f.descripcion,
              marca_referencia: f.marca_referencia,
              cantidad_inicial: f.cantidad_inicial,
              ubicacion: f.ubicacion,
              notas: f.notas,
              proveedor: f.proveedor.trim() || undefined,
              anioCompra: num(f.anioCompra),
              valorUnitario: num(f.valorUnitario),
              vidaUtilAnios: num(f.vidaUtilAnios),
              grupo,
              categoria: cat,
              unidad: "und",
              estado: "Disponible",
              stock_minimo: null,
            });
            onClose();
            setF(VACIO);
          }}
        >
          <Label htmlFor="n-grupo">Grupo</Label>
          <select
            id="n-grupo"
            className="app-select w-full"
            value={grupo}
            onChange={(e) => {
              setGrupoElegido(e.target.value as GrupoInventario);
              setCategoria("");
            }}
          >
            {GRUPOS.map((g) => (
              <option key={g} value={g}>
                {ROTULO_GRUPO[g]}
              </option>
            ))}
          </select>
          <Label htmlFor="n-cat">Categoría</Label>
          <select
            id="n-cat"
            className="app-select w-full"
            value={cat}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {categorias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {(["subcategoria", "descripcion", "marca_referencia", "ubicacion"] as const).map((k) => (
            <div key={k} className="space-y-2">
              <Label htmlFor={`n-${k}`}>
                {
                  {
                    subcategoria: "Subcategoría",
                    descripcion: "Descripción",
                    marca_referencia: "Marca / referencia",
                    ubicacion: "Ubicación",
                  }[k]
                }
              </Label>
              <Input
                id={`n-${k}`}
                required={k === "descripcion" || k === "subcategoria"}
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              />
            </div>
          ))}
          <Label htmlFor="n-cant">Cantidad inicial</Label>
          <Input
            id="n-cant"
            type="number"
            min="0"
            step="1"
            value={f.cantidad_inicial}
            onChange={(e) =>
              setF({ ...f, cantidad_inicial: Math.max(0, Math.floor(Number(e.target.value))) })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="n-valor">Valor unitario (COP)</Label>
              <Input
                id="n-valor"
                type="number"
                min="0"
                step="1"
                placeholder="Sin valor"
                value={f.valorUnitario}
                onChange={(e) => setF({ ...f, valorUnitario: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-anio">Año de compra</Label>
              <Input
                id="n-anio"
                type="number"
                min="1990"
                step="1"
                value={f.anioCompra}
                onChange={(e) => setF({ ...f, anioCompra: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-vida">Vida útil (años)</Label>
              <Input
                id="n-vida"
                type="number"
                min="1"
                step="1"
                placeholder="Según el grupo"
                value={f.vidaUtilAnios}
                onChange={(e) => setF({ ...f, vidaUtilAnios: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-prov">Proveedor</Label>
              <Input
                id="n-prov"
                value={f.proveedor}
                onChange={(e) => setF({ ...f, proveedor: e.target.value })}
              />
            </div>
          </div>
          <Label htmlFor="n-notas">Notas</Label>
          <Textarea
            id="n-notas"
            value={f.notas}
            onChange={(e) => setF({ ...f, notas: e.target.value })}
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={crear.isPending}>Crear ítem</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
