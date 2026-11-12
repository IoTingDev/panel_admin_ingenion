import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import logo from "@/assets/ioting-logo.png.asset.json";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-logo-surface p-1 shadow-soft", className)}>
      <img src={logo.url} alt="IoTing Dev" className="h-full w-full object-contain" />
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: ReactNode; subtitle?: string | undefined; actions?: ReactNode | undefined }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between animate-fade-in">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const iconBox = cva("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-soft", {
  variants: {
    tone: {
      primary: "bg-gradient-primary",
      success: "bg-gradient-success",
      warning: "bg-gradient-warning",
      info: "bg-gradient-info",
      destructive: "bg-gradient-destructive",
    },
  },
  defaultVariants: { tone: "primary" },
});
export type Tone = "primary" | "success" | "warning" | "info" | "destructive";

export function StatCard({ label, value, icon: Icon, tone = "primary", hint }: { label: string; value: ReactNode; icon: LucideIcon; tone?: Tone; hint?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-gradient-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elegant">
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={iconBox({ tone })}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

const dotTone = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      success: "border-success/25 bg-success/10 text-success",
      info: "border-info/30 bg-info/10 text-primary",
      warning: "border-warning/30 bg-warning/15 text-warning-foreground dark:text-warning",
      destructive: "border-destructive/25 bg-destructive/10 text-destructive",
      muted: "border-border bg-muted text-muted-foreground",
    },
  },
});
const dotBg = { success: "bg-success", info: "bg-info", warning: "bg-warning", destructive: "bg-destructive", muted: "bg-muted-foreground" } as const;

const ESTADO_TONE: Record<string, keyof typeof dotBg> = {
  disponible: "success", activo: "success", finalizado: "info",
  "en uso": "info",
  "en reparación": "warning", suspendido: "warning", pausado: "warning",
  dañado: "destructive", baja: "destructive",
  borrador: "muted",
};

export function StatusBadge({ estado }: { estado: string }) {
  const tone = ESTADO_TONE[estado.toLowerCase()] ?? "muted";
  return (
    <span className={dotTone({ tone })}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotBg[tone])} />
      {estado.charAt(0).toUpperCase() + estado.slice(1)}
    </span>
  );
}

export function LowPill() {
  return <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-destructive-foreground">Bajo</span>;
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-info/30 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" /> Datos de demostración
    </span>
  );
}

export function IconBox({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
      <Icon className="h-4 w-4" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string | undefined; action?: ReactNode | undefined }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary"><Icon className="h-5 w-5" /></div>
      <p className="font-display font-semibold text-foreground">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}

export function Panel({ title, children, className, actions }: { title?: string | undefined; children: ReactNode; className?: string | undefined; actions?: ReactNode | undefined }) {
  return (
    <section className={cn("border-t bg-card/40 py-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h3 className="text-base font-semibold text-foreground">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
