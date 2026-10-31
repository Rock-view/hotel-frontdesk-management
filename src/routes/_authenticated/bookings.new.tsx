import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/use-me";
import { PageHeader, Empty } from "@/components/bits";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/AmountInput";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDaysISO, errMsg, money, nights, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOOKING_SOURCES, bookingTotal, groupRoomsByCategory, suggestedQty, EXTRA_UNITS } from "@/lib/booking";
import { parsePaymentQrs, type PaymentQr } from "@/lib/payment-qrs";
import { saveQuotation, calculateQuotationBreakdown, type QuotationCharge } from "@/lib/quotations";

export const Route = createFileRoute("/_authenticated/bookings/new")({
  head: () => ({ meta: [{ title: "New booking — Front Desk" }, { name: "description", content: "Create a walk-in or advance booking." }, { property: "og:title", content: "New booking — Front Desk" }, { property: "og:description", content: "Create a walk-in or advance booking." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewBooking,
});

function NewBooking() {
  const navigate = useNavigate();
  const settings = useSettings();
  const me = useMe();
  const today = todayISO();
  const [f, setF] = useState({
    name: "", mobile: "", email: "",
    check_in: today, check_out: addDaysISO(today, 1),
    adults: 1, children: 0, discount: 0, gst_bill: false,
    source: "Walk-in", notes: "", advance: 0, advance_method: "",
    advance_received_in: "",
  });
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [extraQty, setExtraQty] = useState<Record<string, number>>({});
  const [customCharges, setCustomCharges] = useState<QuotationCharge[]>([]);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const configuredQrs = useMemo(
    () => parsePaymentQrs(settings.data?.payment_qrs),
    [settings.data]
  );

  const extrasQuery = useQuery({
    queryKey: ["extras-active"],
    queryFn: async () =>
      (await supabase.from("extras").select("*").eq("active", true).order("sort").order("name")).data ?? [],
  });

  useEffect(() => {
    if (settings.data) setF((p) => ({ ...p, advance_method: p.advance_method || settings.data!.payment_methods[0] || "Cash" }));
  }, [settings.data]);

  const validDates = f.check_out > f.check_in;
  const isFuture = f.check_in > today;
  const rooms = useQuery({
    queryKey: ["available", f.check_in, f.check_out],
    enabled: validDates,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("available_rooms", { _from: f.check_in, _to: f.check_out });
      if (error) throw error;
      return data;
    },
  });
  const cats = useQuery({
    queryKey: ["room-categories"],
    queryFn: async () => (await supabase.from("room_categories").select("id, name, description").order("name")).data ?? [],
  });
  const groups = useMemo(() => groupRoomsByCategory(rooms.data ?? [], cats.data ?? []), [rooms.data, cats.data]);

  const existing = useQuery({
    queryKey: ["guest-lookup", f.mobile],
    enabled: f.mobile.replace(/\D/g, "").length >= 10 && !guestId,
    queryFn: async () => (await supabase.from("guests").select("id, name, mobile, email").eq("mobile", f.mobile.trim()).limit(1)).data?.[0] ?? null,
  });

  const n = validDates ? nights(f.check_in, f.check_out) : 0;
  const taxRate = f.gst_bill ? Number(settings.data?.default_tax_rate ?? 0) : 0;
  const rateSum = Object.values(selected).reduce((a, b) => a + b, 0);
  const total = bookingTotal(rateSum, n, f.discount, taxRate);
  const cur = settings.data?.currency ?? "INR";
  const canBackdate = me.data?.can("backdate");
  const canDiscount = me.data?.can("discount");
  const roomById = new Map((rooms.data ?? []).map((r) => [r.id, r]));

  function toggle(id: string, rate: number) {
    setSelected((s) => {
      const next = { ...s };
      if (id in next) delete next[id]; else next[id] = rate;
      return next;
    });
  }
  function changeDates(k: "check_in" | "check_out", v: string) {
    set(k, v); setSelected({});
  }

  const allQuotationCharges = useMemo(() => {
    const stayNights = Math.max(1, n);
    const guests = Math.max(1, f.adults + f.children);
    const fromExtras: QuotationCharge[] = (extrasQuery.data ?? [])
      .filter((e) => selectedExtras[e.id])
      .map((e) => {
        const qty = extraQty[e.id] ?? suggestedQty(e.unit, stayNights, guests);
        return {
          description: `${e.name}${qty > 1 ? ` (×${qty})` : ""}`,
          amount: Number(e.price) * qty,
          taxable: true,
        };
      });
    return [...fromExtras, ...customCharges];
  }, [extrasQuery.data, selectedExtras, extraQty, n, f.adults, f.children, customCharges]);

  const quotationBreakdown = useMemo(() => {
    const list = Object.entries(selected);
    const quotedRooms = list.map(([id, rate]) => ({ rate: Number(rate) }));
    return calculateQuotationBreakdown({
      rooms: quotedRooms,
      nights: n,
      charges: allQuotationCharges,
      discount: f.discount,
      gst_bill: f.gst_bill,
      gst_pct: f.gst_bill ? taxRate : 0,
    });
  }, [selected, n, allQuotationCharges, f.discount, f.gst_bill, taxRate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = Object.entries(selected);
    if (!list.length) { toast.error("Choose at least one room"); return; }
    if (!validDates) { toast.error("Check-out must be after check-in"); return; }

    const isUpi = f.advance_method.toUpperCase() === "UPI";
    if (isFuture && f.advance > 0 && isUpi && configuredQrs.length > 0 && !f.advance_received_in) {
      toast.error("Please select which account received the UPI advance payment.");
      return;
    }

    setBusy(true);
    const { data, error } = await (supabase.rpc as any)("create_booking_multi", {
      _guest_id: guestId as string, _guest_name: f.name, _guest_mobile: f.mobile, _guest_email: f.email,
      _rooms: list.map(([room_id, rate]) => ({ room_id, rate })),
      _check_in: f.check_in, _check_out: f.check_out, _adults: f.adults, _children: f.children,
      _discount: f.discount, _gst_bill: f.gst_bill, _source: f.source, _notes: f.notes,
      _advance: isFuture ? f.advance : 0, _advance_method: f.advance_method,
      _advance_received_in: (isFuture && f.advance > 0 && isUpi) ? (f.advance_received_in || null) : null,
    });
    if (error) {
      setBusy(false);
      toast.error(errMsg(error));
      return;
    }

    if (allQuotationCharges.length > 0 && data) {
      for (const chg of allQuotationCharges) {
        if (chg.amount > 0) {
          await supabase.from("booking_charges").insert({
            booking_id: data as string,
            description: chg.description,
            amount: chg.amount,
            taxable: chg.taxable !== false,
          });
        }
      }
    }

    setBusy(false);
    toast.success(isFuture ? "Booking saved" : "Booking saved and guest checked in");
    navigate({ to: "/bookings/$id", params: { id: data as string } });
  }

  async function handleCreateQuotation() {
    const list = Object.entries(selected);
    if (!f.name.trim() || !f.mobile.trim()) {
      toast.error("Enter guest name and mobile number");
      return;
    }
    if (!list.length) {
      toast.error("Choose at least one room for the quotation");
      return;
    }
    if (!validDates) {
      toast.error("Check-out must be after check-in");
      return;
    }

    setBusy(true);
    try {
      const quotedRooms = list.map(([id, rate]) => {
        const room = roomById.get(id);
        const cat = cats.data?.find((c) => c.id === room?.category_id);
        return {
          room_id: id,
          room_number: room?.number,
          category_id: room?.category_id || undefined,
          category_name: cat?.name || "Room",
          description: cat?.description || "",
          rate: Number(rate),
        };
      });

      const breakdown = calculateQuotationBreakdown({
        rooms: quotedRooms,
        nights: n,
        charges: allQuotationCharges,
        discount: f.discount,
        gst_bill: f.gst_bill,
        gst_pct: f.gst_bill ? taxRate : 0,
      });

      const saved = await saveQuotation({
        guest_name: f.name,
        guest_mobile: f.mobile,
        guest_email: f.email || null,
        check_in: f.check_in,
        check_out: f.check_out,
        adults: f.adults,
        children: f.children,
        nights: n,
        source: f.source,
        gst_bill: f.gst_bill,
        tax_rate: f.gst_bill ? taxRate : 0,
        discount: f.discount,
        subtotal: breakdown.subtotal,
        tax_amount: breakdown.taxAmount,
        total: breakdown.total,
        notes: f.notes || null,
        rooms: quotedRooms,
        charges: allQuotationCharges,
      });

      toast.success(`Quotation ${saved.quotation_no} created successfully!`);
      navigate({ to: "/bookings", search: { tab: "quotations" } });
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to create quotation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New booking" />

      <Section title="Guest">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile number">
            <Input required inputMode="tel" value={f.mobile} onChange={(e) => { set("mobile", e.target.value); setGuestId(null); }} />
          </Field>
          <Field label="Guest name">
            <Input required value={f.name} disabled={!!guestId} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={f.email} disabled={!!guestId} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
        {existing.data && !guestId && (
          <button type="button" onClick={() => { setGuestId(existing.data!.id); setF((p) => ({ ...p, name: existing.data!.name, email: existing.data!.email ?? "" })); }}
            className="mt-3 w-full rounded-lg border border-primary/40 bg-primary/5 p-3 text-left text-sm">
            Returning guest found: <strong>{existing.data.name}</strong> — tap to use
          </button>
        )}
        {guestId && <p className="mt-2 text-sm text-success">Using saved guest. <button type="button" className="underline" onClick={() => setGuestId(null)}>Change</button></p>}
      </Section>

      <Section title="Stay">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Check-in"><Input type="date" required min={canBackdate ? undefined : today} value={f.check_in} onChange={(e) => changeDates("check_in", e.target.value)} /></Field>
          <Field label="Check-out"><Input type="date" required min={addDaysISO(f.check_in, 1)} value={f.check_out} onChange={(e) => changeDates("check_out", e.target.value)} /></Field>
          <Field label="Adults"><Input type="number" min={1} value={f.adults} onChange={(e) => set("adults", Number(e.target.value))} /></Field>
          <Field label="Children"><Input type="number" min={0} value={f.children} onChange={(e) => set("children", Number(e.target.value))} /></Field>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {n} night{n === 1 ? "" : "s"} · {isFuture ? "Advance booking" : "Guest will be checked in on save"}
        </p>
      </Section>

      <Section title="Available rooms">
        {rooms.data && rooms.data.length === 0 ? (
          <Empty>No rooms free for these dates.</Empty>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <details key={g.id} open={groups.length === 1} className="rounded-lg border">
                <summary className="flex cursor-pointer items-baseline justify-between gap-3 p-3">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {g.rooms.filter((r) => r.id in selected).length > 0 && <strong className="mr-2 text-primary">{g.rooms.filter((r) => r.id in selected).length} selected</strong>}
                    {g.rooms.length} available · from {money(Math.min(...g.rooms.map((r) => Number(r.rate))), cur)}
                  </span>
                </summary>
                <div className="grid grid-cols-3 gap-2 p-3 pt-0 sm:grid-cols-6">
                  {g.rooms.map((r) => (
                    <button type="button" key={r.id} aria-pressed={r.id in selected} onClick={() => toggle(r.id, Number(r.rate))}
                      className={cn("rounded-lg border bg-card p-3 text-center transition", r.id in selected && "border-primary bg-primary/5 ring-2 ring-primary")}>
                      <div className="font-display text-lg font-semibold">{r.number}</div>
                      <div className="text-xs text-muted-foreground">{money(r.rate, cur)} · {r.max_guests} pax</div>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
        {Object.keys(selected).length > 0 && (
          <div className="mt-5 space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="text-sm font-medium">Selected rooms ({Object.keys(selected).length})</div>
            {Object.entries(selected).map(([id, rate]) => (
              <div key={id} className="flex items-center justify-between gap-3 text-sm">
                <span>Room {roomById.get(id)?.number}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rate / night</span>
                  <AmountInput className="h-8 w-28" value={rate} onValueChange={(v) => setSelected((s) => ({ ...s, [id]: v }))} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Charges">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Discount (total)"><AmountInput disabled={!canDiscount} value={f.discount} onValueChange={(value) => set("discount", value)} /></Field>
          <Field label="Source">
            <Select value={f.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BOOKING_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <Switch checked={f.gst_bill} onCheckedChange={(v) => set("gst_bill", v)} /> GST Bill
            {f.gst_bill && <span className="text-muted-foreground">({taxRate}%)</span>}
          </label>
          {isFuture && (
            <>
              <Field label="Advance received"><AmountInput value={f.advance} onValueChange={(value) => set("advance", value)} /></Field>
              <Field label="Advance method">
                <Select value={f.advance_method} onValueChange={(v) => {
                  set("advance_method", v);
                  if (v.toUpperCase() === "UPI" && configuredQrs.length > 0 && !f.advance_received_in) {
                    set("advance_received_in", configuredQrs[0].name);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                  <SelectContent>{(settings.data?.payment_methods ?? ["Cash"]).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {f.advance > 0 && f.advance_method.toUpperCase() === "UPI" && configuredQrs.length > 0 && (
                <Field label="Received In">
                  <Select value={f.advance_received_in} onValueChange={(v) => set("advance_received_in", v)}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {configuredQrs.map((qr) => (
                        <SelectItem key={qr.id} value={qr.name}>{qr.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}
        </div>
        <Field label="Notes" className="mt-4"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </Section>

      <Section title="Extras (Optional)">
        <div className="flex items-center justify-between pb-2">
          <p className="text-xs text-muted-foreground">
            Extras configured in Settings (e.g. Extra Bed, CP Plan) — check to include in quotation.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setCustomCharges([...customCharges, { description: "Custom Service", amount: 0, taxable: true }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Other charge
          </Button>
        </div>

        <div className="divide-y rounded-lg border bg-card">
          {(extrasQuery.data ?? []).length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No extras configured yet. The owner can add extras in Settings.
            </p>
          ) : (
            (extrasQuery.data ?? []).map((e) => {
              const stayNights = Math.max(1, n);
              const guests = Math.max(1, f.adults + f.children);
              const defaultQ = suggestedQty(e.unit, stayNights, guests);
              const isChecked = !!selectedExtras[e.id];
              const currentQty = extraQty[e.id] ?? defaultQ;
              const lineTotal = Number(e.price) * currentQty;

              return (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(val) => {
                        setSelectedExtras((prev) => ({ ...prev, [e.id]: !!val }));
                        if (!extraQty[e.id]) {
                          setExtraQty((prev) => ({ ...prev, [e.id]: defaultQ }));
                        }
                      }}
                    />
                    <span>
                      <span className="font-medium">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {money(e.price, cur)} {EXTRA_UNITS[e.unit] ?? ""}
                      </span>
                    </span>
                  </label>

                  {isChecked ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Qty</span>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20 text-xs text-center"
                          value={currentQty}
                          onChange={(ev) =>
                            setExtraQty((prev) => ({
                              ...prev,
                              [e.id]: Math.max(1, Number(ev.target.value) || 1),
                            }))
                          }
                        />
                      </div>
                      <span className="font-semibold text-sm w-24 text-right">
                        {money(lineTotal, cur)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {money(Number(e.price) * defaultQ, cur)} ({defaultQ} {e.unit === "per_person_night" ? "pax·nt" : e.unit === "per_night" ? "nt" : ""})
                    </span>
                  )}
                </div>
              );
            })
          )}

          {/* Any custom charges added */}
          {customCharges.map((c, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2 p-3 text-xs bg-muted/20">
              <Input
                className="h-8 flex-1 min-w-[120px] text-xs"
                placeholder="Description"
                value={c.description}
                onChange={(e) => {
                  setCustomCharges((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, description: e.target.value } : item))
                  );
                }}
              />
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">{cur === "INR" ? "₹" : cur}</span>
                <AmountInput
                  className="h-8 w-24 text-xs"
                  value={c.amount}
                  onValueChange={(val) => {
                    setCustomCharges((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                    );
                  }}
                />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <Switch
                  checked={c.taxable !== false}
                  onCheckedChange={(val) => {
                    setCustomCharges((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, taxable: val } : item))
                    );
                  }}
                />
                <span className={c.taxable !== false ? "text-primary font-medium" : "text-muted-foreground"}>
                  {c.taxable !== false ? "Taxable" : "Non-taxable"}
                </span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => setCustomCharges((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <div className="sticky bottom-16 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-lg lg:bottom-4">
        <div>
          <div className="text-xs text-muted-foreground">Estimated total</div>
          <div className="font-display text-xl font-semibold">{money(total, cur)}</div>
          {allQuotationCharges.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Quotation (with extras): <strong className="text-foreground">{money(quotationBreakdown.total, cur)}</strong>
            </div>
          )}
          {isFuture && f.advance > 0 && <div className="text-xs text-muted-foreground">Balance {money(total - f.advance, cur)}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleCreateQuotation}
            disabled={busy || !Object.keys(selected).length}
          >
            Create Quotation
          </Button>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Saving…" : isFuture ? "Direct Booking" : "Save booking"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
