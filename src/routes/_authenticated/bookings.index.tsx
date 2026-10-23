import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusPill, Empty } from "@/components/bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QuotationsList } from "@/components/QuotationsList";

export const Route = createFileRoute("/_authenticated/bookings/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search["tab"] as string) || "bookings",
  }),
  head: () => ({
    meta: [
      { title: "Bookings — Front Desk" },
      { name: "description", content: "Search and manage bookings and quotations." },
      { property: "og:title", content: "Bookings — Front Desk" },
      { property: "og:description", content: "Search and manage bookings and quotations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Bookings,
});

const FILTERS = [
  { k: "active", label: "Active", statuses: ["reserved", "checked_in"] },
  { k: "all", label: "All", statuses: [] as string[] },
  { k: "checked_out", label: "Checked out", statuses: ["checked_out"] },
  { k: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
];

function Bookings() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mainTab, setMainTab] = useState(search.tab === "quotations" ? "quotations" : "bookings");

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("active");

  const q = useQuery({
    queryKey: ["bookings", filter, term],
    queryFn: async () => {
      const t = term.trim().replace(/[%,()]/g, "");
      let guestIds: string[] = [];
      let roomIds: string[] = [];
      if (t) {
        const [g, r] = await Promise.all([
          supabase.from("guests").select("id").or(`name.ilike.%${t}%,mobile.ilike.%${t}%`).limit(200),
          supabase.from("rooms").select("id").ilike("number", t),
        ]);
        guestIds = (g.data ?? []).map((x) => x.id);
        roomIds = (r.data ?? []).map((x) => x.id);
      }
      let query = supabase
        .from("bookings")
        .select("id, booking_no, status, check_in, check_out, guests(name, mobile), room_number, rooms(number)")
        .order("check_in", { ascending: false })
        .limit(100);
      const st = FILTERS.find((f) => f.k === filter)!.statuses;
      if (st.length) query = query.in("status", st);
      if (t) {
        const ors = [`booking_no.ilike.%${t}%`];
        if (guestIds.length) ors.push(`guest_id.in.(${guestIds.join(",")})`);
        if (roomIds.length) ors.push(`room_id.in.(${roomIds.join(",")})`);
        query = query.or(ors.join(","));
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Bookings"
        actions={
          <Button asChild>
            <Link to="/bookings/new">New booking</Link>
          </Button>
        }
      />

      <Tabs value={mainTab} onValueChange={setMainTab} className="mt-2">
        <TabsList className="mb-4">
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              className="h-11 pl-10"
              placeholder="Guest name, mobile, room or booking ID"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm",
                  filter === f.k ? "border-primary bg-primary text-primary-foreground" : "bg-card"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {q.data && q.data.length === 0 ? (
            <Empty>No bookings found.</Empty>
          ) : (
            <div className="divide-y rounded-xl border bg-card">
              {q.data?.map((b) => (
                <Link
                  key={b.id}
                  to="/bookings/$id"
                  params={{ id: b.id }}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {b.guests?.name} <span className="text-muted-foreground">· {b.guests?.mobile}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Room {b.rooms?.number ?? b.room_number} · {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · {b.booking_no}
                    </div>
                  </div>
                  <StatusPill status={b.status} />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quotations">
          <QuotationsList
            onConverted={(bookingId) => {
              navigate({ to: "/bookings/$id", params: { id: bookingId } });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
