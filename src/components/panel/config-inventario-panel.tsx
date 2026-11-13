import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api, type ConfigInventario, type GrupoInventario } from "@/lib/api";
import { useApiMutation, useConfiguracion, useItems } from "@/hooks/use-api";
import { GRUPOS, ROTULO_GRUPO, validarConfigInventario } from "@/lib/config-inventario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "./common";

/** Categorías, prefijos de SKU y parámetros de depreciación del inventario (editables). */
export function ConfigInventarioPanel() {
  const { data: config } = useConfiguracion();
  const { data: items = [] } = useItems();
  const [borrador, setBorrador] = useState<ConfigInventario | null>(null);
  const [nueva, setNueva] = useState<Record<string, { nombre: string; prefijo: string }>>({});
  useEffect(() => {
    if (config) setBorrador(structuredClone(config.inventario));
  }, [config]);
  const guardar = useApiMutation(api.configuracion.actualizarInventario, "Configuración guardada");
  if (!borrador) return null;
  const error = validarConfigInventario(borrador);
  const sucio = JSON.stringify(borrador) !== JSON.stringify(config?.inventario);
  const enUso = (g: GrupoInventario, c: string) =>
    items.some((i) => i.grupo === g && i.categoria === c);
  const quitar = (g: GrupoInventario, c: string) => {
    const b = structuredClone(borrador);
    b.categorias[g] = b.categorias[g].filter((x) => x !== c);
    delete b.prefijos[c];
    setBorrador(b);
  };
  const agregar = (g: GrupoInventario) => {
    const { nombre = "", prefijo = "" } = nueva[g] ?? {};
    if (!nombre.trim()) return;
    const b = structuredClone(borrador);
    b.categorias[g].push(nombre.trim());
    b.prefijos[nombre.trim()] = prefijo.trim().toUpperCase();
    setBorrador(b);
    setNueva({ ...nueva, [g]: { nombre: "", prefijo: "" } });
  };
  return (
    <Panel title="Inventario: categorías y valoración" className="rounded-xl border p-5">
      <p className="mb-4 text-sm text-muted-foreground">
        El prefijo (3 letras) numera los SKU de cada categoría; el grupo no se deduce del SKU. Una
        categoría con ítems no se puede quitar.
      </p>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {GRUPOS.map((g) => (
          <fieldset key={g} className="min-w-0 space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">{ROTULO_GRUPO[g]}</legend>
            {borrador.categorias[g].map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{c}</span>
                <Input
                  aria-label={`Prefijo de ${c}`}
                  className="h-8 w-20 uppercase"
                  maxLength={3}
                  value={borrador.prefijos[c] ?? ""}
                  onChange={(e) =>
                    setBorrador({
                      ...borrador,
                      prefijos: { ...borrador.prefijos, [c]: e.target.value.toUpperCase() },
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title={enUso(g, c) ? "En uso: no se puede quitar" : "Quitar categoría"}
                  disabled={enUso(g, c)}
                  onClick={() => quitar(g, c)}
                >
                  <X />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Input
                aria-label={`Nueva categoría de ${ROTULO_GRUPO[g]}`}
                className="h-8 flex-1"
                placeholder="Nueva categoría"
                value={nueva[g]?.nombre ?? ""}
                onChange={(e) =>
                  setNueva({ ...nueva, [g]: { prefijo: "", ...nueva[g], nombre: e.target.value } })
                }
              />
              <Input
                aria-label={`Prefijo de la nueva categoría de ${ROTULO_GRUPO[g]}`}
                className="h-8 w-20 uppercase"
                maxLength={3}
                placeholder="ABC"
                value={nueva[g]?.prefijo ?? ""}
                onChange={(e) =>
                  setNueva({ ...nueva, [g]: { nombre: "", ...nueva[g], prefijo: e.target.value } })
                }
              />
              <Button type="button" size="icon" variant="outline" onClick={() => agregar(g)}>
                <Plus />
              </Button>
            </div>
          </fieldset>
        ))}
      </div>
      <h4 className="mb-2 mt-6 text-sm font-semibold">Depreciación (valor estimado actual)</h4>
      <p className="mb-3 text-xs text-muted-foreground">
        Lineal: valor × máx(residual, 1 − edad / vida útil). Vida útil vacía = sin depreciación.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {GRUPOS.map((g) => (
          <div key={g} className="space-y-2">
            <Label htmlFor={`vida-${g}`}>Vida útil · {ROTULO_GRUPO[g]}</Label>
            <Input
              id={`vida-${g}`}
              type="number"
              min="1"
              step="1"
              placeholder="Sin depreciar"
              value={borrador.depreciacion.aniosPorGrupo[g] ?? ""}
              onChange={(e) =>
                setBorrador({
                  ...borrador,
                  depreciacion: {
                    ...borrador.depreciacion,
                    aniosPorGrupo: {
                      ...borrador.depreciacion.aniosPorGrupo,
                      [g]: e.target.value === "" ? null : Number(e.target.value),
                    },
                  },
                })
              }
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="residual">Valor residual (%)</Label>
          <Input
            id="residual"
            type="number"
            min="0"
            max="100"
            step="1"
            value={borrador.depreciacion.residualPct}
            onChange={(e) =>
              setBorrador({
                ...borrador,
                depreciacion: { ...borrador.depreciacion, residualPct: Number(e.target.value) },
              })
            }
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <Button
          disabled={!sucio || !!error || guardar.isPending}
          onClick={() => guardar.mutate(borrador)}
        >
          Guardar configuración de inventario
        </Button>
        {sucio && (
          <Button
            variant="outline"
            onClick={() => config && setBorrador(structuredClone(config.inventario))}
          >
            Descartar cambios
          </Button>
        )}
      </div>
    </Panel>
  );
}
