import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold lg:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  reserved: "bg-info/15 text-info",
  checked_in: "bg-success/15 text-success",
  checked_out: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  available: "bg-success/15 text-success",
  occupied: "bg-primary/15 text-primary",
  cleaning: "bg-warning/25 text-warning-foreground",
  maintenance: "bg-destructive/10 text-destructive",
  blocked: "bg-secondary text-secondary-foreground",
};

export function StatusPill({ status, label }: { status: string; label?: string | undefined }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status] ?? "bg-muted")}>
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
