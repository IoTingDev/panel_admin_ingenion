import { useEffect, useState } from "react";
import { api, type NuevoTrabajo, type TrabajoTecnico } from "@/lib/api";
import { useApiMutation, useClientes } from "@/hooks/use-api";
import {
  ESTADOS_TRABAJO,
  ROTULO_ESTADO_TRABAJO,
  ROTULO_TIPO_TRABAJO,
  TIPOS_TRABAJO,
} from "@/lib/dominio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

interface Borrador {
  clienteId: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  sitioDireccion: string;
  ciudad: string;
  responsable: string;
  estado: string;
  fechaProgramada: string;
  fechaInicio: string;
  fechaFin: string;
  valorPactado: string;
  notas: string;
}

const vacio = (clienteId = ""): Borrador => ({
  clienteId,
  tipo: "cctv",
  titulo: "",
  descripcion: "",
  sitioDireccion: "",
  ciudad: "",
  responsable: "",
  estado: "programado",
  fechaProgramada: "",
  fechaInicio: "",
  fechaFin: "",
  valorPactado: "",
  notas: "",
});

const aBorrador = (t: TrabajoTecnico): Borrador => ({
  clienteId: t.clienteId,
  tipo: t.tipo,
  titulo: t.titulo,
  descripcion: t.descripcion ?? "",
  sitioDireccion: t.sitioDireccion ?? "",
  ciudad: t.ciudad ?? "",
  responsable: t.responsable ?? "",
  estado: t.estado,
  fechaProgramada: t.fechaProgramada?.slice(0, 10) ?? "",
  fechaInicio: t.fechaInicio?.slice(0, 10) ?? "",
  fechaFin: t.fechaFin?.slice(0, 10) ?? "",
  valorPactado: t.valorPactado === undefined ? "" : String(t.valorPactado),
  notas: t.notas ?? "",
});

const opt = (v: string) => (v.trim() === "" ? undefined : v.trim());

/** Alta y edición de un servicio técnico (entidad `TrabajoTecnico`). Las fechas son reales: se permite el pasado. */
export function TrabajoSheet({
  open,
  onClose,
  trabajo,
  clienteId = "",
}: {
  open: boolean;
  onClose: () => void;
  trabajo?: TrabajoTecnico | undefined;
  clienteId?: string;
}) {
  const { data: clientes = [] } = useClientes();
  const [f, setF] = useState<Borrador>(vacio(clienteId));
  useEffect(() => {
    if (open) setF(trabajo ? aBorrador(trabajo) : vacio(clienteId));
  }, [open, trabajo, clienteId]);
  const set = (k: keyof Borrador, v: string) => setF((p) => ({ ...p, [k]: v }));
  const guardar = useApiMutation(
    (v: Borrador) => {
      const data: NuevoTrabajo = {
        clienteId: v.clienteId,
        tipo: v.tipo as NuevoTrabajo["tipo"],
        titulo: v.titulo,
        descripcion: opt(v.descripcion),
        sitioDireccion: opt(v.sitioDireccion),
        ciudad: opt(v.ciudad),
        responsable: opt(v.responsable),
        fechaProgramada: opt(v.fechaProgramada),
        fechaInicio: opt(v.fechaInicio),
        fechaFin: opt(v.fechaFin),
        valorPactado: v.valorPactado.trim() === "" ? undefined : Number(v.valorPactado),
        notas: opt(v.notas),
      };
      return trabajo
        ? api.trabajos.update(trabajo.id, data)
        : api.trabajos.create({ ...data, estado: v.estado as NuevoTrabajo["estado"] });
    },
    (t) => `Servicio técnico ${t.codigo} guardado`,
  );
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{trabajo ? `Editar ${trabajo.codigo}` : "Nuevo servicio técnico"}</SheetTitle>
          <SheetDescription>
            CCTV, alarmas, telecomunicaciones, mantenimiento o instalación en sitio del cliente.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await guardar.mutateAsync(f);
            onClose();
          }}
        >
          <Label htmlFor="t-cliente">Cliente</Label>
          <select
            id="t-cliente"
            className="app-select w-full"
            required
            value={f.clienteId}
            onChange={(e) => set("clienteId", e.target.value)}
          >
            <option value="">Seleccione cliente</option>
            {clientes
              .filter((c) => c.estado === "activo" || c.id === trabajo?.clienteId)
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.razonSocial}
                </option>
              ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="t-tipo">Tipo</Label>
              <select
                id="t-tipo"
                className="app-select w-full"
                value={f.tipo}
                onChange={(e) => set("tipo", e.target.value)}
              >
                {TIPOS_TRABAJO.map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_TRABAJO[t]}
                  </option>
                ))}
              </select>
            </div>
            {!trabajo && (
              <div className="space-y-2">
                <Label htmlFor="t-estado">Estado</Label>
                <select
                  id="t-estado"
                  className="app-select w-full"
                  value={f.estado}
                  onChange={(e) => set("estado", e.target.value)}
                >
                  {ESTADOS_TRABAJO.filter((s) => s !== "cancelado").map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_ESTADO_TRABAJO[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <Label htmlFor="t-titulo">Título</Label>
          <Input
            id="t-titulo"
            required
            value={f.titulo}
            onChange={(e) => set("titulo", e.target.value)}
          />
          <Label htmlFor="t-desc">Descripción</Label>
          <Textarea
            id="t-desc"
            value={f.descripcion}
            onChange={(e) => set("descripcion", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="t-sitio">Dirección del sitio</Label>
              <Input
                id="t-sitio"
                value={f.sitioDireccion}
                onChange={(e) => set("sitioDireccion", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-ciudad">Ciudad</Label>
              <Input
                id="t-ciudad"
                value={f.ciudad}
                onChange={(e) => set("ciudad", e.target.value)}
              />
            </div>
          </div>
          <Label htmlFor="t-resp">Responsable</Label>
          <Input
            id="t-resp"
            value={f.responsable}
            onChange={(e) => set("responsable", e.target.value)}
          />
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["fechaProgramada", "Fecha programada"],
                ["fechaInicio", "Fecha de inicio"],
                ["fechaFin", "Fecha de fin"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="space-y-2">
                <Label htmlFor={`t-${k}`}>{label}</Label>
                <Input
                  id={`t-${k}`}
                  type="date"
                  value={f[k]}
                  onChange={(e) => set(k, e.target.value)}
                />
              </div>
            ))}
          </div>
          <Label htmlFor="t-valor">Valor pactado (COP, informativo)</Label>
          <Input
            id="t-valor"
            type="number"
            min="0"
            step="1"
            placeholder="La facturación vive en Alegra"
            value={f.valorPactado}
            onChange={(e) => set("valorPactado", e.target.value)}
          />
          <Label htmlFor="t-notas">Notas</Label>
          <Textarea id="t-notas" value={f.notas} onChange={(e) => set("notas", e.target.value)} />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={guardar.isPending}>Guardar servicio técnico</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
