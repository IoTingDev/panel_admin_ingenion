import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Cliente } from "@/lib/api";
import { useApiMutation, useConfiguracion } from "@/hooks/use-api";
import {
  ROTULO_VINCULO,
  SECTOR_AGROINDUSTRIAL,
  TIPOS_CLIENTE,
  VINCULOS_CLIENTE,
} from "@/lib/dominio";
import { capitalizar } from "@/lib/format";
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

const clienteSchema = z.object({
  razonSocial: z.string().min(3, "Mínimo 3 caracteres"),
  nit: z.string(),
  sector: z.string().min(1),
  tipoCliente: z.enum(["empresa", "persona"]),
  vinculo: z.enum(["", "recurrente", "puntual"]),
  direccion: z.string(),
  ciudad: z.string(),
  contactoNombre: z.string(),
  contactoEmail: z.string().email("Correo inválido").or(z.literal("")),
  contactoTelefono: z.string(),
  notas: z.string(),
});
type ClienteForm = z.infer<typeof clienteSchema>;
export function ClienteSheet({
  open,
  onClose,
  cliente,
}: {
  open: boolean;
  onClose: () => void;
  cliente?: Cliente | undefined;
}) {
  const { data: config } = useConfiguracion();
  const form = useForm<ClienteForm>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      razonSocial: "",
      nit: "",
      sector: SECTOR_AGROINDUSTRIAL,
      tipoCliente: "empresa",
      vinculo: "",
      direccion: "",
      ciudad: "",
      contactoNombre: "",
      contactoEmail: "",
      contactoTelefono: "",
      notas: "",
    },
  });
  useEffect(() => {
    form.reset({
      razonSocial: cliente?.razonSocial ?? "",
      nit: cliente?.nit ?? "",
      sector: cliente?.sector ?? SECTOR_AGROINDUSTRIAL,
      tipoCliente: cliente?.tipoCliente ?? "empresa",
      vinculo: cliente?.vinculo ?? "",
      direccion: cliente?.direccion ?? "",
      ciudad: cliente?.ciudad ?? "",
      contactoNombre: cliente?.contactoNombre ?? "",
      contactoEmail: cliente?.contactoEmail ?? "",
      contactoTelefono: cliente?.contactoTelefono ?? "",
      notas: cliente?.notas ?? "",
    });
  }, [open, cliente, form]);
  const mutation = useApiMutation(({ vinculo, ...v }: ClienteForm) => {
    const datos = { ...v, ...(vinculo ? { vinculo } : {}) };
    return cliente ? api.clientes.update(cliente.id, datos) : api.clientes.create(datos);
  }, "Cliente guardado");
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{cliente ? "Editar cliente" : "Nuevo cliente"}</SheetTitle>
          <SheetDescription>Datos de la empresa y contacto principal.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            await mutation.mutateAsync(v);
            onClose();
          })}
        >
          {(
            [
              "razonSocial",
              "nit",
              "ciudad",
              "contactoNombre",
              "contactoEmail",
              "contactoTelefono",
            ] as const
          ).map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>
                {
                  {
                    razonSocial: "Razón social",
                    nit: "NIT",
                    ciudad: "Ciudad",
                    contactoNombre: "Nombre de contacto",
                    contactoEmail: "Correo de contacto",
                    contactoTelefono: "Teléfono",
                  }[key]
                }
              </Label>
              <Input id={key} {...form.register(key)} />
              {form.formState.errors[key] && (
                <p className="text-xs text-destructive">{form.formState.errors[key]?.message}</p>
              )}
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="sector">Sector</Label>
            <select id="sector" className="app-select w-full" {...form.register("sector")}>
              {(config?.sectores ?? [SECTOR_AGROINDUSTRIAL]).map((s) => (
                <option key={s} value={s}>
                  {capitalizar(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipoCliente">Tipo de cliente</Label>
            <select
              id="tipoCliente"
              className="app-select w-full"
              {...form.register("tipoCliente")}
            >
              {TIPOS_CLIENTE.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vinculo">Vínculo</Label>
            <select id="vinculo" className="app-select w-full" {...form.register("vinculo")}>
              {!cliente?.vinculo && <option value="">Sin clasificar</option>}
              {VINCULOS_CLIENTE.map((v) => (
                <option key={v} value={v}>
                  {ROTULO_VINCULO[v]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Puntual: un trabajo y ya; no es baja ni suspensión, y conserva todo su historial.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="direccion">Dirección</Label>
            <Input id="direccion" {...form.register("direccion")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" {...form.register("notas")} />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={mutation.isPending}>Guardar cliente</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
