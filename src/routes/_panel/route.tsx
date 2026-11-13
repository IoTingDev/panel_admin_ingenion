import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { api } from "@/lib/api";
import { AppShell } from "@/components/panel/shell";
import { UiProvider } from "@/components/panel/ui-context";

export const Route = createFileRoute("/_panel")({
  ssr: false,
  beforeLoad: async () => {
    if (!(await api.auth.currentUser())) throw redirect({ to: "/login" });
  },
  component: () => (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <UiProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </UiProvider>
    </ThemeProvider>
  ),
});
