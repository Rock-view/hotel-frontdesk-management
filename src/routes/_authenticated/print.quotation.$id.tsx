import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, MessageCircle, Printer } from "lucide-react";
import { useSettings } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { QuotationDocument } from "@/components/QuotationDocument";
import { getQuotationById } from "@/lib/quotations";
import { downloadPdfFromElement, sharePdfViaWhatsApp } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/print/quotation/$id")({
  head: () => ({
    meta: [
      { title: "Quotation — Front Desk" },
      { name: "description", content: "Estimate / quotation for a stay." },
      { property: "og:title", content: "Quotation — Front Desk" },
      { property: "og:description", content: "Estimate / quotation for a stay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuotationPrintPage,
});

function QuotationPrintPage() {
  const { id } = Route.useParams() as { id: string };
  const settings = useSettings();
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["quotation", id],
    queryFn: async () => {
      const data = await getQuotationById(id);
      if (!data) throw new Error("Quotation not found");
      return data;
    },
  });

  const h = settings.data;
  if (!q.data || !h) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const item = q.data;
  const filename = `Quotation_${item.quotation_no}.pdf`;

  async function handleDownloadPdf() {
    if (!docRef.current) return;
    try {
      setBusy(true);
      toast.info("Generating PDF…");
      await downloadPdfFromElement(docRef.current, filename);
      toast.success("PDF downloaded successfully");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  }

  async function handleWhatsAppPdf() {
    if (!docRef.current) return;
    try {
      setBusy(true);
      toast.info("Preparing quotation for WhatsApp…");
      const greeting = `Hello ${item.guest_name}, please find attached your estimate ${item.quotation_no} from ${h?.name || "our hotel"}.`;
      const res = await sharePdfViaWhatsApp(docRef.current, filename, item.guest_mobile, greeting);
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
    <div className="min-h-screen bg-muted/40 py-6 print:bg-background print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4">
        <Button variant="ghost" asChild>
          <Link to="/bookings" search={{ tab: "quotations" }}>← Quotations</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={busy}>
            <Download className="mr-1.5 h-4 w-4" /> Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleWhatsAppPdf} disabled={busy}>
            <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp PDF
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print / Save
          </Button>
        </div>
      </div>

      <QuotationDocument ref={docRef} quotation={item} settings={h} />
    </div>
  );
}
