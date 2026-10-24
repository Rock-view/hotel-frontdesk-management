import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { QuotationDocument } from "@/components/QuotationDocument";
import { downloadPdfFromElement } from "@/lib/pdf";
import { getQuotationById } from "@/lib/quotations";

export const Route = createFileRoute("/view/quotation/$id")({
  head: () => ({
    meta: [
      { title: "Quotation / Estimate — Front Desk" },
      { name: "description", content: "View your stay estimate and quotation." },
      { property: "og:title", content: "Quotation / Estimate — Front Desk" },
      { property: "og:description", content: "View your stay estimate and quotation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicQuotationViewPage,
});

function PublicQuotationViewPage() {
  const { id } = Route.useParams();
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: ["public-quotation", id],
    queryFn: async () => {
      // 1. Try public RPC first
      const rpc = await supabase.rpc("get_public_quotation" as any, { _quotation_id: id });
      if (!rpc.error && rpc.data) {
        const d = rpc.data as any;
        if (d.quotation) {
          return {
            quotation: d.quotation,
            settings: d.settings,
          };
        }
      }

      // 2. Direct fallback (in case user is authenticated staff or direct read permitted)
      const [q, s] = await Promise.all([
        getQuotationById(id),
        supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle(),
      ]);

      if (q) {
        return {
          quotation: q,
          settings: s.data,
        };
      }

      throw new Error("Quotation not found or link has expired.");
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-500">
        Loading quotation details…
      </div>
    );
  }

  if (query.isError || !query.data?.quotation) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Document Unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">The requested quotation could not be found.</p>
      </div>
    );
  }

  const { quotation, settings } = query.data;
  const filename = `Quotation_${quotation.quotation_no}.pdf`;

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
          <h1 className="text-sm font-semibold text-slate-900 truncate">{settings?.name || "Stay Estimate"}</h1>
          <p className="text-xs text-slate-500">Estimate #{quotation.quotation_no}</p>
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

      {/* Printable Quotation */}
      <QuotationDocument
        ref={docRef}
        quotation={quotation}
        settings={settings}
      />
    </div>
  );
}
