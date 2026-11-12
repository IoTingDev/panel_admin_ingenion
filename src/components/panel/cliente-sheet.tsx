import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Cliente } from "@/lib/api";
import { useApiMutation } from "@/hooks/use-api";
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
  const form = useForm<ClienteForm>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      razonSocial: "",
      nit: "",
      sector: "cacao",
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
      sector: cliente?.sector ?? "cacao",
      ciudad: cliente?.ciudad ?? "",
      contactoNombre: cliente?.contactoNombre ?? "",
      contactoEmail: cliente?.contactoEmail ?? "",
      contactoTelefono: cliente?.contactoTelefono ?? "",
      notas: cliente?.notas ?? "",
    });
  }, [open, cliente, form]);
  const mutation = useApiMutation(
    (v: ClienteForm) => (cliente ? api.clientes.update(cliente.id, v) : api.clientes.create(v)),
    "Cliente guardado",
  );
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
              {["cacao", "café", "mango", "otro"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
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
