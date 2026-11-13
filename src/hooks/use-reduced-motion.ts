import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** true si la persona (o el navegador de pruebas) pidió reducir el movimiento. */
export function useReducedMotion(): boolean {
  const [reducir, setReducir] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(QUERY).matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const al = () => setReducir(mq.matches);
    mq.addEventListener?.("change", al);
    return () => mq.removeEventListener?.("change", al);
  }, []);
  return reducir;
}
