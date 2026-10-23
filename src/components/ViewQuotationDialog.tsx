import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, MessageCircle, Printer, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuotationDocument } from "@/components/QuotationDocument";
import { downloadPdfFromElement, sharePdfViaWhatsApp } from "@/lib/pdf";
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

  if (!quotation) return null;
  const q = quotation;

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

  async function handleWhatsApp() {
    if (!docRef.current) return;
    try {
      setBusy(true);
      toast.info("Preparing quotation for WhatsApp…");
      const greeting = `Hello ${q.guest_name}, please find attached your estimate ${q.quotation_no} from ${settings?.name || "our hotel"}.`;
      const res = await sharePdfViaWhatsApp(docRef.current, filename, q.guest_mobile, greeting);
      if (res === "shared") {
        toast.success("Quotation shared via WhatsApp");
      } else if (res === "downloaded_and_opened") {
        toast.info("PDF downloaded. Please attach the quotation in the opened WhatsApp chat.", { duration: 6000 });
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to share PDF");
    } finally {
      setBusy(false);
    }
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
      </DialogContent>
    </Dialog>
  );
}
