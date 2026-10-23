import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/use-me";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/AmountInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg, fmtDate, money, todayISO } from "@/lib/format";
import type { Quotation } from "@/lib/quotations";

export function ConvertQuotationDialog({
  quotation: q,
  open,
  onClose,
  onSuccess,
}: {
  quotation: Quotation | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
}) {
  const settings = useSettings();
  const cur = settings.data?.currency || "INR";
  const [busy, setBusy] = useState(false);
  const [advance, setAdvance] = useState(0);
  const [advanceMethod, setAdvanceMethod] = useState("Cash");

  // Room assignments: maps index of quoted room to { room_id: string, room_number: string, rate: number }
  const [assignments, setAssignments] = useState<Record<number, { room_id: string; room_number: string; rate: number }>>({});

  useEffect(() => {
    if (settings.data) {
      setAdvanceMethod(settings.data.payment_methods[0] || "Cash");
    }
  }, [settings.data]);

  // Query live available rooms for these dates
  const availableRoomsQuery = useQuery({
    queryKey: ["available-convert", q?.check_in, q?.check_out],
    enabled: !!q && open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("available_rooms", {
        _from: q!.check_in,
        _to: q!.check_out,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const availableRooms: Array<{ id: string; number: string; category_id?: string | null }> =
    (availableRoomsQuery.data as any) ?? [];

  const catsQuery = useQuery({
    queryKey: ["room-categories"],
    queryFn: async () => (await supabase.from("room_categories").select("id, name").order("name")).data ?? [],
  });
  const catMap = new Map((catsQuery.data ?? []).map((c) => [c.id, c.name]));

  // Match available rooms to quoted rooms
  useEffect(() => {
    if (!q || !availableRooms.length) return;

    const initialAssignments: Record<number, { room_id: string; room_number: string; rate: number }> = {};
    const usedRoomIds = new Set<string>();

    (q.rooms || []).forEach((quotedRoom, idx) => {
      // Try to find the exact room if still available
      let match = quotedRoom.room_id ? availableRooms.find((r) => r.id === quotedRoom.room_id && !usedRoomIds.has(r.id)) : null;

      // If not, find another available room in the same category
      if (!match && quotedRoom.category_id) {
        match = availableRooms.find((r) => r.category_id === quotedRoom.category_id && !usedRoomIds.has(r.id)) || null;
      }

      // If still not, match by category name
      if (!match) {
        match = availableRooms.find((r) => (r.category_id ? catMap.get(r.category_id) : "") === quotedRoom.category_name && !usedRoomIds.has(r.id)) || null;
      }

      if (match) {
        usedRoomIds.add(match.id);
        initialAssignments[idx] = {
          room_id: match.id,
          room_number: match.number,
          rate: quotedRoom.rate,
        };
      }
    });

    setAssignments(initialAssignments);
  }, [q, availableRooms, catMap]);

  if (!q) return null;

  const quotedRooms = q.rooms || [];
  const allRoomsAssigned = quotedRooms.length > 0 && quotedRooms.every((_, idx) => !!assignments[idx]?.room_id);
  const isFuture = q.check_in > todayISO();

  async function handleConvert() {
    if (!allRoomsAssigned) {
      toast.error("Please assign an available room for each quoted room slot");
      return;
    }

    if (advance < 0) {
      toast.error("Advance payment cannot be negative");
      return;
    }

    if (advance > q!.total) {
      toast.error(`Advance payment (${money(advance, cur)}) cannot exceed quoted total (${money(q!.total, cur)})`);
      return;
    }

    // Verify assigned room tariffs match quoted room tariffs
    const assignedRateSum = Object.values(assignments).reduce((s, a) => s + (Number(a.rate) || 0), 0);
    const quotedRateSum = (q!.rooms || []).reduce((s, r) => s + (Number(r.rate) || 0), 0);
    if (Math.abs(assignedRateSum - quotedRateSum) > 0.01) {
      toast.error(
        `Assigned room tariff (${money(assignedRateSum, cur)}) differs from quoted tariff (${money(quotedRateSum, cur)}). Please edit quotation to revise pricing before converting.`
      );
      return;
    }

    try {
      setBusy(true);

      const roomPayload = Object.values(assignments).map((a) => ({
        room_id: a.room_id,
        rate: a.rate,
      }));

      // Try atomic RPC convert_quotation_to_booking (handles lock, creation, tax rate, charges, and deletion in 1 transaction)
      const { data: bookingId, error } = await (supabase.rpc as any)("convert_quotation_to_booking", {
        _quotation_id: q!.id,
        _rooms: roomPayload,
        _advance: isFuture ? advance : 0,
        _advance_method: advanceMethod,
        _notes: q!.notes || null,
      });

      if (error) {
        // If RPC function not found in db yet (pending migration), fall back to create_booking_multi
        const isFnMissing =
          error.message?.includes("convert_quotation_to_booking") ||
          (error.message?.includes("function") && error.message?.includes("does not exist"));

        if (isFnMissing) {
          const { data: fallbackBookingId, error: fbError } = await supabase.rpc("create_booking_multi", {
            _guest_id: null as any,
            _guest_name: q!.guest_name,
            _guest_mobile: q!.guest_mobile,
            _guest_email: q!.guest_email || "",
            _rooms: roomPayload,
            _check_in: q!.check_in,
            _check_out: q!.check_out,
            _adults: q!.adults,
            _children: q!.children,
            _discount: q!.discount,
            _gst_bill: q!.gst_bill,
            _source: q!.source || "Walk-in",
            _notes: q!.notes ? `[Converted from ${q!.quotation_no}] ${q!.notes}` : `Converted from quotation ${q!.quotation_no}`,
            _advance: isFuture ? advance : 0,
            _advance_method: advanceMethod,
          });

          if (fbError) {
            toast.error(errMsg(fbError));
            return;
          }

          // Delete quotation only after successful booking creation
          try {
            await (supabase.from("quotations" as never) as any).delete().eq("id", q!.id);
          } catch (delErr) {
            console.error("Failed to delete quotation record after conversion", delErr);
          }

          toast.success(`Quotation ${q!.quotation_no} successfully converted to Booking!`);
          onClose();
          onSuccess(fallbackBookingId as string);
          return;
        }

        toast.error(errMsg(error));
        return;
      }

      toast.success(`Quotation ${q!.quotation_no} successfully converted to Booking!`);
      onClose();
      onSuccess(bookingId as string);
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to convert quotation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Convert Quotation <span className="font-mono text-primary">{q.quotation_no}</span> to Booking
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Guest and stay summary */}
          <div className="rounded-lg border bg-muted/40 p-3 text-sm grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Guest</div>
              <div className="font-medium">{q.guest_name}</div>
              <div className="text-xs text-muted-foreground">{q.guest_mobile}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Stay</div>
              <div className="font-medium">{fmtDate(q.check_in)} → {fmtDate(q.check_out)}</div>
              <div className="text-xs text-muted-foreground">{q.nights} night{q.nights === 1 ? "" : "s"} · {q.adults} Adults</div>
            </div>
          </div>

          {/* Room Availability Re-check and Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-sm">Room Availability & Assignment</Label>
              <span className="text-xs text-muted-foreground">Rechecked in real-time</span>
            </div>

            {availableRoomsQuery.isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Rechecking room availability…</div>
            ) : availableRooms.length === 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No rooms are available for these dates ({fmtDate(q.check_in)} to {fmtDate(q.check_out)}). Conversion cannot proceed until dates are modified.
              </div>
            ) : (
              <div className="space-y-2">
                {quotedRooms.map((qr, idx) => {
                  const assigned = assignments[idx];
                  const usedInOtherSlots = new Set(
                    Object.entries(assignments)
                      .filter(([i]) => Number(i) !== idx)
                      .map(([, a]) => a?.room_id)
                      .filter(Boolean)
                  );

                  return (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 bg-card">
                      <div className="min-w-0">
                        <div className="font-medium text-sm flex items-center gap-1.5">
                          {assigned?.room_id ? (
                            <CheckCircle className="h-4 w-4 text-success" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-warning" />
                          )}
                          <span>Slot #{idx + 1}: {qr.category_name}</span>
                        </div>
                        {qr.description && <div className="text-xs text-muted-foreground">{qr.description}</div>}
                        <div className="text-xs text-muted-foreground mt-0.5">Rate: {money(qr.rate, cur)} / night</div>
                      </div>

                      <div className="w-full sm:w-48 shrink-0">
                        <Select
                          value={assigned?.room_id || ""}
                          onValueChange={(roomId) => {
                            const found = availableRooms.find((r) => r.id === roomId);
                            if (found) {
                              setAssignments((prev) => ({
                                ...prev,
                                [idx]: {
                                  room_id: found.id,
                                  room_number: found.number,
                                  rate: qr.rate,
                                },
                              }));
                            }
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select available room" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRooms
                              .filter((ar) => !usedInOtherSlots.has(ar.id))
                              .map((ar) => (
                                <SelectItem key={ar.id} value={ar.id}>
                                  Room {ar.number} ({ar.category_id ? (catMap.get(ar.category_id) || "Room") : "Room"})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Details */}
          {isFuture && (
            <div className="grid gap-3 sm:grid-cols-2 rounded-lg border p-3 bg-muted/20">
              <div className="space-y-1.5">
                <Label>Advance Payment</Label>
                <AmountInput value={advance} onValueChange={setAdvance} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={advanceMethod} onValueChange={setAdvanceMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(settings.data?.payment_methods ?? ["Cash"]).map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5 border-t pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Quoted Total:</span>
              <span className="font-display text-base font-semibold">{money(q.total, cur)}</span>
            </div>
            {isFuture && advance > 0 && (
              <div className="flex items-center justify-between text-success">
                <span>Advance Payment:</span>
                <span className="font-display font-medium">− {money(advance, cur)}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-semibold">
              <span className="text-muted-foreground">Pending Balance:</span>
              <span className="font-display text-lg text-primary">{money(Math.max(0, q.total - (isFuture ? advance : 0)), cur)}</span>
            </div>
            {advance > q.total && (
              <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                Advance payment exceeds the total quotation amount.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleConvert} disabled={busy || !allRoomsAssigned}>
            {busy ? "Converting…" : (
              <>
                Confirm & Create Booking <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
