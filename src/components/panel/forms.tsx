import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, type Cliente, type Proyecto } from "@/lib/api";
import { useApiMutation, useClientes } from "@/hooks/use-api";
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
const proyectoSchema = z
  .object({
    nombre: z.string().min(3, "Mínimo 3 caracteres"),
    clienteId: z.string().min(1, "Seleccione cliente"),
    descripcion: z.string(),
    estado: z.enum(["borrador", "activo", "pausado", "finalizado", "baja"]),
    fechaInicio: z.string(),
    fechaFin: z.string(),
    responsable: z.string(),
    etiquetas: z.string(),
  })
  .refine((d) => !d.fechaInicio || !d.fechaFin || d.fechaFin >= d.fechaInicio, {
    message: "La fecha final debe ser posterior al inicio",
    path: ["fechaFin"],
  });
type ProyectoForm = z.infer<typeof proyectoSchema>;
export function ProyectoSheet({
  open,
  onClose,
  proyecto,
  clienteId = "",
}: {
  open: boolean;
  onClose: () => void;
  proyecto?: Proyecto | undefined;
  clienteId?: string;
}) {
  const { data: clientes = [] } = useClientes();
  const form = useForm<ProyectoForm>({ resolver: zodResolver(proyectoSchema) });
  useEffect(() => {
    form.reset({
      nombre: proyecto?.nombre ?? "",
      clienteId: proyecto?.clienteId ?? clienteId,
      descripcion: proyecto?.descripcion ?? "",
      estado: proyecto?.estado ?? "borrador",
      fechaInicio: proyecto?.fechaInicio?.slice(0, 10) ?? "",
      fechaFin: proyecto?.fechaFin?.slice(0, 10) ?? "",
      responsable: proyecto?.responsable ?? "",
      etiquetas: proyecto?.etiquetas?.join(", ") ?? "",
    });
  }, [open, proyecto, clienteId, form]);
  const mutation = useApiMutation((v: ProyectoForm) => {
    const data = {
      ...v,
      fechaInicio: v.fechaInicio ? `${v.fechaInicio}T12:00:00-05:00` : undefined,
      fechaFin: v.fechaFin ? `${v.fechaFin}T12:00:00-05:00` : undefined,
      etiquetas: v.etiquetas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    return proyecto ? api.proyectos.update(proyecto.id, data) : api.proyectos.create(data);
  }, "Proyecto guardado");
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{proyecto ? "Editar proyecto" : "Nuevo proyecto"}</SheetTitle>
          <SheetDescription>Información y alcance de la solución IoT.</SheetDescription>
        </SheetHeader>
        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            await mutation.mutateAsync(v);
            onClose();
          })}
        >
          <Label htmlFor="p-nombre">Nombre</Label>
          <Input id="p-nombre" {...form.register("nombre")} />
          <Label htmlFor="p-cliente">Cliente</Label>
          <select id="p-cliente" className="app-select w-full" {...form.register("clienteId")}>
            <option value="">Seleccione cliente</option>
            {clientes
              .filter((c) => c.estado === "activo")
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.razonSocial}
                </option>
              ))}
          </select>
          <Label htmlFor="p-desc">Descripción</Label>
          <Textarea id="p-desc" {...form.register("descripcion")} />
          <div className="grid grid-cols-2 gap-3">
            {(["fechaInicio", "fechaFin"] as const).map((k) => (
              <div key={k} className="space-y-2">
                <Label htmlFor={k}>
                  {k === "fechaInicio" ? "Fecha de inicio" : "Fecha de fin"}
                </Label>
                <Input id={k} type="date" {...form.register(k)} />
              </div>
            ))}
          </div>
          <Label htmlFor="p-estado">Estado</Label>
          <select id="p-estado" className="app-select w-full" {...form.register("estado")}>
            {["borrador", "activo", "pausado", "finalizado"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Label htmlFor="p-resp">Responsable</Label>
          <Input id="p-resp" {...form.register("responsable")} />
          <Label htmlFor="p-tags">Etiquetas (separadas por coma)</Label>
          <Input id="p-tags" {...form.register("etiquetas")} />
          {Object.entries(form.formState.errors).map(([k, e]) => (
            <p className="text-xs text-destructive" key={k}>
              {e.message}
            </p>
          ))}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={mutation.isPending}>Guardar proyecto</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
