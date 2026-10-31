import React, { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Download, MessageCircle, Printer, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuotationDocument } from "@/components/QuotationDocument";
import { SelectQuotationQrDialog } from "@/components/SelectQuotationQrDialog";
import { type PaymentQr } from "@/lib/payment-qrs";
import { downloadPdfFromElement, openWhatsAppChat } from "@/lib/pdf";
import type { Quotation } from "@/lib/quotations";

export function ViewQuotationDialog({
  quotation,
  settings,
  open,
  onClose,
  onConvert,
}: {
  quotation: Quotation | null;
  settings: any;
  open: boolean;
  onClose: () => void;
  onConvert?: () => void;
}) {
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [qrSelectOpen, setQrSelectOpen] = useState(false);
  const [currentQuotation, setCurrentQuotation] = useState<Quotation | null>(quotation);

  useEffect(() => {
    setCurrentQuotation(quotation);
  }, [quotation]);

  if (!quotation) return null;
  const q = currentQuotation || quotation;

  const filename = `Quotation_${q.quotation_no}.pdf`;

  async function handleDownload() {
    if (!docRef.current) return;
    try {
      setBusy(true);
      toast.info("Generating PDF…");
      await downloadPdfFromElement(docRef.current, filename);
      toast.success("Quotation PDF downloaded");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  }

  function executeOpenWhatsApp(item: Quotation) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/view/quotation/${item.id}`;
    const hotelName = settings?.name || "our hotel";
    const greeting = `Hi ${item.guest_name}, Please Find the Attached Quotation from ${hotelName}:\n${link}`;
    openWhatsAppChat(item.guest_mobile, greeting);
    toast.success("WhatsApp opened with quotation link");
  }

  function handleWhatsApp() {
    const configuredQrs = ((settings as any)?.payment_qrs as PaymentQr[]) || [];
    if (q.qr_locked || configuredQrs.length === 0) {
      executeOpenWhatsApp(q);
      return;
    }
    setQrSelectOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-3">
          <DialogTitle className="text-base font-semibold">
            Quotation {q.quotation_no}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-1.5 pr-6">
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleWhatsApp} disabled={busy}>
              <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
            {onConvert && (
              <Button size="sm" onClick={() => { onClose(); onConvert(); }}>
                Convert to booking <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="py-2">
          <QuotationDocument ref={docRef} quotation={q} settings={settings} />
        </div>

        {qrSelectOpen && (
          <SelectQuotationQrDialog
            quotation={q}
            qrs={((settings as any)?.payment_qrs as PaymentQr[]) || []}
            open={qrSelectOpen}
            onClose={() => setQrSelectOpen(false)}
            onConfirmedAndShare={(locked) => {
              setCurrentQuotation(locked);
              executeOpenWhatsApp(locked);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
