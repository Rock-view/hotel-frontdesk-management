import { useState } from "react";
import { QrCode, CheckCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { type PaymentQr } from "@/lib/payment-qrs";
import { type Quotation, lockQuotationQr } from "@/lib/quotations";

export function SelectQuotationQrDialog({
  quotation,
  qrs,
  open,
  onClose,
  onConfirmedAndShare,
}: {
  quotation: Quotation | null;
  qrs: PaymentQr[];
  open: boolean;
  onClose: () => void;
  onConfirmedAndShare: (lockedQuotation: Quotation) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(qrs[0]?.id || "");
  const [busy, setBusy] = useState(false);

  if (!quotation) return null;

  async function handleConfirm() {
    if (!selectedId) {
      toast.error("Please select a payment QR code to continue.");
      return;
    }

    const selectedQr = qrs.find((q) => q.id === selectedId);
    if (!selectedQr) {
      toast.error("Selected QR not found in hotel configuration.");
      return;
    }

    try {
      setBusy(true);
      const res = await lockQuotationQr(quotation!.id, selectedQr.id, {
        name: selectedQr.name,
        image_url: selectedQr.image_url,
      });

      const updatedQuotation: Quotation = {
        ...quotation!,
        qr_locked: true,
        qr_code_id: selectedQr.id,
        qr_name: res.qr_name || selectedQr.name,
        qr_image_url: res.qr_image_url || selectedQr.image_url,
      };

      toast.success(`Payment QR "${updatedQuotation.qr_name}" locked for this quotation.`);
      onClose();
      onConfirmedAndShare(updatedQuotation);
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to lock payment QR.");
    } finally {
      setBusy(false);
    }
  }

  function handleContinueWithoutQr() {
    // If staff explicitly decides not to attach a QR, proceed with standard link sharing without locking
    onClose();
    onConfirmedAndShare(quotation!);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-5 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Select Payment QR for Quotation
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Quotation {quotation.quotation_no} for {quotation.guest_name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="my-2 space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose which payment account QR should be embedded in the quotation PDF sent to the guest. Once confirmed, this selection will be permanently locked for this quotation.
          </p>

          <div className="grid gap-2.5">
            {qrs.map((qr) => {
              const isSelected = selectedId === qr.id;
              return (
                <div
                  key={qr.id}
                  onClick={() => setSelectedId(qr.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition select-none ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-14 w-14 shrink-0 rounded-lg border bg-white p-1">
                      <img
                        src={qr.image_url}
                        alt={qr.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-foreground truncate">
                        {qr.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Payment Account QR
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isSelected ? (
                      <CheckCircle className="h-5 w-5 text-primary fill-primary/20" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-muted-foreground/30" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={handleContinueWithoutQr}
            disabled={busy}
          >
            Skip QR (Share without QR)
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={busy || !selectedId}
          >
            {busy ? "Locking QR…" : "Confirm & Open WhatsApp"}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
