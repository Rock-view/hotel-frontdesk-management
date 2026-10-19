import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BarChart3, BedDouble, CalendarDays, LayoutDashboard, LogOut, Settings, Users, Wallet, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ActionTooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Today", icon: LayoutDashboard },
  { to: "/bookings", label: "Bookings", icon: CalendarDays },
  { to: "/rooms", label: "Rooms", icon: BedDouble },
  { to: "/payments", label: "Payments", icon: Wallet },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const settings = useSettings();
  const loc = useLocation();
  const navigate = useNavigate();
  const isPrint = loc.pathname.startsWith("/print");

  if (me.isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (me.data && !me.data.isStaff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Your account is not active</h1>
        <p className="text-muted-foreground">Ask the owner to enable your access.</p>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </div>
    );
  }
  if (isPrint) return <>{children}</>;

  const isOwner = me.data?.isOwner;
  const extra = [
    ...(me.data?.can("reports") ? [{ to: "/reports" as const, label: "Reports", icon: BarChart3 }] : []),
    ...(isOwner ? [{ to: "/staff" as const, label: "Staff", icon: Users }] : []),
    { to: "/settings" as const, label: "Settings", icon: Settings },
  ];
  const active = (to: string) => loc.pathname === to || loc.pathname.startsWith(to + "/");

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center gap-3 px-5 py-6">
          {settings.data?.logo_url ? (
            <img src={settings.data.logo_url} alt="" className="h-9 w-9 rounded-md bg-sidebar-accent object-contain" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <BedDouble className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-display font-semibold">{settings.data?.name || "Your property"}</div>
            <div className="text-xs text-sidebar-foreground/60">{isOwner ? "Owner" : "Reception"}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {[...NAV, ...extra].map((n) => (
            <Link key={n.to} to={n.to} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent", active(n.to) && "bg-sidebar-accent text-sidebar-primary")}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="truncate px-3 pb-2 text-xs text-sidebar-foreground/60">{me.data?.profile?.full_name || me.data?.user.email}</div>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="min-w-0 truncate font-display font-semibold">{settings.data?.name || "Front Desk"}</div>
          <div className="flex shrink-0 items-center gap-1">
            {extra.map((n) => (
              <ActionTooltip key={n.to} label={n.label}>
                <Button variant="ghost" size="icon" asChild>
                  <Link to={n.to} aria-label={n.label}><n.icon className="h-5 w-5" /></Link>
                </Button>
              </ActionTooltip>
            ))}
            <ActionTooltip label="Sign out">
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut className="h-5 w-5" /></Button>
            </ActionTooltip>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      <ActionTooltip label="New booking">
        <Link to="/bookings/new" className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg lg:bottom-8 lg:right-8" aria-label="New booking">
          <Plus className="h-6 w-6" />
        </Link>
      </ActionTooltip>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-card lg:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted-foreground", active(n.to) && "text-primary")}>
            <n.icon className="h-5 w-5" /> {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
