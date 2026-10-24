import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, MessageCircle, Printer, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuotationDocument } from "@/components/QuotationDocument";
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

  function handleWhatsApp() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/view/quotation/${q.id}`;
    const hotelName = settings?.name || "our hotel";
    const greeting = `Hi ${q.guest_name}, Please Find the Attached Quotation from ${hotelName}:\n${link}`;
    openWhatsAppChat(q.guest_mobile, greeting);
    toast.success("WhatsApp opened with quotation link");
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
