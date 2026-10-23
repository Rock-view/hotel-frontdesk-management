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
      <div ref={ref} className="mx-auto max-w-2xl bg-card p-8 shadow-sm print:shadow-none text-foreground">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div className="flex gap-4">
            {h.show_logo && h.logo_url && <img src={h.logo_url} alt="" className="h-14 w-14 object-contain" />}
            <div>
              <div className="font-display text-xl font-semibold">{h.name}</div>
              {h.show_address && h.address && <div className="whitespace-pre-line text-xs text-muted-foreground">{h.address}</div>}
              <div className="text-xs text-muted-foreground">{[h.phone, h.email].filter(Boolean).join(" · ")}</div>
              {gst && h.gstin && <div className="text-xs text-muted-foreground">GSTIN {h.gstin}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{billTitle(gst)}</div>
            <div className="font-display font-semibold">{b.invoice_no ?? b.booking_no}</div>
            <div className="text-xs text-muted-foreground">{fmtDateTime(b.invoice_issued_at ?? new Date().toISOString())}</div>
          </div>
        </div>

        {/* Guest & Stay Meta */}
        <div className="grid grid-cols-2 gap-4 py-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Billed to</div>
            <div className="font-medium">{b.guests?.name}</div>
            <div>{b.guests?.mobile}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Stay</div>
            <div>{b.booking_no}</div>
            <div>{fmtDate(b.check_in)} → {fmtDate(b.check_out)} ({t.nights} night{t.nights === 1 ? "" : "s"})</div>
          </div>
        </div>

        {/* Charges Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2">
                  <div>{customerRoomCategory(r)} ({t.nights} night{t.nights === 1 ? "" : "s"} × {money(r.rate, cur)})</div>
                  {r.rooms?.room_categories?.description && (
                    <div className="text-xs text-muted-foreground">{r.rooms.room_categories.description}</div>
                  )}
                </td>
                <td className="py-2 text-right">{money(Number(r.rate) * Number(t.nights), cur)}</td>
              </tr>
            ))}
            {charges.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-2">
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
            {Number(b.discount) > 0 && (
              <tr className="border-b">
                <td className="py-2">Discount</td>
                <td className="py-2 text-right">− {money(b.discount, cur)}</td>
              </tr>
            )}
            {gst && (
              <tr className="border-b">
                <td className="py-2">{h.tax_label} @ {b.tax_rate}%</td>
                <td className="py-2 text-right">{money(t.tax_amount, cur)}</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{money(t.total, cur)}</td>
            </tr>
          </tbody>
        </table>

        {/* Payments Table */}
        <h3 className="mb-2 mt-6 text-sm font-semibold">Payments</h3>
        <table className="w-full text-sm">
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-1.5">{p.receipt_no} · {p.method} · {fmtDate(p.received_at.slice(0, 10))}</td>
                <td className="py-1.5 text-right">{p.kind === "refund" ? "− " : ""}{money(p.amount, cur)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">{balance > 0 ? "Balance pending" : "Paid in full"}</td>
              <td className="py-2 text-right">{money(Math.max(0, balance), cur)}</td>
            </tr>
          </tbody>
        </table>

        {/* Policies Section (Following Bill Visibility Settings) */}
        <div className="mt-8 space-y-4 border-t pt-4 text-xs text-muted-foreground">
          {vis.arrival_departure.bill && (
            <div>
              <div className="font-semibold text-foreground">Arrival & Departure Policy</div>
              <div>Check-in Time: {h.check_in_time || "12:00 PM"} · Check-out Time: {h.check_out_time || "11:00 AM"}</div>
            </div>
          )}

          {vis.guarantee.bill && h.terms && (
            <div>
              <div className="font-semibold text-foreground">Guarantee Policy</div>
              <div className="whitespace-pre-line">{h.terms}</div>
            </div>
          )}

          {vis.photo_id.bill && h.photo_id_policy && (
            <div>
              <div className="font-semibold text-foreground">Photo Identity Policy</div>
              <div className="whitespace-pre-line">{h.photo_id_policy}</div>
            </div>
          )}

          {vis.cancellation.bill && h.cancellation_policy && (
            <div>
              <div className="font-semibold text-foreground">Cancellation Policy</div>
              <div className="whitespace-pre-line">{h.cancellation_policy}</div>
            </div>
          )}

          {vis.receipt_footer.bill && h.receipt_footer && (
            <div className="border-t pt-3 text-center">{h.receipt_footer}</div>
          )}
        </div>
      </div>
    );
  }
);

InvoiceDocument.displayName = "InvoiceDocument";
