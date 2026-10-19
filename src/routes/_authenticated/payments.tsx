import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/use-me";
import { PageHeader, Stat, Empty } from "@/components/bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDaysISO, fmtDateTime, money, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments — Front Desk" }, { name: "description", content: "Payments and refunds by date." }, { property: "og:title", content: "Payments — Front Desk" }, { property: "og:description", content: "Payments and refunds by date." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Payments,
});

function Payments() {
  const settings = useSettings();
  const cur = settings.data?.currency ?? "INR";
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const q = useQuery({
    queryKey: ["payments", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, bookings(id, booking_no, guests(name), room_number, rooms(number))")
        .gte("received_at", from + "T00:00:00")
        .lt("received_at", addDaysISO(to, 1) + "T00:00:00")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  const byMethod: Record<string, number> = {};
  let net = 0;
  for (const p of rows) {
    const v = p.kind === "refund" ? -Number(p.amount) : Number(p.amount);
    net += v;
    byMethod[p.method] = (byMethod[p.method] ?? 0) + v;
  }

  return (
    <div>
      <PageHeader title="Payments" />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net collected" value={money(net, cur)} hint={`${rows.length} entries`} />
        {Object.entries(byMethod).map(([m, v]) => <Stat key={m} label={m} value={money(v, cur)} />)}
      </div>
      {rows.length === 0 ? <Empty>No payments in this period.</Empty> : (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((p) => (
            <Link key={p.id} to="/print/receipt/$id" params={{ id: p.id }} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.bookings?.guests?.name} <span className="text-sm font-normal text-muted-foreground">· Room {(p.bookings?.rooms?.number ?? p.bookings?.room_number)}</span></div>
                <div className="text-xs text-muted-foreground">{p.receipt_no} · {p.method} · {fmtDateTime(p.received_at)}</div>
              </div>
              <div className={p.kind === "refund" ? "font-semibold text-destructive" : "font-semibold"}>{p.kind === "refund" ? "−" : ""}{money(p.amount, cur)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
