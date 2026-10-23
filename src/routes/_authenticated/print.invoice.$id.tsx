import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, MessageCircle, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { downloadPdfFromElement, sharePdfViaWhatsApp } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/print/invoice/$id")({
  head: () => ({
    meta: [
      { title: "Bill — Front Desk" },
      { name: "description", content: "GST bill or booking receipt for a stay." },
      { property: "og:title", content: "Bill — Front Desk" },
      { property: "og:description", content: "GST bill or booking receipt for a stay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { id } = Route.useParams();
  const settings = useSettings();
  const docRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [b, t, c, p, r] = await Promise.all([
        supabase.from("bookings").select("*, guests(*)").eq("id", id).single(),
        supabase.from("booking_totals").select("*").eq("booking_id", id).single(),
        supabase.from("booking_charges").select("*").eq("booking_id", id).order("created_at"),
        supabase.from("payments").select("*").eq("booking_id", id).order("received_at"),
        supabase.from("booking_rooms").select("*, rooms(room_categories(name, description))").eq("booking_id", id).is("removed_at", null).order("created_at"),
      ]);
      if (b.error) throw b.error;
      return { b: b.data, t: t.data!, charges: c.data ?? [], payments: p.data ?? [], rooms: r.data ?? [] };
    },
  });

  const h = settings.data;
  if (!q.data || !h) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const { b, t, charges, payments, rooms } = q.data;
  const invNo = b.invoice_no ?? b.booking_no;
  const filename = `Invoice_${invNo}.pdf`;

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
      toast.info("Preparing PDF for WhatsApp…");
      const greeting = `Hello ${b.guests?.name || "Guest"}, please find attached your invoice ${invNo} from ${h?.name || "our hotel"}.`;
      const res = await sharePdfViaWhatsApp(docRef.current, filename, b.guests?.mobile ?? "", greeting);
      if (res === "shared") {
        toast.success("Shared via WhatsApp");
      } else if (res === "downloaded_and_opened") {
        toast.info("PDF downloaded. Please attach the invoice in the opened WhatsApp chat.", { duration: 6000 });
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
          <Link to="/bookings/$id" params={{ id }}>← Booking</Link>
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

      <InvoiceDocument
        ref={docRef}
        booking={b}
        totals={t}
        charges={charges}
        payments={payments}
        rooms={rooms}
        settings={h}
      />
    </div>
  );
}
