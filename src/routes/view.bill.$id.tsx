import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { downloadPdfFromElement } from "@/lib/pdf";

export const Route = createFileRoute("/view/bill/$id")({
  head: () => ({
    meta: [
      { title: "Bill / Invoice — Front Desk" },
      { name: "description", content: "View your stay bill or invoice." },
      { property: "og:title", content: "Bill / Invoice — Front Desk" },
      { property: "og:description", content: "View your stay bill or invoice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicBillViewPage,
});

function PublicBillViewPage() {
  const { id } = Route.useParams();
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: ["public-bill", id],
    queryFn: async () => {
      // 1. Try public RPC first
      const rpc = await supabase.rpc("get_public_invoice" as any, { _booking_id: id });
      if (!rpc.error && rpc.data) {
        const d = rpc.data as any;
        if (d.booking) {
          return {
            b: d.booking,
            t: d.totals,
            charges: d.charges || [],
            payments: d.payments || [],
            rooms: d.rooms || [],
            settings: d.settings,
          };
        }
      }

      // 2. Direct fallback (in case user is authenticated staff or direct read permitted)
      const [b, t, c, p, r, s] = await Promise.all([
        supabase.from("bookings").select("*, guests(*)").eq("id", id).maybeSingle(),
        supabase.from("booking_totals").select("*").eq("booking_id", id).maybeSingle(),
        supabase.from("booking_charges").select("*").eq("booking_id", id).order("created_at"),
        supabase.from("payments").select("*").eq("booking_id", id).order("received_at"),
        supabase.from("booking_rooms").select("*, rooms(room_categories(name, description))").eq("booking_id", id).is("removed_at", null).order("created_at"),
        supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
      ]);

      if (b.data) {
        return {
          b: b.data,
          t: t.data,
          charges: c.data ?? [],
          payments: p.data ?? [],
          rooms: r.data ?? [],
          settings: s.data,
        };
      }

      throw new Error("Bill not found or link has expired.");
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-500">
        Loading bill details…
      </div>
    );
  }

  if (query.isError || !query.data?.b) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Document Unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">The requested bill could not be found.</p>
      </div>
    );
  }

  const { b, t, charges, payments, rooms, settings } = query.data;
  const invNo = b.invoice_no ?? b.booking_no;
  const filename = `Invoice_${invNo}.pdf`;

  async function handleDownloadPdf() {
    if (!docRef.current) return;
    try {
      setDownloading(true);
      toast.info("Generating PDF…");
      await downloadPdfFromElement(docRef.current, filename);
      toast.success("PDF downloaded successfully");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100/70 py-3 sm:py-6 px-2 sm:px-4 print:bg-white print:p-0">
      {/* Top action bar */}
      <div className="mx-auto mb-4 sm:mb-6 flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-slate-200 print:hidden">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-900 truncate">{settings?.name || "Hotel Bill"}</h1>
          <p className="text-xs text-slate-500">Invoice #{invNo}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 px-2.5 text-xs">
            <Printer className="mr-1 h-3.5 w-3.5" /> Print
          </Button>
          <Button size="sm" onClick={handleDownloadPdf} disabled={downloading} className="h-8 px-2.5 text-xs">
            <Download className="mr-1 h-3.5 w-3.5" /> Download PDF
          </Button>
        </div>
      </div>

      {/* Printable Invoice */}
      <InvoiceDocument
        ref={docRef}
        booking={b}
        totals={t}
        charges={charges}
        payments={payments}
        rooms={rooms}
        settings={settings}
      />
    </div>
  );
}
