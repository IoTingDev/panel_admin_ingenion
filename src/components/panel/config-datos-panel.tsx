import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api, API_MODE, type ResumenRespaldo } from "@/lib/api";
import { useApiMutation, useClientes, useConfiguracion } from "@/hooks/use-api";
import { download } from "@/lib/export";
import { fmtFechaHora, isoDia } from "@/lib/format";
import { marcarRespaldo, ultimoRespaldo } from "@/lib/respaldo-estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Panel } from "./common";

const FRASE = "ELIMINAR DEMO";

/** Sectores de clientes: lista configurable; un sector en uso no se puede quitar. */
export function SectoresPanel() {
  const { data: config } = useConfiguracion();
  const { data: clientes = [] } = useClientes();
  const [borrador, setBorrador] = useState<string[] | null>(null);
  const [nuevo, setNuevo] = useState("");
  const guardar = useApiMutation(api.configuracion.actualizarSectores, "Sectores guardados");
  if (!config) return null;
  const lista = borrador ?? config.sectores;
  const sucio = JSON.stringify(lista) !== JSON.stringify(config.sectores);
  const enUso = (s: string) => clientes.some((c) => c.sector === s);
  return (
    <Panel title="Sectores de clientes" className="rounded-xl border p-5">
      <p className="mb-4 text-sm text-muted-foreground">
        Lista para clasificar clientes. Un sector que usa algún cliente no se puede quitar.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {lista.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-sm capitalize"
          >
            {s}
            <button
              type="button"
              aria-label={`Quitar el sector ${s}`}
              title={enUso(s) ? "En uso: no se puede quitar" : "Quitar sector"}
              disabled={enUso(s)}
              className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              onClick={() => setBorrador(lista.filter((x) => x !== s))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Nuevo sector"
          className="h-9 w-56"
          placeholder="Nuevo sector"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const v = nuevo.trim();
            if (v && !lista.includes(v)) setBorrador([...lista, v]);
            setNuevo("");
          }}
        >
          <Plus />
          Añadir
        </Button>
        <Button
          disabled={!sucio || guardar.isPending}
          onClick={async () => {
            await guardar.mutateAsync(lista);
            setBorrador(null);
          }}
        >
          Guardar sectores
        </Button>
      </div>
    </Panel>
  );
}

/** Respaldo completo en JSON y limpieza de datos de demostración. */
export function RespaldoPanel() {
  const qc = useQueryClient();
  const [previa, setPrevia] = useState<{ texto: string; res: ResumenRespaldo } | null>(null);
  const [err, setErr] = useState("");
  const [limpiar, setLimpiar] = useState(false);
  const [frase, setFrase] = useState("");
  const [ultimo, setUltimo] = useState(() => ultimoRespaldo());
  const importar = useApiMutation(api.respaldo.importar, "Respaldo importado");
  const limpiarDemo = useApiMutation(
    api.configuracion.limpiarDemo,
    (r) =>
      `Datos de demostración eliminados: ${r.clientes} clientes, ${r.proyectos} proyectos, ${r.trabajos} servicios técnicos`,
  );
  return (
    <Panel title="Respaldo y datos" className="rounded-xl border p-5">
      {API_MODE === "mock" && (
        <p
          role="note"
          data-testid="aviso-datos-locales"
          className="mb-4 rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm"
        >
          Los datos están guardados <strong>solo en este navegador</strong>. Si borra los datos del
          sitio o cambia de equipo, se pierden: haga un respaldo con frecuencia.
        </p>
      )}
      <p className="mb-4 text-sm text-muted-foreground" data-testid="ultimo-respaldo">
        {ultimo ? `Último respaldo: ${fmtFechaHora(ultimo)}` : "Aún no ha hecho ningún respaldo."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            const r = await api.respaldo.exportar();
            download(
              JSON.stringify(r, null, 2),
              `ioting-respaldo-${isoDia(r.exportadoEn)}.json`,
              "application/json",
            );
            marcarRespaldo();
            setUltimo(ultimoRespaldo());
            toast.success("Respaldo exportado");
          }}
        >
          <Download />
          Exportar respaldo (JSON)
        </Button>
        <Button variant="outline" asChild>
          <label className="cursor-pointer">
            <Upload />
            Importar respaldo
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Archivo de respaldo"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  setErr("");
                  const texto = await file.text();
                  setPrevia({ texto, res: await api.respaldo.previsualizar(texto) });
                } catch (x) {
                  setErr((x as Error).message);
                  setPrevia(null);
                  toast.error((x as Error).message);
                }
              }}
            />
          </label>
        </Button>
        <Button variant="outline" onClick={() => setLimpiar(true)}>
          <Trash2 />
          Limpiar datos de demostración
        </Button>
      </div>
      {err && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {err}
        </p>
      )}

      <Dialog open={!!previa} onOpenChange={(o) => !o && setPrevia(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar respaldo</DialogTitle>
            <DialogDescription>
              Respaldo del {previa ? fmtFechaHora(previa.res.exportadoEn) : ""}. Reemplaza{" "}
              <strong>todos</strong> los datos actuales por los del archivo.
            </DialogDescription>
          </DialogHeader>
          <table className="data-table" data-testid="previa-respaldo">
            <thead>
              <tr>
                <th>Entidad</th>
                <th>Hoy</th>
                <th>En el respaldo</th>
              </tr>
            </thead>
            <tbody>
              {previa?.res.entidades.map((e) => (
                <tr key={e.nombre}>
                  <td>{e.nombre}</td>
                  <td>{e.actual}</td>
                  <td>{e.enRespaldo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPrevia(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={importar.isPending}
              onClick={async () => {
                if (!previa) return;
                await importar.mutateAsync(previa.texto);
                await qc.invalidateQueries();
                setPrevia(null);
              }}
            >
              Reemplazar todos los datos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={limpiar}
        onOpenChange={(o) => {
          if (!o) {
            setLimpiar(false);
            setFrase("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpiar datos de demostración</DialogTitle>
            <DialogDescription>
              Elimina solo los clientes, usuarios, proyectos I+D+I, servicios técnicos y movimientos
              marcados como demostración. Nunca borra lo que usted creó. No se puede deshacer: haga
              un respaldo antes.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="frase-demo">
            Escriba <strong>{FRASE}</strong> para confirmar
          </Label>
          <Input
            id="frase-demo"
            autoComplete="off"
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLimpiar(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={frase !== FRASE || limpiarDemo.isPending}
              onClick={async () => {
                await limpiarDemo.mutateAsync(frase);
                setLimpiar(false);
                setFrase("");
              }}
            >
              Eliminar datos de demostración
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
