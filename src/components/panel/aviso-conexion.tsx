import { Loader2 } from "lucide-react";
import { useBaseDespertando } from "@/lib/api/http/estado-conexion";

/**
 * Aviso mientras la base de datos del backend se reanuda tras una pausa (hasta ~90 s). Solo aparece
 * cuando el transporte está esperando; en el resto del tiempo no ocupa lugar.
 */
export function AvisoConexion() {
  const despertando = useBaseDespertando();
  if (!despertando) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="aviso-base-despertando"
      className="flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Despertando la base de datos…
    </div>
  );
}
