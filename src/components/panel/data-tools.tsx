import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
}) {
  return (
    <select
      className="app-select"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}</option>
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-44 flex-1">
      <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
      <Input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
export function SortHead({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="-ml-3">
      {children}
      <ArrowDownUp className="size-3" />
    </Button>
  );
}
export function usePagination<T>(rows: T[], size = 10) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  return {
    rows: rows.slice((current - 1) * size, current * size),
    footer: (
      <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
        <span>
          {rows.length
            ? `${(current - 1) * size + 1}–${Math.min(current * size, rows.length)}`
            : "0"}{" "}
          de {rows.length} registros
        </span>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Página anterior"
            variant="outline"
            size="icon"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <span>
            {current} / {pages}
          </span>
          <Button
            aria-label="Página siguiente"
            variant="outline"
            size="icon"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    ),
  };
}
export function DataFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </div>
  );
}
export function Loading() {
  return (
    <div className="space-y-4 animate-pulse py-6">
      <div className="h-8 w-64 rounded bg-muted" />
      <div className="h-36 rounded bg-muted" />
      <div className="h-64 rounded bg-muted" />
    </div>
  );
}
