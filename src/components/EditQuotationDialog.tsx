import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AmountInput } from "@/components/AmountInput";
import { money } from "@/lib/format";
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
  const [charges, setCharges] = useState<QuotationCharge[]>([]);
  const [busy, setBusy] = useState(false);

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
      setCharges((q.charges || []).map((c) => ({ ...c, taxable: c.taxable !== false })));
    }
  }, [q]);

  if (!q) return null;

  const updatedRooms = (q.rooms || []).map((r, i) => ({
    ...r,
    rate: roomRates[i] ?? r.rate,
  }));

  const taxRate = f.gst_bill ? (q.tax_rate || 12) : 0;
  const breakdown = calculateQuotationBreakdown({
    rooms: updatedRooms,
    nights: q.nights,
    charges,
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
          charges,
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

          {/* Extra Charges / Add-ons */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Extra Charges & Add-ons</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setCharges([...charges, { description: "Extra Charge", amount: 0, taxable: true }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Charge
              </Button>
            </div>
            {charges.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">No extra charges quoted.</div>
            ) : (
              <div className="space-y-2">
                {charges.map((c, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded border bg-card p-2 text-xs">
                    <Input
                      className="h-8 flex-1 min-w-[120px] text-xs"
                      placeholder="Description"
                      value={c.description}
                      onChange={(e) => {
                        setCharges((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, description: e.target.value } : item))
                        );
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">₹</span>
                      <AmountInput
                        className="h-8 w-24 text-xs"
                        value={c.amount}
                        onValueChange={(val) => {
                          setCharges((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                          );
                        }}
                      />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                      <Switch
                        checked={c.taxable !== false}
                        onCheckedChange={(val) => {
                          setCharges((prev) =>
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
                      onClick={() => setCharges((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
              <span>{money(breakdown.roomTotal, "INR")}</span>
            </div>
            {breakdown.extrasTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Extras (Taxable: {money(breakdown.taxableExtras, "INR")} · Non-taxable: {money(breakdown.nonTaxableExtras, "INR")}):</span>
                <span>{money(breakdown.extrasTotal, "INR")}</span>
              </div>
            )}
            {Number(f.discount) > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount:</span>
                <span>− {money(f.discount, "INR")}</span>
              </div>
            )}
            {f.gst_bill && (
              <div className="flex justify-between text-muted-foreground">
                <span>GST @ {taxRate}% (on {money(breakdown.taxableBase, "INR")}):</span>
                <span>+ {money(breakdown.taxAmount, "INR")}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 font-semibold text-sm">
              <span>New estimated total:</span>
              <span className="font-display text-lg text-primary">{money(breakdown.total, "INR")}</span>
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
