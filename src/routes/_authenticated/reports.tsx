import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { parseISO, differenceInCalendarDays, max as dmax, min as dmin, addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/use-me";
import { PageHeader, Stat, Empty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDaysISO, fmtDate, money, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Front Desk" }, { name: "description", content: "Revenue, occupancy and outstanding dues." }, { property: "og:title", content: "Reports — Front Desk" }, { property: "og:description", content: "Revenue, occupancy and outstanding dues." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Reports,
});

function csv(name: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const me = useMe();
  const settings = useSettings();
  const cur = settings.data?.currency ?? "INR";
  const [from, setFrom] = useState(addDaysISO(todayISO(), -29));
  const [to, setTo] = useState(todayISO());
  const q = useQuery({
    queryKey: ["reports", from, to],
    enabled: !!me.data?.can("reports"),
    queryFn: async () => {
      const toEx = addDaysISO(to, 1);
      const [pays, stays, rooms, open] = await Promise.all([
        supabase.from("payments").select("receipt_no, kind, amount, method, received_in, received_at, bookings(booking_no, guests(name), room_number, rooms(number))")
          .gte("received_at", from + "T00:00:00").lt("received_at", toEx + "T00:00:00").order("received_at"),
        supabase.from("bookings").select("id, check_in, check_out, status, created_at").lt("check_in", toEx).gt("check_out", from),
        supabase.from("rooms").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("bookings").select("id, booking_no, status, check_out, guests(name, mobile), room_number, rooms(number)").neq("status", "cancelled"),
      ]);
      const ids = (open.data ?? []).map((b) => b.id);
      const totals = ids.length ? (await supabase.from("booking_totals").select("*").in("booking_id", ids)).data ?? [] : [];
      const tmap = new Map(totals.map((t) => [t.booking_id, t]));
      const dues = (open.data ?? [])
        .map((b) => { const t = tmap.get(b.id); return { ...b, due: t ? Number(t.total) - Number(t.paid) + Number(t.refunded) : 0, total: Number(t?.total ?? 0) }; })
        .filter((b) => b.due > 0.009)
        .sort((a, b) => b.due - a.due);
      const all = stays.data ?? [];
      const live = all.filter((s) => s.status !== "cancelled");
      const lids = live.map((s) => s.id);
      const lt = lids.length ? (await supabase.from("booking_totals").select("total").in("booking_id", lids)).data ?? [] : [];
      const billed = lt.reduce((s, t) => s + Number(t.total), 0);
      return { billed, bookingCount: live.length, cancelled: all.length - live.length, pays: pays.data ?? [], stays: live, roomCount: rooms.count ?? 0, dues };
    },
  });

  if (me.data && !me.data.can("reports")) return <Empty>You don't have access to reports.</Empty>;
  const d = q.data;
  const days = Math.max(1, differenceInCalendarDays(parseISO(to), parseISO(from)) + 1);
  const rangeStart = parseISO(from);
  const rangeEnd = addDays(parseISO(to), 1);
  let roomNights = 0;
  for (const s of d?.stays ?? []) {
    roomNights += Math.max(0, differenceInCalendarDays(dmin([parseISO(s.check_out), rangeEnd]), dmax([parseISO(s.check_in), rangeStart])));
  }
  const occupancy = d && d.roomCount ? (roomNights / (d.roomCount * days)) * 100 : 0;

  const byDay = new Map<string, number>();
  const byMethod = new Map<string, number>();
  let net = 0, refunds = 0;
  for (const p of d?.pays ?? []) {
    const v = p.kind === "refund" ? -Number(p.amount) : Number(p.amount);
    if (p.kind === "refund") refunds += Number(p.amount);
    net += v;
    const day = p.received_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + v);
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + v);
  }
  const dayList: { day: string; v: number }[] = [];
  for (let i = 0; i < Math.min(days, 92); i++) {
    const day = format(addDays(rangeStart, i), "yyyy-MM-dd");
    dayList.push({ day, v: byDay.get(day) ?? 0 });
  }
  const peak = Math.max(1, ...dayList.map((x) => x.v));
  const totalDue = (d?.dues ?? []).reduce((s, b) => s + b.due, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" actions={
        <>
          <Button variant="outline" onClick={() => csv(`payments_${from}_${to}.csv`, [["Receipt", "Date", "Type", "Method", "Received In", "Amount", "Booking", "Guest", "Room"],
            ...(d?.pays ?? []).map((p: any) => [p.receipt_no, p.received_at, p.kind, p.method, p.received_in || "—", p.kind === "refund" ? -Number(p.amount) : Number(p.amount), p.bookings?.booking_no ?? "", p.bookings?.guests?.name ?? "", (p.bookings?.rooms?.number ?? p.bookings?.room_number) ?? ""])])}>
            <Download className="mr-1 h-4 w-4" />Payments CSV
          </Button>
          <Button variant="outline" onClick={() => csv(`dues_${todayISO()}.csv`, [["Booking", "Guest", "Mobile", "Room", "Status", "Check-out", "Total", "Due"],
            ...(d?.dues ?? []).map((b) => [b.booking_no, b.guests?.name ?? "", b.guests?.mobile ?? "", b.rooms?.number ?? b.room_number ?? "", b.status, b.check_out, b.total, b.due.toFixed(2)])])}>
            <Download className="mr-1 h-4 w-4" />Dues CSV
          </Button>
        </>
      } />
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net collected" value={money(net, cur)} hint={`${d?.pays.length ?? 0} entries`} />
        <Stat label="Refunds" value={money(refunds, cur)} />
        <Stat label="Occupancy" value={`${occupancy.toFixed(0)}%`} hint={`${roomNights} room-nights of ${(d?.roomCount ?? 0) * days}`} />
        <Stat label="Outstanding dues" value={money(totalDue, cur)} hint={`${d?.dues.length ?? 0} bookings`} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Billed for stays in range" value={money(d?.billed ?? 0, cur)} hint="invoiced amount, not cash" />
        <Stat label="Bookings" value={d?.bookingCount ?? 0} />
        <Stat label="Cancellations" value={d?.cancelled ?? 0} />
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 font-semibold">Daily collections</h2>
        <div className="flex h-40 items-end gap-0.5">
          {dayList.map((x) => (
            <div key={x.day} title={`${fmtDate(x.day)}: ${money(x.v, cur)}`} className="flex-1 rounded-t bg-primary/80" style={{ height: `${Math.max(0, x.v / peak) * 100}%`, minHeight: x.v > 0 ? 2 : 0 }} />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{fmtDate(from)}</span><span>{fmtDate(to)}</span></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card">
          <h2 className="border-b p-4 font-semibold">By payment method</h2>
          {byMethod.size === 0 ? <p className="p-4 text-sm text-muted-foreground">No payments.</p> : (
            <div className="divide-y">{[...byMethod].map(([m, v]) => <div key={m} className="flex justify-between p-4 text-sm"><span>{m}</span><span className="font-medium">{money(v, cur)}</span></div>)}</div>
          )}
        </section>
        <section className="rounded-xl border bg-card">
          <h2 className="border-b p-4 font-semibold">Outstanding dues</h2>
          {(d?.dues.length ?? 0) === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing outstanding.</p> : (
            <div className="max-h-96 divide-y overflow-auto">
              {d?.dues.map((b) => (
                <Link key={b.id} to="/bookings/$id" params={{ id: b.id }} className="flex justify-between p-4 text-sm hover:bg-muted/50">
                  <span>{b.guests?.name} · Room {(b.rooms?.number ?? b.room_number)}<span className="block text-xs text-muted-foreground">{b.booking_no} · {b.status.replace("_", " ")}</span></span>
                  <span className="font-medium text-destructive">{money(b.due, cur)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
