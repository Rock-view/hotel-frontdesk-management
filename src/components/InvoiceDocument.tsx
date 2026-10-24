import React from "react";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { billTitle } from "@/lib/booking";
import { customerRoomCategory } from "@/lib/customer-rooms";
import { getPolicyVisibility } from "@/lib/policies";

export type InvoiceDocumentProps = {
  booking: any;
  totals: any;
  charges: any[];
  payments: any[];
  rooms: any[];
  settings: any;
};

export const InvoiceDocument = React.forwardRef<HTMLDivElement, InvoiceDocumentProps>(
  ({ booking: b, totals: t, charges, payments, rooms, settings: h }, ref) => {
    if (!b || !t || !h) return null;

    const cur = h.currency || "INR";
    const balance = Number(t.total) - Number(t.paid) + Number(t.refunded);
    const gst = b.gst_bill;
    const vis = getPolicyVisibility(h.policy_visibility);

    return (
      <div
        ref={ref}
        className="mx-auto max-w-2xl bg-white p-8 shadow-sm print:shadow-none text-slate-900 border border-slate-200 rounded-xl print:border-none"
        style={{ backgroundColor: "#ffffff", color: "#0f172a" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div className="flex gap-4">
            {h.show_logo && h.logo_url && <img src={h.logo_url} alt="" className="h-14 w-14 object-contain" />}
            <div>
              <div className="font-display text-xl font-semibold text-slate-900">{h.name}</div>
              {h.show_address && h.address && <div className="whitespace-pre-line text-xs text-slate-500">{h.address}</div>}
              <div className="text-xs text-slate-500">{[h.phone, h.email].filter(Boolean).join(" · ")}</div>
              {gst && h.gstin && <div className="text-xs text-slate-500">GSTIN {h.gstin}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">{billTitle(gst)}</div>
            <div className="font-display font-semibold text-slate-900">{b.invoice_no ?? b.booking_no}</div>
            <div className="text-xs text-slate-500">{fmtDateTime(b.invoice_issued_at ?? new Date().toISOString())}</div>
          </div>
        </div>

        {/* Guest & Stay Meta */}
        <div className="grid grid-cols-2 gap-4 py-4 text-sm border-b border-slate-200">
          <div>
            <div className="text-xs text-slate-500">Billed to</div>
            <div className="font-medium text-slate-900">{b.guests?.name}</div>
            <div className="text-slate-700">{b.guests?.mobile}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Stay</div>
            <div className="font-medium text-slate-900">{b.booking_no}</div>
            <div className="text-slate-600">{fmtDate(b.check_in)} → {fmtDate(b.check_out)} ({t.nights} night{t.nights === 1 ? "" : "s"})</div>
          </div>
        </div>

        {/* Charges Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id} className="border-b border-slate-200">
                <td className="py-2">
                  <div className="text-slate-900">{customerRoomCategory(r)} ({t.nights} night{t.nights === 1 ? "" : "s"} × {money(r.rate, cur)})</div>
                  {r.rooms?.room_categories?.description && (
                    <div className="text-xs text-slate-500">{r.rooms.room_categories.description}</div>
                  )}
                </td>
                <td className="py-2 text-right font-medium text-slate-900">{money(Number(r.rate) * Number(t.nights), cur)}</td>
              </tr>
            ))}
            {charges.map((c) => (
              <tr key={c.id} className="border-b border-slate-200">
                <td className="py-2">
                  <span className="text-slate-900">{c.description}</span>
                  {c.taxable === false && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      Non-taxable
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-slate-900">{money(c.amount, cur)}</td>
              </tr>
            ))}
            {Number(b.discount) > 0 && (
              <tr className="border-b border-slate-200">
                <td className="py-2 text-slate-500">Discount</td>
                <td className="py-2 text-right text-slate-900">− {money(b.discount, cur)}</td>
              </tr>
            )}
            {gst && (
              <tr className="border-b border-slate-200">
                <td className="py-2 text-slate-500">{h.tax_label} @ {b.tax_rate}%</td>
                <td className="py-2 text-right text-slate-900">{money(t.tax_amount, cur)}</td>
              </tr>
            )}
            <tr className="font-semibold text-slate-900">
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{money(t.total, cur)}</td>
            </tr>
          </tbody>
        </table>

        {/* Payments Table */}
        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-900">Payments</h3>
        <table className="w-full text-sm">
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-200 text-slate-700">
                <td className="py-1.5">{p.receipt_no} · {p.method} · {fmtDate(p.received_at.slice(0, 10))}</td>
                <td className="py-1.5 text-right font-medium">{p.kind === "refund" ? "− " : ""}{money(p.amount, cur)}</td>
              </tr>
            ))}
            <tr className="font-semibold text-slate-900">
              <td className="py-2">{balance > 0 ? "Balance pending" : "Paid in full"}</td>
              <td className="py-2 text-right">{money(Math.max(0, balance), cur)}</td>
            </tr>
          </tbody>
        </table>

        {/* Policies Section (Following Bill Visibility Settings) */}
        <div className="mt-8 space-y-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
          {vis.arrival_departure.bill && (
            <div>
              <div className="font-semibold text-slate-900">Arrival & Departure Policy</div>
              <div>Check-in Time: {h.check_in_time || "12:00 PM"} · Check-out Time: {h.check_out_time || "11:00 AM"}</div>
            </div>
          )}

          {vis.guarantee.bill && h.terms && (
            <div>
              <div className="font-semibold text-slate-900">Guarantee Policy</div>
              <div className="whitespace-pre-line">{h.terms}</div>
            </div>
          )}

          {vis.photo_id.bill && h.photo_id_policy && (
            <div>
              <div className="font-semibold text-slate-900">Photo Identity Policy</div>
              <div className="whitespace-pre-line">{h.photo_id_policy}</div>
            </div>
          )}

          {vis.cancellation.bill && h.cancellation_policy && (
            <div>
              <div className="font-semibold text-slate-900">Cancellation Policy</div>
              <div className="whitespace-pre-line">{h.cancellation_policy}</div>
            </div>
          )}

          {vis.receipt_footer.bill && h.receipt_footer && (
            <div className="border-t border-slate-200 pt-3 text-center text-slate-500">{h.receipt_footer}</div>
          )}
        </div>
      </div>
    );
  }
);

InvoiceDocument.displayName = "InvoiceDocument";
