import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Eye, Pencil, Download, MessageCircle, ArrowRight, Trash2, Calendar, User, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/bits";
import { fmtDate, money } from "@/lib/format";
import { deleteQuotation, type Quotation } from "@/lib/quotations";
import { ViewQuotationDialog } from "@/components/ViewQuotationDialog";
import { EditQuotationDialog } from "@/components/EditQuotationDialog";
import { ConvertQuotationDialog } from "@/components/ConvertQuotationDialog";
import { QuotationDocument } from "@/components/QuotationDocument";
import { downloadPdfFromElement, sharePdfViaWhatsApp } from "@/lib/pdf";

export function QuotationsList({ onConverted }: { onConverted?: (bookingId: string) => void }) {
  const qc = useQueryClient();
  const settings = useSettings();
  const cur = settings.data?.currency || "INR";
  const [term, setTerm] = useState("");

  const [viewQuotation, setViewQuotation] = useState<Quotation | null>(null);
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null);
  const [convertQuotation, setConvertQuotation] = useState<Quotation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Hidden offscreen container for direct PDF download/share from list
  const [activePdfQuotation, setActivePdfQuotation] = useState<Quotation | null>(null);
  const hiddenDocRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["quotations-list", term],
    queryFn: async () => {
      try {
        let query = (supabase.from("quotations" as never) as any)
          .select("*")
          .order("created_at", { ascending: false });

        const t = term.trim().replace(/[%,()]/g, "");
        if (t) {
          query = query.or(`quotation_no.ilike.%${t}%,guest_name.ilike.%${t}%,guest_mobile.ilike.%${t}%`);
        }

        const { data, error } = await query;
        if (error) {
          // If quotations table does not exist yet (pre-migration), return empty array
          console.warn("Quotations query error (table may not be created yet):", error);
          return [] as Quotation[];
        }
        return (data ?? []) as Quotation[];
      } catch {
        return [] as Quotation[];
      }
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quotations-list"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
  };

  async function handleDelete(item: Quotation) {
    if (!window.confirm(`Permanently delete quotation ${item.quotation_no} for ${item.guest_name}? This action cannot be undone.`)) {
      return;
    }

    try {
      setBusyId(item.id);
      await deleteQuotation(item.id);
      toast.success(`Quotation ${item.quotation_no} deleted`);
      refresh();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to delete quotation");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDirectDownload(item: Quotation) {
    setActivePdfQuotation(item);
    setBusyId(item.id);
    toast.info("Generating quotation PDF…");

    // Wait one tick for offscreen element to render
    setTimeout(async () => {
      if (hiddenDocRef.current) {
        try {
          await downloadPdfFromElement(hiddenDocRef.current, `Quotation_${item.quotation_no}.pdf`);
          toast.success("PDF downloaded");
        } catch (err: unknown) {
          toast.error((err as Error)?.message || "Failed to download PDF");
        } finally {
          setBusyId(null);
          setActivePdfQuotation(null);
        }
      }
    }, 150);
  }

  async function handleDirectWhatsApp(item: Quotation) {
    setActivePdfQuotation(item);
    setBusyId(item.id);
    toast.info("Preparing quotation for WhatsApp…");

    setTimeout(async () => {
      if (hiddenDocRef.current) {
        try {
          const greeting = `Hello ${item.guest_name}, please find attached your estimate ${item.quotation_no} from ${settings.data?.name || "our hotel"}.`;
          const res = await sharePdfViaWhatsApp(
            hiddenDocRef.current,
            `Quotation_${item.quotation_no}.pdf`,
            item.guest_mobile,
            greeting
          );
          if (res === "shared") {
            toast.success("Quotation shared via WhatsApp");
          } else if (res === "downloaded_and_opened") {
            toast.info("PDF downloaded. Please attach the quotation in the opened WhatsApp chat.", { duration: 6000 });
          }
        } catch (err: unknown) {
          toast.error((err as Error)?.message || "Failed to share via WhatsApp");
        } finally {
          setBusyId(null);
          setActivePdfQuotation(null);
        }
      }
    }, 150);
  }

  const list = q.data ?? [];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          className="h-11 pl-10"
          placeholder="Search quotations by guest name, mobile, or quotation number"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {/* List */}
      {list.length === 0 ? (
        <Empty>No active quotations found. Use "New booking" to create an estimate.</Empty>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {list.map((item) => (
            <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base">{item.guest_name}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                    {item.quotation_no}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{item.guest_mobile}</span>
                  <span>·</span>
                  <span>{fmtDate(item.check_in)} → {fmtDate(item.check_out)} ({item.nights} night{item.nights === 1 ? "" : "s"})</span>
                  <span>·</span>
                  <span>{item.rooms?.length || 0} Room{item.rooms?.length === 1 ? "" : "s"}</span>
                </div>

                {/* Quoted room category names and descriptions */}
                <div className="text-xs text-muted-foreground pt-0.5">
                  {(item.rooms || []).map((r, i) => (
                    <span key={i} className="mr-2 inline-block">
                      <strong>{r.category_name}</strong>
                      {r.description ? ` (${r.description})` : ""}
                      {i < (item.rooms || []).length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                <div className="text-left sm:text-right">
                  <div className="text-xs text-muted-foreground uppercase font-medium">Estimated Total</div>
                  <div className="font-display text-lg font-bold text-foreground">{money(item.total, cur)}</div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setViewQuotation(item)} title="View Quotation">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditQuotation(item)} title="Edit Quotation">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDirectDownload(item)}
                    disabled={busyId === item.id}
                    title="Download PDF"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDirectWhatsApp(item)}
                    disabled={busyId === item.id}
                    title="Share PDF via WhatsApp"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConvertQuotation(item)}
                    className="font-medium text-xs text-primary border-primary/30 hover:bg-primary/5"
                  >
                    Convert <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item)}
                    disabled={busyId === item.id}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete Quotation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hidden container for background PDF rendering */}
      {activePdfQuotation && (
        <div style={{ position: "fixed", left: -9999, top: 0, width: 800 }}>
          <QuotationDocument ref={hiddenDocRef} quotation={activePdfQuotation} settings={settings.data} />
        </div>
      )}

      {/* Dialogs */}
      <ViewQuotationDialog
        quotation={viewQuotation}
        settings={settings.data}
        open={!!viewQuotation}
        onClose={() => setViewQuotation(null)}
        onConvert={() => {
          setConvertQuotation(viewQuotation);
          setViewQuotation(null);
        }}
      />

      <EditQuotationDialog
        quotation={editQuotation}
        open={!!editQuotation}
        onClose={() => setEditQuotation(null)}
        onDone={refresh}
      />

      <ConvertQuotationDialog
        quotation={convertQuotation}
        open={!!convertQuotation}
        onClose={() => setConvertQuotation(null)}
        onSuccess={(bookingId) => {
          refresh();
          if (onConverted) onConverted(bookingId);
        }}
      />
    </div>
  );
}
