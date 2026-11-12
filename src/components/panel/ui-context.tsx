import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface MovimientoPreset {
  sku?: string;
  proyecto?: string;
  tipo?: "Entrada" | "Salida";
}

interface UiCtx {
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  movimiento: MovimientoPreset | null;
  openMovimiento: (p?: MovimientoPreset) => void;
  closeMovimiento: () => void;
  density: "comoda" | "compacta";
  setDensity: (d: "comoda" | "compacta") => void;
}

const Ctx = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [movimiento, setMov] = useState<MovimientoPreset | null>(null);
  const [density, setDensityState] = useState<"comoda" | "compacta">("comoda");
  useEffect(() => {
    if (window.localStorage.getItem("ioting.density") === "compacta") setDensityState("compacta");
  }, []);
  const value = useMemo<UiCtx>(
    () => ({
      paletteOpen,
      setPaletteOpen,
      movimiento,
      openMovimiento: (p) => setMov(p ?? {}),
      closeMovimiento: () => setMov(null),
      density,
      setDensity: (d) => {
        window.localStorage.setItem("ioting.density", d);
        setDensityState(d);
      },
    }),
    [paletteOpen, movimiento, density],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi(): UiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUi fuera de UiProvider");
  return c;
}
