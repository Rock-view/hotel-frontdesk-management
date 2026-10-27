import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AmountInput } from "@/components/AmountInput";
import { Checkbox } from "@/components/ui/checkbox";
import { money } from "@/lib/format";
import { suggestedQty, EXTRA_UNITS } from "@/lib/booking";
import { useSettings } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import {
  saveQuotation,
  calculateQuotationBreakdown,
  type Quotation,
  type QuotationCharge,
} from "@/lib/quotations";

export function EditQuotationDialog({
  quotation: q,
  open,
  onClose,
  onDone,
}: {
  quotation: Quotation | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const settings = useSettings();
  const cur = settings.data?.currency || "INR";
  const defaultTax = Number(settings.data?.default_tax_rate ?? 0);

  const [f, setF] = useState({
    guest_name: "",
    guest_mobile: "",
    guest_email: "",
    adults: 1,
    children: 0,
    discount: 0,
    gst_bill: false,
    notes: "",
  });

  const [roomRates, setRoomRates] = useState<number[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [extraQty, setExtraQty] = useState<Record<string, number>>({});
  const [customCharges, setCustomCharges] = useState<QuotationCharge[]>([]);
  const [busy, setBusy] = useState(false);

  const extrasQuery = useQuery({
    queryKey: ["extras-active"],
    queryFn: async () =>
      (await supabase.from("extras").select("*").eq("active", true).order("sort").order("name")).data ?? [],
  });

  useEffect(() => {
    if (q) {
      setF({
        guest_name: q.guest_name,
        guest_mobile: q.guest_mobile,
        guest_email: q.guest_email || "",
        adults: q.adults,
        children: q.children,
        discount: q.discount,
        gst_bill: q.gst_bill,
        notes: q.notes || "",
      });
      setRoomRates((q.rooms || []).map((r) => r.rate));

      const activeExtras = extrasQuery.data ?? [];
      const initSelected: Record<string, boolean> = {};
      const initQty: Record<string, number> = {};
      const custom: QuotationCharge[] = [];

      (q.charges || []).forEach((c) => {
        const matched = activeExtras.find((e) =>
          c.description.toLowerCase().startsWith(e.name.toLowerCase())
        );
        if (matched) {
          initSelected[matched.id] = true;
          const calcQty = Math.round(Number(c.amount) / (Number(matched.price) || 1));
          initQty[matched.id] = calcQty > 0 ? calcQty : 1;
        } else {
          custom.push({ ...c, taxable: c.taxable !== false });
        }
      });

      setSelectedExtras(initSelected);
      setExtraQty(initQty);
      setCustomCharges(custom);
    }
  }, [q, extrasQuery.data]);

  if (!q) return null;

  const updatedRooms = (q.rooms || []).map((r, i) => ({
    ...r,
    rate: roomRates[i] ?? r.rate,
  }));

  const effectiveCharges = useMemo(() => {
    const stayNights = Math.max(1, q?.nights ?? 1);
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
  }, [extrasQuery.data, selectedExtras, extraQty, q?.nights, f.adults, f.children, customCharges]);

  const taxRate = f.gst_bill ? (q.tax_rate > 0 ? q.tax_rate : defaultTax) : 0;
  const breakdown = calculateQuotationBreakdown({
    rooms: updatedRooms,
    nights: q.nights,
    charges: effectiveCharges,
    discount: f.discount,
    gst_bill: f.gst_bill,
    gst_pct: taxRate,
  });

  async function handleSave() {
    if (!f.guest_name.trim() || !f.guest_mobile.trim()) {
      toast.error("Guest name and mobile are required");
      return;
    }

    try {
      setBusy(true);

      await saveQuotation(
        {
          quotation_no: q!.quotation_no,
          guest_name: f.guest_name,
          guest_mobile: f.guest_mobile,
          guest_email: f.guest_email || null,
          check_in: q!.check_in,
          check_out: q!.check_out,
          adults: f.adults,
          children: f.children,
          nights: q!.nights,
          source: q!.source,
          gst_bill: f.gst_bill,
          tax_rate: taxRate,
          discount: f.discount,
          subtotal: breakdown.subtotal,
          tax_amount: breakdown.taxAmount,
          total: breakdown.total,
          notes: f.notes || null,
          rooms: updatedRooms,
          charges: effectiveCharges,
        },
        q!.id
      );

      toast.success(`Quotation ${q!.quotation_no} updated`);
      onDone();
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to save quotation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Quotation {q.quotation_no}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Guest Name</Label>
              <Input value={f.guest_name} onChange={(e) => setF({ ...f, guest_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile Number</Label>
              <Input value={f.guest_mobile} onChange={(e) => setF({ ...f, guest_mobile: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email (optional)</Label>
              <Input type="email" value={f.guest_email} onChange={(e) => setF({ ...f, guest_email: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Adults</Label>
              <Input type="number" min={1} value={f.adults} onChange={(e) => setF({ ...f, adults: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Children</Label>
              <Input type="number" min={0} value={f.children} onChange={(e) => setF({ ...f, children: Number(e.target.value) })} />
            </div>
          </div>

          {/* Room Rates */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
            <Label className="font-semibold">Quoted Room Tariffs</Label>
            {(q.rooms || []).map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{r.category_name}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rate/night</span>
                  <AmountInput
                    className="h-8 w-28"
                    value={roomRates[i] ?? r.rate}
                    onValueChange={(val) => {
                      const next = [...roomRates];
                      next[i] = val;
                      setRoomRates(next);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Extras from Settings (Checklist) */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
            <div className="flex items-center justify-between pb-1">
              <div>
                <Label className="font-semibold">Extras (Hotel Settings)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Check any extras from Settings (e.g. Extra Bed, CP Plan) to include in quotation.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                onClick={() => setCustomCharges([...customCharges, { description: "Custom Service", amount: 0, taxable: true }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Other charge
              </Button>
            </div>

            <div className="divide-y rounded-md border bg-card text-xs">
              {(extrasQuery.data ?? []).length === 0 ? (
                <p className="p-3 text-muted-foreground">No extras set up in Settings.</p>
              ) : (
                (extrasQuery.data ?? []).map((e) => {
                  const stayNights = Math.max(1, q!.nights);
                  const guests = Math.max(1, f.adults + f.children);
                  const defaultQ = suggestedQty(e.unit, stayNights, guests);
                  const isChecked = !!selectedExtras[e.id];
                  const currentQty = extraQty[e.id] ?? defaultQ;
                  const lineTotal = Number(e.price) * currentQty;

                  return (
                    <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
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
                          <span className="font-medium text-xs">{e.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {money(e.price, cur)} {EXTRA_UNITS[e.unit] ?? ""}
                          </span>
                        </span>
                      </label>

                      {isChecked ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">Qty</span>
                          <Input
                            type="number"
                            min={1}
                            className="h-7 w-16 text-center text-xs"
                            value={currentQty}
                            onChange={(ev) =>
                              setExtraQty((prev) => ({
                                ...prev,
                                [e.id]: Math.max(1, Number(ev.target.value) || 1),
                              }))
                            }
                          />
                          <span className="font-semibold text-xs w-20 text-right">
                            {money(lineTotal, cur)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {money(Number(e.price) * defaultQ, cur)} ({defaultQ} {e.unit === "per_person_night" ? "pax·nt" : e.unit === "per_night" ? "nt" : ""})
                        </span>
                      )}
                    </div>
                  );
                })
              )}

              {/* Custom charges if any */}
              {customCharges.map((c, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 p-2.5 bg-muted/20">
                  <Input
                    className="h-7 flex-1 min-w-[100px] text-xs"
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
                      className="h-7 w-20 text-xs"
                      value={c.amount}
                      onValueChange={(val) => {
                        setCustomCharges((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                        );
                      }}
                    />
                  </div>
                  <label className="flex items-center gap-1 cursor-pointer text-[11px]">
                    <Switch
                      checked={c.taxable !== false}
                      onCheckedChange={(val) => {
                        setCustomCharges((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, taxable: val } : item))
                        );
                      }}
                    />
                    <span className={c.taxable !== false ? "text-primary font-medium" : "text-muted-foreground"}>
                      {c.taxable !== false ? "Tax" : "No Tax"}
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => setCustomCharges((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Discount</Label>
              <AmountInput value={f.discount} onValueChange={(v) => setF({ ...f, discount: v })} />
            </div>
            <div className="flex items-center gap-2 self-end pb-2">
              <Switch checked={f.gst_bill} onCheckedChange={(v) => setF({ ...f, gst_bill: v })} />
              <Label>GST Bill ({taxRate}%)</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>

          {/* Breakdown summary */}
          <div className="space-y-1.5 border-t pt-3 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Room Charges ({q.nights} night{q.nights === 1 ? "" : "s"}):</span>
              <span>{money(breakdown.roomTotal, cur)}</span>
            </div>
            {breakdown.extrasTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Extras (Taxable: {money(breakdown.taxableExtras, cur)} · Non-taxable: {money(breakdown.nonTaxableExtras, cur)}):</span>
                <span>{money(breakdown.extrasTotal, cur)}</span>
              </div>
            )}
            {Number(f.discount) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount:</span>
                <span>− {money(f.discount, cur)}</span>
              </div>
            )}
            {f.gst_bill && (
              <div className="flex justify-between text-muted-foreground">
                <span>GST @ {taxRate}% (on {money(breakdown.taxableBase, cur)}):</span>
                <span>+ {money(breakdown.taxAmount, cur)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 font-semibold text-sm">
              <span>New estimated total:</span>
              <span className="font-display text-lg text-primary">{money(breakdown.total, cur)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
