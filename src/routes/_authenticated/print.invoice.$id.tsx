import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { billTitle } from "@/lib/booking";
import { customerRoomCategory } from "@/lib/customer-rooms";

export const Route = createFileRoute("/_authenticated/print/invoice/$id")({
  head: () => ({ meta: [{ title: "Bill — Front Desk" }, { name: "description", content: "GST bill or booking receipt for a stay." }, { property: "og:title", content: "Bill — Front Desk" }, { property: "og:description", content: "GST bill or booking receipt for a stay." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: InvoicePage,
});

function InvoicePage() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const q = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [b, t, c, p, r] = await Promise.all([
        supabase.from("bookings").select("*, guests(*)").eq("id", id).single(),
        supabase.from("booking_totals").select("*").eq("booking_id", id).single(),
        supabase.from("booking_charges").select("*").eq("booking_id", id).order("created_at"),
        supabase.from("payments").select("*").eq("booking_id", id).order("received_at"),
        supabase.from("booking_rooms").select("*, rooms(room_categories(name, description))").eq("booking_id", id).is("removed_at", null).order("created_at"),
      ]);
      if (b.error) throw b.error;
      return { b: b.data, t: t.data!, charges: c.data ?? [], payments: p.data ?? [], rooms: r.data ?? [] };
    },
  });
  const h = settings.data;
  if (!q.data || !h) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const { b, t, charges, payments, rooms } = q.data;
  const cur = h.currency || "INR";
  const balance = Number(t.total) - Number(t.paid) + Number(t.refunded);
  const gst = b.gst_bill;

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-background print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-2xl justify-between px-4">
        <Button variant="ghost" asChild><Link to="/bookings/$id" params={{ id }}>← Booking</Link></Button>
        <Button onClick={() => window.print()}>Print / Save PDF</Button>
      </div>
      <div className="mx-auto max-w-2xl bg-card p-8 shadow-sm print:shadow-none">
        <div className="flex items-start justify-between border-b pb-4">
          <div className="flex gap-4">
            {h.show_logo && h.logo_url && <img src={h.logo_url} alt="" className="h-14 w-14 object-contain" />}
            <div>
              <div className="font-display text-xl font-semibold">{h.name}</div>
              {h.show_address && h.address && <div className="whitespace-pre-line text-xs text-muted-foreground">{h.address}</div>}
              <div className="text-xs text-muted-foreground">{[h.phone, h.email].filter(Boolean).join(" · ")}</div>
              {gst && h.gstin && <div className="text-xs text-muted-foreground">GSTIN {h.gstin}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{billTitle(gst)}</div>
            <div className="font-display font-semibold">{b.invoice_no ?? b.booking_no}</div>
            <div className="text-xs text-muted-foreground">{fmtDateTime(b.invoice_issued_at ?? new Date().toISOString())}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 py-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Billed to</div><div className="font-medium">{b.guests?.name}</div><div>{b.guests?.mobile}</div></div>
          <div className="text-right"><div className="text-xs text-muted-foreground">Stay</div><div>{b.booking_no}</div><div>{fmtDate(b.check_in)} → {fmtDate(b.check_out)}</div></div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2">Description</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {rooms.map((r) => (
               <tr key={r.id} className="border-b">
                 <td className="py-2">
                   <div>{customerRoomCategory(r)} ({t.nights} night{t.nights === 1 ? "" : "s"} × {money(r.rate, cur)})</div>
                   {r.rooms?.room_categories?.description && (
                     <div className="text-xs text-muted-foreground">{r.rooms.room_categories.description}</div>
                   )}
                 </td>
                 <td className="py-2 text-right">{money(Number(r.rate) * Number(t.nights), cur)}</td>
               </tr>
            ))}
            {charges.map((c) => <tr key={c.id} className="border-b"><td className="py-2">{c.description}</td><td className="py-2 text-right">{money(c.amount, cur)}</td></tr>)}
            {Number(b.discount) > 0 && <tr className="border-b"><td className="py-2">Discount</td><td className="py-2 text-right">− {money(b.discount, cur)}</td></tr>}
            {gst && <tr className="border-b"><td className="py-2">{h.tax_label} @ {b.tax_rate}%</td><td className="py-2 text-right">{money(t.tax_amount, cur)}</td></tr>}
            <tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right">{money(t.total, cur)}</td></tr>
          </tbody>
        </table>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Payments</h3>
        <table className="w-full text-sm">
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b"><td className="py-1.5">{p.receipt_no} · {p.method} · {fmtDate(p.received_at.slice(0, 10))}</td><td className="py-1.5 text-right">{p.kind === "refund" ? "− " : ""}{money(p.amount, cur)}</td></tr>
            ))}
            <tr className="font-semibold"><td className="py-2">{balance > 0 ? "Balance pending" : "Paid in full"}</td><td className="py-2 text-right">{money(Math.max(0, balance), cur)}</td></tr>
          </tbody>
        </table>
        {h.terms && <p className="mt-6 whitespace-pre-line text-xs text-muted-foreground">{h.terms}</p>}
        {h.receipt_footer && <p className="mt-4 border-t pt-4 text-center text-xs text-muted-foreground">{h.receipt_footer}</p>}
      </div>
    </div>
  );
}
