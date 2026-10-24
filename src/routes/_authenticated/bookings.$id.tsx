import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, MessageCircle, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/use-me";
import { PageHeader, StatusPill } from "@/components/bits";
import { GuestDocs } from "@/components/GuestDocs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/AmountInput";
import { ActionTooltip } from "@/components/ActionTooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg, fmtDate, fmtDateTime, money, STATUS_LABEL, waNumber } from "@/lib/format";
import { billTitle, EXTRA_UNITS, suggestedQty } from "@/lib/booking";
import { customerRoomCategory } from "@/lib/customer-rooms";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { downloadPdfFromElement, openWhatsAppChat } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/bookings/$id")({
  head: () => ({ meta: [{ title: "Booking — Front Desk" }, { name: "description", content: "Booking details, extras, bill and check-in." }, { property: "og:title", content: "Booking — Front Desk" }, { property: "og:description", content: "Booking details, extras, bill and check-in." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BookingDetail,
});

function BookingDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const me = useMe();
  const settings = useSettings();
  const cur = settings.data?.currency ?? "INR";
  const q = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const [b, t, c, p, h, br, ex] = await Promise.all([
        supabase.from("bookings").select("*, guests(*)").eq("id", id).single(),
        supabase.from("booking_totals").select("*").eq("booking_id", id).single(),
        supabase.from("booking_charges").select("*").eq("booking_id", id).order("created_at"),
        supabase.from("payments").select("*").eq("booking_id", id).order("received_at"),
        supabase.from("booking_status_history").select("*").eq("booking_id", id).order("changed_at"),
        supabase.from("booking_rooms").select("*, rooms(number, max_guests, room_categories(name, description))").eq("booking_id", id).order("created_at"),
        supabase.from("extras").select("*").eq("active", true).order("sort").order("name"),
      ]);
      if (b.error) throw b.error;
      const past = (await supabase.from("bookings").select("id, booking_no, check_in, check_out, status, room_number, rooms(number)").eq("guest_id", b.data.guest_id).neq("id", id).order("check_in", { ascending: false }).limit(20)).data ?? [];
      return { past, b: b.data, t: t.data, charges: c.data ?? [], payments: p.data ?? [], history: h.data ?? [], bookingRooms: br.data ?? [], extras: ex.data ?? [] };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["booking", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
  };

  const [modifyOpen, setModifyOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<null | "payment" | "refund">(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<null | "checked_in" | "checked_out">(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const invoicePdfRef = useRef<HTMLDivElement>(null);

  if (!q.data) return <div className="text-muted-foreground">Loading…</div>;
  const { b, t, charges, payments, history, bookingRooms, extras } = q.data;
  const balance = t ? Number(t.total) - Number(t.paid) + Number(t.refunded) : 0;
  const guest = b.guests;
  const activeRooms = bookingRooms.filter((r) => !r.removed_at);
  const roomLabel = activeRooms.map((r) => (r.rooms?.number ?? r.room_number)).join(", ");
  const isActive = b.status === "reserved" || b.status === "checked_in";
  const canOverride = !!me.data?.can("checkout_with_balance");
  const checkInTime = settings.data?.check_in_time || "12:00";
  const checkInOpen = Date.now() >= new Date(`${b.check_in}T${checkInTime}`).getTime();

  function shareBill() {
    const s = settings.data;
    const lines = [
      s?.name ?? "",
      `${billTitle(b.gst_bill)} · ${b.booking_no}`,
      `Guest: ${guest?.name}`,
      `Room categories: ${activeRooms.map(customerRoomCategory).join(", ")}`,
      `${fmtDate(b.check_in)} to ${fmtDate(b.check_out)} (${t?.nights} night${t?.nights === 1 ? "" : "s"})`,
      "",
      ...activeRooms.flatMap((r) => {
        const cat = customerRoomCategory(r);
        const rateLine = `${cat}: ${money(Number(r.rate) * Number(t?.nights ?? 0), cur)}`;
        const desc = r.rooms?.room_categories?.description?.trim();
        return desc ? [rateLine, `  ${desc}`] : [rateLine];
      }),
      ...charges.map((c) => `${c.description}: ${money(c.amount, cur)}`),
      Number(b.discount) > 0 ? `Discount: − ${money(b.discount, cur)}` : "",
      b.gst_bill ? `${s?.tax_label ?? "GST"} @ ${b.tax_rate}%: ${money(t?.tax_amount, cur)}` : "",
      b.gst_bill && s?.gstin ? `GSTIN ${s.gstin}` : "",
      `Total: ${money(t?.total, cur)}`,
      `Paid: ${money(Number(t?.paid ?? 0) - Number(t?.refunded ?? 0), cur)}`,
      balance > 0 ? `Balance pending: ${money(balance, cur)}` : "Paid in full. Thank you!",
      "",
      s?.receipt_footer ?? "",
    ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""));
    window.open(`https://wa.me/${waNumber(guest?.mobile ?? "")}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  function shareBillLink() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/view/bill/${id}`;
    const hotelName = settings.data?.name || "our hotel";
    const guestName = guest?.name || "Guest";
    const greeting = `Hi ${guestName}, Please Find the Attached Bill from ${hotelName}:\n${link}`;
    openWhatsAppChat(guest?.mobile ?? "", greeting);
    toast.success("WhatsApp opened with bill link");
  }

  async function downloadInvoicePdf() {
    if (!invoicePdfRef.current) return;
    try {
      setPdfBusy(true);
      toast.info("Generating invoice PDF…");
      const invNo = b.invoice_no ?? b.booking_no;
      const filename = `Invoice_${invNo}.pdf`;
      await downloadPdfFromElement(invoicePdfRef.current, filename);
      toast.success("Invoice PDF downloaded");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to download PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={guest?.name ?? "Booking"}
        sub={<>{b.booking_no} · Room{activeRooms.length > 1 ? "s" : ""} {roomLabel} · {guest?.mobile}</>}
        actions={
          <>
            <StatusPill status={b.status} />
            {b.status === "reserved" && checkInOpen && (
              <ActionTooltip label={balance > 0 && !canOverride ? "Collect the full balance first" : "Check the guest in"}>
                <span><Button onClick={() => setStatusOpen("checked_in")} disabled={balance > 0 && !canOverride}>Check in</Button></span>
              </ActionTooltip>
            )}
            {b.status === "reserved" && !checkInOpen && (
              <span className="text-sm text-muted-foreground">Check-in opens {fmtDate(b.check_in)}, {checkInTime}</span>
            )}
            {b.status === "checked_in" && <Button onClick={() => setStatusOpen("checked_out")}>Check out</Button>}
            {b.status === "reserved" && <Button variant="outline" onClick={() => setModifyOpen(true)}>Modify booking</Button>}
            {b.status === "reserved" && <Button variant="outline" onClick={() => setCancelOpen(true)}>Cancel</Button>}
          </>
        }
      />

      {b.balance_exception && (
        <div className="rounded-xl border border-warning bg-warning/15 p-4 text-sm">{b.balance_exception_note}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-5 text-sm sm:grid-cols-4">
            <Info label="Check-in" value={fmtDate(b.check_in)} sub={b.actual_check_in ? fmtDateTime(b.actual_check_in) : undefined} />
            <Info label="Check-out" value={fmtDate(b.check_out)} sub={b.actual_check_out ? fmtDateTime(b.actual_check_out) : undefined} />
            <Info label="Guests" value={`${b.adults} adult${b.adults > 1 ? "s" : ""}${b.children ? `, ${b.children} child` : ""}`} />
            <Info label="Source" value={b.source} />
            {b.notes && <div className="col-span-full whitespace-pre-line text-muted-foreground">{b.notes}</div>}
          </div>

          <div className="rounded-xl border bg-card">
            <h2 className="border-b p-4 font-semibold">Rooms ({activeRooms.length})</h2>
            <div className="divide-y">
              {bookingRooms.map((r) => (
                <div key={r.id} className={`flex justify-between p-4 text-sm ${r.removed_at ? "text-muted-foreground line-through" : ""}`}>
                  <span>Room {(r.rooms?.number ?? r.room_number)}{r.removed_at ? ` — removed (${r.removed_reason ?? ""})` : ""}</span>
                  <span>{money(r.rate, cur)} / night</span>
                </div>
              ))}
            </div>
          </div>

          <ExtrasCard bookingId={id} active={isActive} extras={extras} charges={charges} nights={Number(t?.nights ?? 1)} guests={b.adults + b.children}
            cur={cur} isOwner={!!me.data?.isOwner} onAddOther={() => setChargeOpen(true)} onDone={refresh} />

          {guest && <GuestDocs guestId={guest.id} bookingId={id} />}

          {q.data.past.length > 0 && (
            <div className="rounded-xl border bg-card">
              <h2 className="border-b p-4 font-semibold">Previous stays ({q.data.past.length})</h2>
              <div className="divide-y">
                {q.data.past.map((x) => (
                  <Link key={x.id} to="/bookings/$id" params={{ id: x.id }} className="flex justify-between p-4 text-sm hover:bg-muted/50">
                    <span>Room {(x.rooms?.number ?? x.room_number)} · {fmtDate(x.check_in)} → {fmtDate(x.check_out)}<span className="block text-xs text-muted-foreground">{x.booking_no}</span></span>
                    <StatusPill status={x.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-semibold">History</h2>
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-3">
                  <span>{STATUS_LABEL[h.to_status] ?? h.to_status}{h.note ? ` — ${h.note}` : ""}</span>
                  <span className="text-muted-foreground">{fmtDateTime(h.changed_at)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="h-fit space-y-4 rounded-xl border bg-card p-5 lg:sticky lg:top-8">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{billTitle(b.gst_bill)}</h2>
            <span className="text-xs text-muted-foreground">{b.gst_bill ? "With GST" : "Without GST"}</span>
          </div>
          <div>
            <Row l={`Rooms (${t?.nights} night${t?.nights === 1 ? "" : "s"})`} r={money(t?.room_charges, cur)} />
            <Row l="Extras" r={money(t?.extra_charges, cur)} />
            {Number(b.discount) > 0 && <Row l="Discount" r={`− ${money(b.discount, cur)}`} />}
            {b.gst_bill && <Row l={`${settings.data?.tax_label ?? "GST"} (${b.tax_rate}%)`} r={money(t?.tax_amount, cur)} />}
            <div className="my-3 border-t" />
            <Row l="Total" r={money(t?.total, cur)} bold />
            <Row l="Paid" r={money(t?.paid, cur)} />
            {Number(t?.refunded) > 0 && <Row l="Refunded" r={`− ${money(t?.refunded, cur)}`} />}
            <div className="mt-3 rounded-lg bg-muted p-3">
              <Row l={balance < 0 ? "Extra paid (to refund)" : "Balance due"} r={money(Math.abs(balance), cur)} bold />
            </div>
          </div>
          {b.status !== "cancelled" && balance > 0 && (
            <Button className="w-full" onClick={() => setPayOpen("payment")}>Collect {money(balance, cur)}</Button>
          )}
          {balance < 0 && me.data?.can("refund") && (
            <Button className="w-full" variant="outline" onClick={() => setPayOpen("refund")}>Refund {money(-balance, cur)}</Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={shareBillLink} title="Share bill link via WhatsApp">
              <MessageCircle className="h-4 w-4 mr-1 text-emerald-600" />WhatsApp Bill
            </Button>
            <Button variant="outline" asChild>
              <Link to="/print/invoice/$id" params={{ id }}>
                <FileText className="h-4 w-4" />View bill
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" onClick={downloadInvoicePdf} disabled={pdfBusy} className="text-xs">
              <Download className="mr-1 h-3.5 w-3.5" />Download PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={shareBill} className="text-xs" title="Share text message">
              <MessageCircle className="mr-1 h-3.5 w-3.5" />WhatsApp text
            </Button>
          </div>
          {payments.length > 0 && (
            <div className="border-t pt-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Payments received</div>
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <div>
                      <div>{p.kind === "refund" ? "− " : ""}{money(p.amount, cur)} · {p.method}</div>
                      <div className="text-xs text-muted-foreground">{p.receipt_no} · {fmtDateTime(p.received_at)}</div>
                    </div>
                    <ActionTooltip label="View or print receipt">
                      <Button size="sm" variant="ghost" asChild><Link to="/print/receipt/$id" params={{ id: p.id }} aria-label="View receipt"><Receipt className="h-4 w-4" /></Link></Button>
                    </ActionTooltip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {modifyOpen && <ModifyDialog onClose={() => setModifyOpen(false)} b={b} rooms={activeRooms} cur={cur} defaultTax={Number(settings.data?.default_tax_rate ?? 0)} canDiscount={!!me.data?.can("discount")} onDone={refresh} />}
      {cancelOpen && <CancelDialog onClose={() => setCancelOpen(false)} bookingId={id} paid={Number(t?.paid ?? 0) - Number(t?.refunded ?? 0)} cur={cur} onDone={refresh} />}
      <PaymentDialog kind={payOpen} onClose={() => setPayOpen(null)} bookingId={id} methods={settings.data?.payment_methods ?? ["Cash"]} suggested={Math.abs(balance)} onDone={refresh} />
      <ChargeDialog open={chargeOpen} onClose={() => setChargeOpen(false)} bookingId={id} onDone={refresh} />
      <StatusDialog to={statusOpen} onClose={() => setStatusOpen(null)} bookingId={id} balance={balance} cur={cur} onDone={refresh} />

      {/* Hidden container for PDF rendering */}
      <div style={{ position: "fixed", left: -9999, top: 0, width: 800 }}>
        <InvoiceDocument
          ref={invoicePdfRef}
          booking={b}
          totals={t}
          charges={charges}
          payments={payments}
          rooms={activeRooms}
          settings={settings.data}
        />
      </div>
    </div>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
function Row({ l, r, bold }: { l: string; r: string; bold?: boolean }) {
  return <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold" : ""}`}><span>{l}</span><span>{r}</span></div>;
}

type Extra = { id: string; name: string; price: number; unit: string };
type Charge = { id: string; description: string; amount: number; extra_id: string | null; qty: number };
function ExtrasCard({ bookingId, active, extras, charges, nights, guests, cur, isOwner, onAddOther, onDone }: {
  bookingId: string; active: boolean; extras: Extra[]; charges: Charge[]; nights: number; guests: number; cur: string; isOwner: boolean; onAddOther: () => void; onDone: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  async function toggle(e: Extra, on: boolean) {
    setBusy(true);
    if (on) {
      const { error } = await supabase.rpc("add_booking_extra", { _booking_id: bookingId, _extra_id: e.id, _qty: qty[e.id] ?? suggestedQty(e.unit, nights, guests) });
      if (error) toast.error(errMsg(error));
    } else {
      for (const c of charges.filter((c) => c.extra_id === e.id)) {
        const { error } = await supabase.rpc("remove_booking_charge", { _charge_id: c.id });
        if (error) { toast.error(errMsg(error)); break; }
      }
    }
    setBusy(false);
    onDone();
  }
  async function removeOther(id: string) {
    const { error } = await supabase.rpc("remove_booking_charge", { _charge_id: id });
    if (error) toast.error(errMsg(error)); else onDone();
  }
  const others = charges.filter((c) => !c.extra_id);
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Extras <span className="text-sm font-normal text-muted-foreground">(optional)</span></h2>
        {active && isOwner && <Button size="sm" variant="outline" onClick={onAddOther}>Other charge</Button>}
      </div>
      <div className="divide-y">
        {extras.length === 0 && <p className="p-4 text-sm text-muted-foreground">No extras set up. The owner can add them in Settings.</p>}
        {extras.map((e) => {
          const added = charges.filter((c) => c.extra_id === e.id);
          const on = added.length > 0;
          const amount = added.reduce((a, c) => a + Number(c.amount), 0);
          return (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <label className="flex items-center gap-3">
                <Checkbox checked={on} disabled={!active || busy} onCheckedChange={(v) => toggle(e, !!v)} />
                <span>
                  <span className="font-medium">{e.name}</span>
                  <span className="block text-xs text-muted-foreground">{money(e.price, cur)} {EXTRA_UNITS[e.unit] ?? ""}</span>
                </span>
              </label>
              {on ? (
                <span className="font-medium">{added.map((c) => `× ${c.qty}`).join(", ")} · {money(amount, cur)}</span>
              ) : active ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Qty</span>
                  <Input type="number" min={1} className="h-8 w-20" value={qty[e.id] ?? suggestedQty(e.unit, nights, guests)} onChange={(ev) => setQty({ ...qty, [e.id]: Math.max(1, Number(ev.target.value)) })} />
                </div>
              ) : null}
            </div>
          );
        })}
        {others.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4 text-sm">
            <span>{c.description}</span>
            <span className="flex items-center gap-2">{money(c.amount, cur)}
              {active && isOwner && <Button size="sm" variant="ghost" onClick={() => removeOther(c.id)}>Remove</Button>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentDialog({ kind, onClose, bookingId, methods, suggested, onDone }: { kind: null | "payment" | "refund"; onClose: () => void; bookingId: string; methods: string[]; suggested: number; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(methods[0] ?? "Cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const value = amount === "" ? suggested : Number(amount);
  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("record_payment", { _booking_id: bookingId, _kind: kind!, _amount: value, _method: method, _reference: reference, _note: note });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(kind === "refund" ? "Refund recorded" : "Payment received");
    setAmount(""); setReference(""); setNote("");
    onDone(); onClose();
  }
  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{kind === "refund" ? "Refund to guest" : "Collect payment"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min={0} step="0.01" value={amount} placeholder={String(suggested)} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Method</Label>
            <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Reference (UPI / txn ID)</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy || !(value > 0)}>{busy ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChargeDialog({ open, onClose, bookingId, onDone }: { open: boolean; onClose: () => void; bookingId: string; onDone: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [taxable, setTaxable] = useState(true);
  async function save() {
    const { error } = await supabase.from("booking_charges").insert({ booking_id: bookingId, description, amount, taxable });
    if (error) { toast.error(errMsg(error)); return; }
    setDescription(""); setAmount(0);
    onDone(); onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add other charge</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Description</Label><Input value={description} placeholder="Laundry, damage…" onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Amount</Label><AmountInput value={amount} onValueChange={setAmount} /></div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={taxable} onCheckedChange={setTaxable} /> Apply GST (if GST bill)</label>
        </div>
        <DialogFooter><Button onClick={save} disabled={!description || !(amount > 0)}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ to, onClose, bookingId, balance, cur, onDone }: { to: null | "checked_in" | "checked_out"; onClose: () => void; bookingId: string; balance: number; cur: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("change_booking_status", { _booking_id: bookingId, _to: to!, _note: note });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(to === "checked_in" ? "Guest checked in" : "Guest checked out");
    setNote("");
    onDone(); onClose();
  }
  return (
    <Dialog open={!!to} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{to === "checked_in" ? "Check in guest" : "Check out guest"}</DialogTitle></DialogHeader>
        {balance > 0 && (
          <div className="rounded-lg border border-warning bg-warning/15 p-3 text-sm">
            Outstanding balance of <strong>{money(balance, cur)}</strong>. Continuing will be recorded as an exception.
          </div>
        )}
        <div className="space-y-1.5"><Label>Note (optional)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <DialogFooter><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Confirm"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ onClose, bookingId, paid, cur, onDone }: { onClose: () => void; bookingId: string; paid: number; cur: string; onDone: () => void }) {
  const [mode, setMode] = useState<"none" | "charge">("none");
  const [charge, setCharge] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("cancel_booking", { _booking_id: bookingId, _charge: mode === "charge" ? charge : 0, _reason: reason });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Booking cancelled");
    onDone(); onClose();
  }
  const fee = mode === "charge" ? charge : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel booking</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <CancelChargeChoice mode={mode} setMode={setMode} charge={charge} setCharge={setCharge} />
          <div className="rounded-lg bg-muted p-3 text-sm">
            Paid so far {money(paid, cur)} · Cancellation charge {money(fee, cur)} ·{" "}
            <strong>{paid - fee >= 0 ? `To refund ${money(paid - fee, cur)}` : `To collect ${money(fee - paid, cur)}`}</strong>
          </div>
          <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="destructive" onClick={save} disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Cancel booking"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelChargeChoice({ mode, setMode, charge, setCharge }: { mode: "none" | "charge"; setMode: (m: "none" | "charge") => void; charge: number; setCharge: (n: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>Cancellation charge</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={mode === "none" ? "default" : "outline"} onClick={() => setMode("none")}>No charge</Button>
        <Button type="button" variant={mode === "charge" ? "default" : "outline"} onClick={() => setMode("charge")}>Add charge</Button>
      </div>
      {mode === "charge" && <AmountInput value={charge} onValueChange={setCharge} aria-label="Cancellation charge amount" />}
    </div>
  );
}

type ModB = { id: string; check_in: string; check_out: string; adults: number; children: number; discount: number; gst_bill: boolean; status: string };
type ModRoom = { room_id: string | null; rate: number; room_number?: string | null; rooms: { number: string } | null };
function ModifyDialog({ onClose, b, rooms, cur, defaultTax, canDiscount, onDone }: { onClose: () => void; b: ModB; rooms: ModRoom[]; cur: string; defaultTax: number; canDiscount: boolean; onDone: () => void }) {
  const [f, setF] = useState({ check_in: b.check_in, check_out: b.check_out, adults: b.adults, children: b.children, discount: Number(b.discount), gst_bill: b.gst_bill, reason: "" });
  const [remove, setRemove] = useState<string[]>([]);
  const [add, setAdd] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"none" | "charge">("none");
  const [charge, setCharge] = useState(0);
  const [busy, setBusy] = useState(false);
  const datesChanged = f.check_in !== b.check_in || f.check_out !== b.check_out;
  const free = useQuery({
    queryKey: ["available", f.check_in, f.check_out],
    enabled: f.check_out > f.check_in,
    queryFn: async () => (await supabase.rpc("available_rooms", { _from: f.check_in, _to: f.check_out })).data ?? [],
  });
  const own = new Set(rooms.map((r) => r.room_id));
  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("modify_booking", {
      _booking_id: b.id, _check_in: f.check_in, _check_out: f.check_out, _adults: f.adults, _children: f.children,
      _discount: f.discount, _gst_bill: f.gst_bill, _remove_rooms: remove,
      _add_rooms: Object.entries(add).map(([room_id, rate]) => ({ room_id, rate })),
      _cancel_charge: mode === "charge" ? charge : 0, _reason: f.reason,
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Booking updated");
    onDone(); onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Modify booking</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Check-in</Label><Input type="date" disabled={b.status === "checked_in"} value={f.check_in} onChange={(e) => { setF({ ...f, check_in: e.target.value }); setAdd({}); }} /></div>
            <div className="space-y-1.5"><Label>Check-out</Label><Input type="date" value={f.check_out} onChange={(e) => { setF({ ...f, check_out: e.target.value }); setAdd({}); }} /></div>
            <div className="space-y-1.5"><Label>Adults</Label><Input type="number" min={1} value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Children</Label><Input type="number" min={0} value={f.children} onChange={(e) => setF({ ...f, children: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Discount</Label><AmountInput disabled={!canDiscount} value={f.discount} onValueChange={(discount) => setF((c) => ({ ...c, discount }))} /></div>
            <label className="flex items-center gap-3 self-end pb-2 text-sm"><Switch checked={f.gst_bill} onCheckedChange={(v) => setF({ ...f, gst_bill: v })} /> GST Bill {f.gst_bill && <span className="text-muted-foreground">({defaultTax}%)</span>}</label>
          </div>

          <div className="space-y-2">
            <Label>Rooms in this booking — untick to remove</Label>
            {rooms.filter((r): r is ModRoom & { room_id: string } => !!r.room_id).map((r) => (
              <label key={r.room_id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <span className="flex items-center gap-2">
                  <Checkbox checked={!remove.includes(r.room_id!)} onCheckedChange={(v) => setRemove((s) => v ? s.filter((x) => x !== r.room_id!) : [...s, r.room_id!])} />
                  Room {(r.rooms?.number ?? r.room_number)}
                </span>
                <span className="text-muted-foreground">{money(r.rate, cur)} / night</span>
              </label>
            ))}
          </div>

          {!datesChanged && (free.data?.filter((r) => !own.has(r.id)).length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>Add rooms</Label>
              <div className="flex flex-wrap gap-2">
                {free.data!.filter((r) => !own.has(r.id)).map((r) => (
                  <Button key={r.id} type="button" size="sm" variant={r.id in add ? "default" : "outline"}
                    onClick={() => setAdd((s) => { const n = { ...s }; if (r.id in n) delete n[r.id]; else n[r.id] = Number(r.rate); return n; })}>
                    {r.number} · {money(r.rate, cur)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {remove.length > 0 && <CancelChargeChoice mode={mode} setMode={setMode} charge={charge} setCharge={setCharge} />}

          <div className="space-y-1.5"><Label>Reason for change</Label><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Guest cancelled 2 rooms, extended stay…" /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy || !f.reason.trim() || f.check_out <= f.check_in || remove.length === rooms.length}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
