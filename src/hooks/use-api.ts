import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const qk = {
  clientes: ["clientes"] as const,
  usuarios: ["usuarios"] as const,
  proyectos: ["proyectos"] as const,
  items: ["inventario", "items"] as const,
  movimientos: ["inventario", "movimientos"] as const,
  auditoria: ["auditoria"] as const,
  me: ["auth", "me"] as const,
};

export const useClientes = () =>
  useQuery({ queryKey: qk.clientes, queryFn: () => api.clientes.list() });
export const useUsuarios = () =>
  useQuery({ queryKey: qk.usuarios, queryFn: () => api.usuarios.list() });
export const useProyectos = () =>
  useQuery({ queryKey: qk.proyectos, queryFn: () => api.proyectos.list() });
export const useItems = () =>
  useQuery({ queryKey: qk.items, queryFn: () => api.inventario.listItems() });
export const useMovimientos = () =>
  useQuery({ queryKey: qk.movimientos, queryFn: () => api.inventario.listMovimientos() });
export const useAuditoria = () =>
  useQuery({ queryKey: qk.auditoria, queryFn: () => api.auditoria.list() });
export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api.auth.currentUser() });

/** Mutación que invalida todo (los cambios pueden tener cascada y siempre auditan). */
export function useApiMutation<TVars, TRes>(
  fn: (v: TVars) => Promise<TRes>,
  okMsg?: string | ((r: TRes) => string),
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      if (okMsg) toast.success(typeof okMsg === "function" ? okMsg(r) : okMsg);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
