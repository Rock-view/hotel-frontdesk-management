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
      <div
        ref={ref}
        className="mx-auto max-w-2xl bg-white p-4 sm:p-6 md:p-8 shadow-sm print:shadow-none text-slate-900 border border-slate-200 rounded-xl print:border-none print:p-0"
        style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-200 pb-4 print:flex-row print:justify-between">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            {h.show_logo && h.logo_url && (
              <img src={h.logo_url} alt="" className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 object-contain rounded-md" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg sm:text-xl font-semibold text-slate-900 break-words">{h.name}</div>
              {h.show_address && h.address && (
                <div className="whitespace-pre-line text-xs text-slate-500 break-words">{h.address}</div>
              )}
              <div className="text-xs text-slate-500 break-all sm:break-words">
                {[h.phone, h.email].filter(Boolean).join(" · ")}
              </div>
              {q.gst_bill && h.gstin && <div className="text-xs text-slate-500 font-medium">GSTIN {h.gstin}</div>}
            </div>
          </div>
          <div className="flex flex-row sm:flex-col justify-between items-center sm:items-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 shrink-0 print:border-t-0 print:text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-600">Estimate / Quotation</div>
            <div className="font-display text-lg sm:text-xl font-bold text-slate-900">{q.quotation_no}</div>
            <div className="text-xs text-slate-500">Date: {fmtDate(q.created_at.slice(0, 10))}</div>
          </div>
        </div>

        {/* Notice */}
        <div className="my-3 rounded-md bg-slate-100 p-2 text-center text-xs text-slate-600">
          This estimate is for planning purposes and does not reserve or block rooms. Rates and availability are subject to confirmation.
        </div>

        {/* Guest and Stay Details */}
        <div className="flex flex-col sm:flex-row sm:justify-between gap-3 sm:gap-4 py-3 text-sm border-b border-slate-200 print:flex-row print:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-medium">Guest details</div>
            <div className="font-medium text-slate-900 text-base sm:text-sm">{q.guest_name}</div>
            <div className="text-slate-700 font-mono text-xs sm:text-sm">{q.guest_mobile}</div>
            {q.guest_email && <div className="text-xs text-slate-500 break-all">{q.guest_email}</div>}
          </div>
          <div className="sm:text-right text-xs space-y-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 print:border-t-0 print:text-right">
            <div><span className="text-slate-500">Check-in: </span><strong className="text-slate-900 whitespace-nowrap">{fmtDate(q.check_in)}</strong></div>
            <div><span className="text-slate-500">Check-out: </span><strong className="text-slate-900 whitespace-nowrap">{fmtDate(q.check_out)}</strong></div>
            <div><span className="text-slate-500">Nights: </span><strong className="text-slate-900">{q.nights}</strong> · <span className="text-slate-500">Rooms: </span><strong className="text-slate-900">{rooms.length}</strong></div>
            <div><span className="text-slate-500">Guests: </span><strong className="text-slate-900">{q.adults} Adult{q.adults === 1 ? "" : "s"}{q.children > 0 ? `, ${q.children} Child${q.children === 1 ? "" : "ren"}` : ""}</strong></div>
          </div>
        </div>

        {/* Room Tariff & Line Items */}
        <div className="py-4">
          <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">Room Type & Details</th>
                  <th className="py-2 px-2 text-right whitespace-nowrap">Tariff / Night</th>
                  <th className="py-2 pl-2 text-right whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="py-2.5 pr-2 min-w-[140px]">
                      <div className="font-medium text-slate-900">{r.category_name}</div>
                      {r.description && <div className="text-xs text-slate-500 line-clamp-3 sm:line-clamp-none">{r.description}</div>}
                      <div className="text-xs text-slate-400 mt-0.5">{q.nights} night{q.nights === 1 ? "" : "s"} stay</div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-500 whitespace-nowrap">{money(r.rate, cur)}</td>
                    <td className="py-2.5 pl-2 text-right font-medium text-slate-900 whitespace-nowrap">{money(Number(r.rate) * Number(q.nights), cur)}</td>
                  </tr>
                ))}
                {charges.map((c, i) => (
                  <tr key={`charge-${i}`} className="border-b border-slate-200">
                    <td colSpan={2} className="py-2 pr-2">
                      <span className="text-slate-900">{c.description}</span>
                      {c.taxable === false && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          Non-taxable
                        </span>
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right text-slate-900 whitespace-nowrap">{money(c.amount, cur)}</td>
                  </tr>
                ))}
                {Number(q.discount) > 0 && (
                  <tr className="border-b border-slate-200">
                    <td colSpan={2} className="py-2 pr-2 text-slate-500">Discount</td>
                    <td className="py-2 pl-2 text-right text-slate-900 whitespace-nowrap">− {money(q.discount, cur)}</td>
                  </tr>
                )}
                {q.gst_bill && (
                  <tr className="border-b border-slate-200">
                    <td colSpan={2} className="py-2 pr-2 text-slate-500">{h.tax_label || "GST"} @ {q.tax_rate}%</td>
                    <td className="py-2 pl-2 text-right text-slate-900 whitespace-nowrap">{money(q.tax_amount, cur)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Total Amount Box */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-sky-50 p-3 sm:p-4 border border-sky-200">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">Total Estimated Amount</div>
              <div className="text-xs text-slate-500">Includes all room tariffs and specified charges</div>
            </div>
            <div className="font-display text-xl sm:text-2xl font-bold text-sky-700 whitespace-nowrap">{money(q.total, cur)}</div>
          </div>
        </div>

        {/* Hotel Policies (Following Estimate Visibility Settings) */}
        <div className="mt-6 space-y-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
          {vis.arrival_departure.estimate && (
            <div>
              <div className="font-semibold text-slate-900">Arrival & Departure Policy</div>
              <div>Check-in Time: {h.check_in_time || "12:00 PM"} · Check-out Time: {h.check_out_time || "11:00 AM"}</div>
            </div>
          )}

          {vis.guarantee.estimate && h.terms && (
            <div>
              <div className="font-semibold text-slate-900">Guarantee Policy</div>
              <div className="whitespace-pre-line">{h.terms}</div>
            </div>
          )}

          {vis.photo_id.estimate && h.photo_id_policy && (
            <div>
              <div className="font-semibold text-slate-900">Photo Identity Policy</div>
              <div className="whitespace-pre-line">{h.photo_id_policy}</div>
            </div>
          )}

          {vis.cancellation.estimate && h.cancellation_policy && (
            <div>
              <div className="font-semibold text-slate-900">Cancellation Policy</div>
              <div className="whitespace-pre-line">{h.cancellation_policy}</div>
            </div>
          )}

          {vis.receipt_footer.estimate && h.receipt_footer && (
            <div className="border-t border-slate-200 pt-2 text-center text-slate-500">{h.receipt_footer}</div>
          )}
        </div>

        {/* Sign-off */}
        <div className="mt-8 border-t border-slate-200 pt-4 text-right text-xs">
          <div className="text-slate-500">Thanks & Regards,</div>
          <div className="font-semibold text-slate-900">{h.name}</div>
        </div>
      </div>
    );
  }
);

QuotationDocument.displayName = "QuotationDocument";
