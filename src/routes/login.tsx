import { useState } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { ThemeProvider } from "next-themes";
import { api } from "@/lib/api";
import { Logo } from "@/components/panel/common";
import { pageHead } from "@/lib/meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => pageHead("Ingreso", "Acceso al panel de administración interno de IoTing Dev."),
  beforeLoad: async () => {
    if (await api.auth.currentUser()) throw redirect({ to: "/" });
  },
  component: Login,
});
const schema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(4, "Mínimo 4 caracteres"),
});
function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("juan.velasquez@ioting.dev");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden flex-col justify-between bg-gradient-hero p-12 text-sidebar-accent-foreground lg:flex">
          <div>
            <Logo className="h-16 w-16" />
            <p className="mt-6 text-xs uppercase tracking-[0.2em] opacity-80">
              Panel de administración interno
            </p>
          </div>
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight">
              Control total de su operación IoT
            </h1>
            <p className="mt-4 max-w-md text-sm opacity-80">
              Clientes, usuarios, proyectos e inventario de IoTing Dev en una sola consola privada.
            </p>
          </div>
          <p className="text-xs opacity-70">IoTing Dev © 2026 · Agroindustria e Industria 4.0</p>
        </section>
        <main className="flex items-center justify-center bg-gradient-subtle p-6">
          <form
            className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-elegant"
            onSubmit={async (e) => {
              e.preventDefault();
              const p = schema.safeParse({ email, password });
              if (!p.success) {
                setError(p.error.issues[0]?.message ?? "Datos inválidos");
                return;
              }
              setBusy(true);
              setError("");
              try {
                await api.auth.login(email, password);
                await navigate({ to: "/", replace: true });
              } catch (x) {
                setError((x as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="mb-8 lg:hidden">
              <Logo className="h-14 w-14" />
            </div>
            <p className="eyebrow">Acceso</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Iniciar sesión</h2>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">
              Demostración: cualquier contraseña de 4+ caracteres.
            </p>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="mt-6 w-full" disabled={busy}>
              {busy ? "Ingresando…" : "Ingresar al panel"}
            </Button>
          </form>
        </main>
      </div>
    </ThemeProvider>
  );
}
