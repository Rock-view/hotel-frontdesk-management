import React from "react";
import { fmtDate, money } from "@/lib/format";
import { getPolicyVisibility } from "@/lib/policies";
import type { Quotation } from "@/lib/quotations";

export type QuotationDocumentProps = {
  quotation: Quotation;
  settings: any;
};

export const QuotationDocument = React.forwardRef<HTMLDivElement, QuotationDocumentProps>(
  ({ quotation: q, settings: h }, ref) => {
    if (!q || !h) return null;

    const cur = h.currency || "INR";
    const vis = getPolicyVisibility(h.policy_visibility);

    // Group rooms by category if multiple
    const rooms = q.rooms || [];
    const charges = q.charges || [];

    return (
      <div ref={ref} className="mx-auto max-w-2xl bg-card p-8 shadow-sm print:shadow-none text-foreground border rounded-xl print:border-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div className="flex gap-4">
            {h.show_logo && h.logo_url && <img src={h.logo_url} alt="" className="h-14 w-14 object-contain" />}
            <div>
              <div className="font-display text-xl font-semibold">{h.name}</div>
              {h.show_address && h.address && <div className="whitespace-pre-line text-xs text-muted-foreground">{h.address}</div>}
              <div className="text-xs text-muted-foreground">{[h.phone, h.email].filter(Boolean).join(" · ")}</div>
              {q.gst_bill && h.gstin && <div className="text-xs text-muted-foreground">GSTIN {h.gstin}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Estimate / Quotation</div>
            <div className="font-display text-lg font-semibold">{q.quotation_no}</div>
            <div className="text-xs text-muted-foreground">Date: {fmtDate(q.created_at.slice(0, 10))}</div>
          </div>
        </div>

        {/* Notice */}
        <div className="my-3 rounded-md bg-muted/60 p-2 text-center text-xs text-muted-foreground">
          This estimate is for planning purposes and does not reserve or block rooms. Rates and availability are subject to confirmation.
        </div>

        {/* Guest and Stay Details */}
        <div className="grid grid-cols-2 gap-4 py-3 text-sm border-b">
          <div>
            <div className="text-xs text-muted-foreground">Guest details</div>
            <div className="font-medium">{q.guest_name}</div>
            <div>{q.guest_mobile}</div>
            {q.guest_email && <div className="text-xs text-muted-foreground">{q.guest_email}</div>}
          </div>
          <div className="text-right text-xs space-y-1">
            <div><span className="text-muted-foreground">Check-in:</span> <strong className="text-foreground">{fmtDate(q.check_in)}</strong></div>
            <div><span className="text-muted-foreground">Check-out:</span> <strong className="text-foreground">{fmtDate(q.check_out)}</strong></div>
            <div><span className="text-muted-foreground">Nights:</span> <strong className="text-foreground">{q.nights}</strong> · <span className="text-muted-foreground">Rooms:</span> <strong className="text-foreground">{rooms.length}</strong></div>
            <div><span className="text-muted-foreground">Guests:</span> <strong className="text-foreground">{q.adults} Adult{q.adults === 1 ? "" : "s"}{q.children > 0 ? `, ${q.children} Child${q.children === 1 ? "" : "ren"}` : ""}</strong></div>
          </div>
        </div>

        {/* Room Tariff & Line Items */}
        <div className="py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Room Type & Details</th>
                <th className="py-2 text-right">Tariff / Night</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2.5">
                    <div className="font-medium">{r.category_name}</div>
                    {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                    <div className="text-xs text-muted-foreground">{q.nights} night{q.nights === 1 ? "" : "s"} stay</div>
                  </td>
                  <td className="py-2.5 text-right text-muted-foreground">{money(r.rate, cur)}</td>
                  <td className="py-2.5 text-right font-medium">{money(Number(r.rate) * Number(q.nights), cur)}</td>
                </tr>
              ))}
              {charges.map((c, i) => (
                <tr key={`charge-${i}`} className="border-b">
                  <td colSpan={2} className="py-2">
                    <span>{c.description}</span>
                    {c.taxable === false && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Non-taxable
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">{money(c.amount, cur)}</td>
                </tr>
              ))}
              {Number(q.discount) > 0 && (
                <tr className="border-b">
                  <td colSpan={2} className="py-2 text-muted-foreground">Discount</td>
                  <td className="py-2 text-right">− {money(q.discount, cur)}</td>
                </tr>
              )}
              {q.gst_bill && (
                <tr className="border-b">
                  <td colSpan={2} className="py-2 text-muted-foreground">{h.tax_label || "GST"} @ {q.tax_rate}%</td>
                  <td className="py-2 text-right">{money(q.tax_amount, cur)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Total Amount Box */}
          <div className="mt-4 flex items-center justify-between rounded-lg bg-primary/5 p-4 border border-primary/20">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Estimated Amount</div>
              <div className="text-xs text-muted-foreground">Includes all room tariffs and specified charges</div>
            </div>
            <div className="font-display text-2xl font-bold text-primary">{money(q.total, cur)}</div>
          </div>
        </div>

        {/* Hotel Policies (Following Estimate Visibility Settings) */}
        <div className="mt-6 space-y-4 border-t pt-4 text-xs text-muted-foreground">
          {vis.arrival_departure.estimate && (
            <div>
              <div className="font-semibold text-foreground">Arrival & Departure Policy</div>
              <div>Check-in Time: {h.check_in_time || "12:00 PM"} · Check-out Time: {h.check_out_time || "11:00 AM"}</div>
            </div>
          )}

          {vis.guarantee.estimate && h.terms && (
            <div>
              <div className="font-semibold text-foreground">Guarantee Policy</div>
              <div className="whitespace-pre-line">{h.terms}</div>
            </div>
          )}

          {vis.photo_id.estimate && h.photo_id_policy && (
            <div>
              <div className="font-semibold text-foreground">Photo Identity Policy</div>
              <div className="whitespace-pre-line">{h.photo_id_policy}</div>
            </div>
          )}

          {vis.cancellation.estimate && h.cancellation_policy && (
            <div>
              <div className="font-semibold text-foreground">Cancellation Policy</div>
              <div className="whitespace-pre-line">{h.cancellation_policy}</div>
            </div>
          )}

          {vis.receipt_footer.estimate && h.receipt_footer && (
            <div className="border-t pt-2 text-center">{h.receipt_footer}</div>
          )}
        </div>

        {/* Sign-off */}
        <div className="mt-8 border-t pt-4 text-right text-xs">
          <div className="text-muted-foreground">Thanks & Regards,</div>
          <div className="font-semibold text-foreground">{h.name}</div>
        </div>
      </div>
    );
  }
);

QuotationDocument.displayName = "QuotationDocument";
