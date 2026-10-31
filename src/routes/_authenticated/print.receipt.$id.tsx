import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { errMsg, fmtDate, fmtDateTime, money } from "@/lib/format";
import { customerRoomCategory } from "@/lib/customer-rooms";

export const Route = createFileRoute("/_authenticated/print/receipt/$id")({
  head: () => ({ meta: [{ title: "Receipt — Front Desk" }, { name: "description", content: "Payment receipt." }, { property: "og:title", content: "Receipt — Front Desk" }, { property: "og:description", content: "Payment receipt." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReceiptPage,
});

type Snap = {
  hotel: { name: string; logo_url: string | null; address: string | null; phone: string | null; email: string | null; gstin: string | null; currency: string; receipt_footer: string | null; show_logo: boolean; show_address: boolean; show_gstin: boolean; show_balance: boolean };
  payment: { receipt_no: string; amount: number; method: string; reference: string | null; note: string | null; received_at: string; kind: string; booking_id: string; received_in?: string | null };
  booking: { booking_no: string; created_at: string; check_in: string; check_out: string; gst_bill?: boolean };
  guest: { name: string; mobile: string };
  room: string;
  totals: { total: number };
  paid_to_date: number;
  balance: number;
};

function ReceiptPage() {
  const { id } = Route.useParams();
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["receipt", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("receipt_revisions").select("*").eq("payment_id", id).order("revision", { ascending: false });
      if (error) throw error;
      const latest = data[0]?.snapshot as unknown as Snap | undefined;
      if (!latest) return { revisions: data, categories: [] as string[] };
      const rooms = await supabase.from("booking_rooms").select("rooms(room_categories(name))").eq("booking_id", latest.payment.booking_id).is("removed_at", null).order("created_at");
      if (rooms.error) throw rooms.error;
      return { revisions: data, categories: (rooms.data ?? []).map(customerRoomCategory) };
    },
  });
  const [open, setOpen] = useState(false);
  const [rev, setRev] = useState<number | null>(null);
  if (!q.data) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const revisions = q.data.revisions;
  const current = (rev ? revisions.find((r) => r.revision === rev) : undefined) ?? revisions[0];
  if (!current) return <div className="p-8">Receipt not found.</div>;
  const s = current.snapshot as unknown as Snap;
  const h = s.hotel;
  const cur = h.currency || "INR";

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-background print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-xl flex-wrap items-center justify-between gap-2 px-4">
        <Button variant="ghost" asChild><Link to="/bookings/$id" params={{ id: s.payment.booking_id }}>← Booking</Link></Button>
        <div className="flex gap-2">
          {me.data?.can("correct") && <Button variant="outline" onClick={() => setOpen(true)}>Correct</Button>}
          <Button onClick={() => window.print()}>Print / Save PDF</Button>
        </div>
      </div>
      {revisions.length > 1 && (
        <div className="no-print mx-auto mb-3 flex max-w-xl flex-wrap gap-2 px-4 text-xs">
          {revisions.map((r) => (
            <button key={r.id} onClick={() => setRev(r.revision)} className={`rounded-full border px-3 py-1 ${current.revision === r.revision ? "bg-primary text-primary-foreground" : "bg-card"}`}>
              Rev {r.revision}{r.revision === 1 ? " (original)" : ""}
            </button>
          ))}
        </div>
      )}
      <div className="mx-auto max-w-xl bg-card p-8 shadow-sm print:shadow-none">
        <div className="flex items-start gap-4 border-b pb-4">
          {h.show_logo && h.logo_url && <img src={h.logo_url} alt="" className="h-14 w-14 object-contain" />}
          <div>
            <div className="font-display text-xl font-semibold">{h.name}</div>
            {h.show_address && h.address && <div className="whitespace-pre-line text-xs text-muted-foreground">{h.address}</div>}
            <div className="text-xs text-muted-foreground">{[h.phone, h.email].filter(Boolean).join(" · ")}</div>
            {h.show_gstin && h.gstin && current.snapshot && (current.snapshot as unknown as Snap).booking.gst_bill !== false && <div className="text-xs text-muted-foreground">GSTIN {h.gstin}</div>}
          </div>
        </div>
        <div className="flex items-end justify-between py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.payment.kind === "refund" ? "Refund receipt" : "Payment receipt"}</div>
            <div className="font-display text-lg font-semibold">{s.payment.receipt_no}{current.revision > 1 ? ` / R${current.revision}` : ""}</div>
          </div>
          <div className="text-right text-sm">{fmtDateTime(s.payment.received_at)}</div>
        </div>
        {current.revision > 1 && <div className="mb-4 rounded-md bg-warning/15 p-2 text-xs">Corrected receipt (revision {current.revision}). Reason: {current.reason}</div>}
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Guest</dt><dd className="text-right">{s.guest.name}</dd>
          <dt className="text-muted-foreground">Mobile</dt><dd className="text-right">{s.guest.mobile}</dd>
          <dt className="text-muted-foreground">Booking</dt><dd className="text-right">{s.booking.booking_no} ({fmtDate(s.booking.created_at.slice(0, 10))})</dd>
          <dt className="text-muted-foreground">Room category</dt><dd className="text-right">{q.data.categories.join(", ") || "Room"}</dd>
          <dt className="text-muted-foreground">Stay</dt><dd className="text-right">{fmtDate(s.booking.check_in)} → {fmtDate(s.booking.check_out)}</dd>
          <dt className="text-muted-foreground">Method</dt><dd className="text-right">{s.payment.method}{s.payment.reference ? ` · ${s.payment.reference}` : ""}{s.payment.received_in ? ` (Received in: ${s.payment.received_in})` : ""}</dd>
          {s.payment.note && (<><dt className="text-muted-foreground">Note</dt><dd className="text-right">{s.payment.note}</dd></>)}
        </dl>
        <div className="my-5 rounded-lg bg-muted p-4 text-center">
          <div className="text-xs uppercase text-muted-foreground">{s.payment.kind === "refund" ? "Amount refunded" : "Amount received"}</div>
          <div className="font-display text-3xl font-semibold">{money(s.payment.amount, cur)}</div>
        </div>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt>Total bill</dt><dd className="text-right">{money(s.totals.total, cur)}</dd>
          <dt>Paid to date</dt><dd className="text-right">{money(s.paid_to_date, cur)}</dd>
          {h.show_balance && (<><dt className="font-semibold">Balance due</dt><dd className="text-right font-semibold">{money(s.balance, cur)}</dd></>)}
        </dl>
        {h.receipt_footer && <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">{h.receipt_footer}</p>}
      </div>
      <CorrectDialog open={open} onClose={() => setOpen(false)} paymentId={id} initial={s.payment} onDone={() => { setRev(null); qc.invalidateQueries({ queryKey: ["receipt", id] }); }} />
    </div>
  );
}

function CorrectDialog({ open, onClose, paymentId, initial, onDone }: { open: boolean; onClose: () => void; paymentId: string; initial: Snap["payment"]; onDone: () => void }) {
  const [method, setMethod] = useState(initial.method);
  const [reference, setReference] = useState(initial.reference ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [reason, setReason] = useState("");
  async function save() {
    const { error } = await supabase.rpc("correct_receipt", { _payment_id: paymentId, _method: method, _reference: reference, _note: note, _reason: reason });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Corrected. The original is kept as revision 1.");
    setReason(""); onDone(); onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Correct receipt</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">To fix a wrong amount, record a refund and a new payment instead.</p>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Payment method</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Reason for correction</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={!reason.trim() || !method.trim()}>Save correction</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
