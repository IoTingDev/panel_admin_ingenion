import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { HijosReactivables } from "@/lib/api";

/**
 * Reactivar un cliente NO reactiva a sus usuarios ni proyectos: se ofrecen aquí para
 * reactivarlos selectivamente (cada reactivación queda en auditoría).
 */
export function ReactivarHijosDialog({
  clienteId,
  hijos,
  onClose,
}: {
  clienteId: string;
  hijos: HijosReactivables | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [usuarios, setUsuarios] = useState<Set<string>>(new Set());
  const [proyectos, setProyectos] = useState<Set<string>>(new Set());
  const [trabajos, setTrabajos] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setUsuarios(new Set());
    setProyectos(new Set());
    setTrabajos(new Set());
  }, [hijos]);
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  };
  const total = usuarios.size + proyectos.size + trabajos.size;
  const aplicar = async () => {
    setBusy(true);
    try {
      const motivo = "Reactivación selectiva tras reactivar al cliente";
      for (const id of usuarios) await api.usuarios.cambiarEstado(id, "activo", motivo);
      for (const id of proyectos) await api.proyectos.cambiarEstado(id, "activo", motivo);
      for (const id of trabajos) await api.trabajos.cambiarEstado(id, "programado", motivo);
      await qc.invalidateQueries();
      toast.success(`${total} registro(s) reactivado(s)`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!hijos} onOpenChange={(o) => !o && onClose()} key={clienteId}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cliente reactivado</DialogTitle>
          <DialogDescription>
            Sus usuarios, proyectos y servicios técnicos siguen en baja o cancelados. Marque los que
            quiere reactivar; el resto queda como está.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-4 overflow-auto text-sm">
          {hijos && hijos.usuarios.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold">Usuarios</legend>
              {hijos.usuarios.map((u) => (
                <label key={u.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={usuarios.has(u.id)}
                    onCheckedChange={() => toggle(usuarios, setUsuarios, u.id)}
                  />
                  {u.nombre} <span className="text-muted-foreground">· {u.email}</span>
                </label>
              ))}
            </fieldset>
          )}
          {hijos && hijos.proyectos.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold">Proyectos</legend>
              {hijos.proyectos.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={proyectos.has(p.id)}
                    onCheckedChange={() => toggle(proyectos, setProyectos, p.id)}
                  />
                  {p.nombre}
                </label>
              ))}
            </fieldset>
          )}
          {hijos && hijos.trabajos.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold">Servicios técnicos</legend>
              {hijos.trabajos.map((t) => (
                <label key={t.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={trabajos.has(t.id)}
                    onCheckedChange={() => toggle(trabajos, setTrabajos, t.id)}
                  />
                  {t.codigo} · {t.titulo}
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Dejar todo en baja
          </Button>
          <Button disabled={total === 0 || busy} onClick={aplicar}>
            Reactivar {total > 0 ? `(${total})` : "selección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
