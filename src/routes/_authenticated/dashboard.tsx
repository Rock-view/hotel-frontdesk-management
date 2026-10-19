import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/use-me";
import { PageHeader, Stat, StatusPill, Empty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { money, todayISO } from "@/lib/format";
import { ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Today — Front Desk" }, { name: "description", content: "Today's arrivals, departures and collections." }, { property: "og:title", content: "Today — Front Desk" }, { property: "og:description", content: "Today's arrivals, departures and collections." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

function Dashboard() {
  const settings = useSettings();
  const me = useMe();
  const today = todayISO();
  const q = useQuery({
    queryKey: ["dashboard", today],
    queryFn: async () => {
      const [rooms, active, pays, br] = await Promise.all([
        supabase.from("rooms").select("id, number, housekeeping, room_categories(name)").eq("active", true).order("number"),
        supabase
          .from("bookings")
          .select("id, booking_no, status, check_in, check_out, room_id, guests(name, mobile), room_number, rooms(number)")
          .in("status", ["reserved", "checked_in"])
          .lte("check_in", today)
          .gte("check_out", today),
        supabase.from("payments").select("amount, kind").gte("received_at", today + "T00:00:00"),
        supabase.from("booking_rooms").select("room_id, bookings!inner(status)").eq("active", true).lte("check_in", today).gt("check_out", today).in("bookings.status", ["reserved", "checked_in"]),
      ]);
      const recent = (await supabase.from("payments").select("id, amount, kind, method, receipt_no, received_at, bookings(guests(name), room_number, rooms(number))").order("received_at", { ascending: false }).limit(6)).data ?? [];
      const ids = (active.data ?? []).map((b) => b.id);
      const totals = ids.length
        ? (await supabase.from("booking_totals").select("*").in("booking_id", ids)).data ?? []
        : [];
      return { recent, rooms: rooms.data ?? [], active: active.data ?? [], pays: pays.data ?? [], totals, bookedRooms: br.data ?? [] };
    },
  });
  const d = q.data;
  const arrivals = d?.active.filter((b) => b.status === "reserved" && b.check_in <= today) ?? [];
  const departures = d?.active.filter((b) => b.status === "checked_in" && b.check_out <= today) ?? [];
  const inHouse = d?.active.filter((b) => b.status === "checked_in") ?? [];
  const occupiedIds = new Set(inHouse.map((b) => b.room_id));
  const occupiedRoomIds = new Set((d?.bookedRooms ?? []).filter((x) => x.bookings?.status === "checked_in").map((x) => x.room_id));
  const reservedRoomIds = new Set((d?.bookedRooms ?? []).filter((x) => x.bookings?.status === "reserved").map((x) => x.room_id));
  const collected = (d?.pays ?? []).reduce((s, p) => s + (p.kind === "payment" ? Number(p.amount) : -Number(p.amount)), 0);
  const outstanding = (d?.totals ?? []).reduce((s, t) => s + Math.max(0, Number(t.total) - Number(t.paid) + Number(t.refunded)), 0);
  const cur = settings.data?.currency ?? "INR";

  return (
    <div>
      {settings.data && !settings.data.setup_complete && me.data?.isOwner && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand p-5 text-primary-foreground">
          <div>
            <div className="font-display text-lg font-semibold">Finish setting up your property</div>
            <div className="text-sm text-primary-foreground/80">Add your hotel details, then create your rooms.</div>
          </div>
          <Button asChild variant="secondary"><Link to="/settings">Open setup</Link></Button>
        </div>
      )}
      <PageHeader title="Today" sub={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In house" value={`${occupiedIds.size} / ${d?.rooms.length ?? 0}`} hint="rooms occupied" />
        <Stat label="Free tonight" value={(d?.rooms ?? []).filter((r) => r.housekeeping !== "maintenance" && !d?.active.some((b) => b.room_id === r.id)).length} hint={`${arrivals.length} arrivals pending`} />
        <Stat label="Collected today" value={money(collected, cur)} />
        <Stat label="Due from in-house" value={money(outstanding, cur)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <List title="Arriving" items={arrivals} empty="No arrivals pending." />
        <List title="Due to check out" items={departures} empty="No departures due." />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent payments</h2>
      {(d?.recent.length ?? 0) === 0 ? <Empty>No payments yet.</Empty> : (
        <div className="divide-y rounded-xl border bg-card">
          {d?.recent.map((p) => (
            <Link key={p.id} to="/print/receipt/$id" params={{ id: p.id }} className="flex justify-between p-4 text-sm hover:bg-muted/50">
              <span>{p.bookings?.guests?.name} · Room {(p.bookings?.rooms?.number ?? p.bookings?.room_number)}<span className="block text-xs text-muted-foreground">{p.receipt_no} · {p.method}</span></span>
              <span className="font-medium">{p.kind === "refund" ? "−" : ""}{money(p.amount, cur)}</span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Room board</h2>
      {d && d.rooms.length === 0 ? (
        <Empty>No rooms yet. <Link to="/rooms" className="font-medium text-primary underline">Add rooms</Link></Empty>
      ) : (
        <div className="space-y-2">
          {Object.entries(
            (d?.rooms ?? []).reduce<Record<string, NonNullable<typeof d>["rooms"]>>((acc, r) => {
              const k = r.room_categories?.name ?? "Uncategorized";
              (acc[k] ??= []).push(r);
              return acc;
            }, {}),
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, rooms]) => {
              const list = [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
              const stOf = (id: string, hk: string) =>
                occupiedRoomIds.has(id) ? "occupied" : reservedRoomIds.has(id) ? "reserved" : hk === "ready" ? "available" : hk;
              const free = list.filter((r) => stOf(r.id, r.housekeeping) === "available").length;
              return (
                <details key={cat} className="group rounded-xl border bg-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                    <span className="font-medium">{cat}</span>
                    <span className="flex items-center gap-3 text-sm">
                      <span><span className="font-semibold text-primary">{free}</span> <span className="text-muted-foreground">free of {list.length}</span></span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="grid grid-cols-3 gap-2 border-t p-3 sm:grid-cols-5 lg:grid-cols-8">
                    {list.map((r) => {
                      const st = stOf(r.id, r.housekeeping);
                      return (
                        <div key={r.id} className="rounded-lg border bg-background p-3 text-center">
                          <div className="font-display text-lg font-semibold">{r.number}</div>
                          <StatusPill status={st} label={{ occupied: "Occupied", reserved: "Reserved", available: "Free", cleaning: "Cleaning", maintenance: "Repair" }[st]} />
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
        </div>
      )}
    </div>
  );
}

type B = { id: string; booking_no: string; status: string; guests: { name: string } | null; rooms: { number: string } | null; room_number?: string | null };
function List({ title, items, empty }: { title: string; items: B[]; empty: string }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {items.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {items.map((b) => (
            <Link key={b.id} to="/bookings/$id" params={{ id: b.id }} className="flex items-center justify-between p-4 hover:bg-muted/50">
              <div>
                <div className="font-medium">{b.guests?.name}</div>
                <div className="text-xs text-muted-foreground">Room {(b.rooms?.number ?? b.room_number)} · {b.booking_no}</div>
              </div>
              <StatusPill status={b.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
