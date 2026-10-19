# Booking Flow Redesign — My Understanding

## 1. New Booking screen (simplified)

**Guest details** — unchanged (mobile, name, email, returning-guest match).

**Stay** — unchanged (check-in, check-out, adults, children, nights).

**Available rooms — grouped by category**
- Rooms shown under each category heading (e.g. "Suite — 3 free", "Sea View — 2 free").
- Tap a room to select it; multiple rooms, across categories, can be selected in one booking.
- Each selected room uses its own nightly rate (owner can still adjust the rate per room before saving).
- A selected rooms summary shows the rooms, rate, nights and room subtotal.

**Check-in toggle removed**
- Check-in date = today: the guest is checked in automatically on save, and "Advance received" is hidden.
- Check-in date = tomorrow or later: saved as a reservation, and "Advance received" + method are shown.

**Charges section**
- Source options limited to: Walk-in, Travel Agent, Agoda, Make My Trip, Other.
- "GST %" field replaced by a **GST Bill** on/off switch.
  - On: GST is added at the hotel's default rate from Settings, and the bill shows the hotel GSTIN and the title "GST Bill" / "Tax Invoice".
  - Off: no GST is added, there is no GSTIN, and the document is titled "Booking Receipt".
- Discount and notes stay as they are.

## 2. Booking detail screen (after Save)

**Payments panel removed from this screen** — no separate "Record payment / Refund" buttons. Payment is taken through the steps below.

**Extras (optional, multi-select)**
- Checkboxes for: Continental Food, European Food, Extra Bed.
- Each extra has a price set by the owner in Settings. The owner can add new extras later, edit prices, or switch an extra off.
- Receptionists can tick extras but cannot change their prices.
- Picking an extra adds it to the bill (with quantity: per night / per room or a single amount — see questions).

**Guest ID**
- Keep the photo/PDF upload.
- Add manual entry: guest name + ID type + ID number.
- "+ Add another" for more guests (e.g. 2 adults, 2 IDs).

**Bill sharing via WhatsApp**
- After the advance is taken: share the bill with total, advance paid and **balance pending**.
- At arrival: add extras if needed, collect the balance, and share the final bill showing "Paid in full".

**Status buttons**
- Reservation (future date): "Collect balance and check in". Check-in is allowed only after the full balance is paid (unless the owner allows an exception).
- Checked-in guest: only the **Check out** button is shown.

## 3. Modify booking (before final payment)

- Remove rooms from a multi-room booking (e.g. 5 rooms reduced to 3), change dates, or add rooms.
- When rooms are removed or the booking is cancelled, staff choose:
  - No cancellation charge, or
  - A cancellation charge (enter the amount; full amount or partial).
- The bill recalculates automatically. If the guest has paid more than the new total, the screen shows the extra amount to refund or adjust.
- Every change is recorded in the booking history with the reason.

## Technical section

- New `booking_rooms` table (booking ↔ many rooms, per-room rate, removed_at). Double-booking protection moves to this table (exclusion constraint). Existing bookings are backfilled with one row each, and the old `room_id` stays for compatibility.
- New `extras` table (name, price, pricing unit, active), editable by the owner only; `booking_extras` for selections. Seed the 3 defaults.
- Add `gst_bill boolean` to bookings; tax_rate = default rate or 0.
- New `guest_id_entries` (booking, name, id_type, id_number), protected by the existing view_ids permission.
- Update the SQL functions `create_booking` (multi-room), `change_booking_status` (check-in requires paid balance), and new functions `modify_booking_rooms` and `cancel_with_charge`. Payment collection keeps using the existing payment function, so receipts and the audit trail stay intact.
- Invoice/receipt print pages switch title and GSTIN based on gst_bill.
- Rerun and extend the acceptance tests (multi-room overlap, partial cancel, check-in gating).

## Questions to confirm before building

1. Extras pricing: should Food be charged **per person per night**, and Extra Bed **per night**? Or should staff enter a quantity?
2. Same-day booking: since Advance is hidden, should the screen ask for the **full payment at save**, or collect it afterwards on the booking screen?
3. Should the owner still be able to **issue refunds** somewhere (e.g. the Payments page), since the button is removed from the booking screen?
4. Check-in with balance pending: block it completely, or allow the owner / a permitted staff member to override?
