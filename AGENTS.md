<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Hotel app rules
- One backend per hotel; all hotel data lives in `hotel_settings` (single row) and tables — never hardcode hotel details. Why: same code is resold to independent hotels.
- Money/status changes go through SQL functions (create_booking_multi, modify_booking, cancel_booking, add_booking_extra, record_payment, change_booking_status, correct_receipt); a trigger blocks direct edits. Why: atomic numbering, audit trail, permission checks.
- A booking holds one or more rooms in booking_rooms; bookings.rate is the sum of active room rates and bookings.room_id is just the first room. Double-booking is enforced by the exclusion constraint on booking_rooms (check-out exclusive) plus block triggers. Why: frontend checks are not trustworthy.
- Receipts are immutable JSON snapshots in receipt_revisions; corrections add a revision. Why: issued documents keep historical details.
- Customer document room labels use the shared category-only formatter and category relationships, with a generic fallback for deleted/uncategorized rooms; internal screens retain number snapshots. Why: customer documents must not expose internal room numbers, and issued payment snapshots remain untouched.
- Public sign-up is disabled; owner bootstrap and staff creation run in server functions (staff.functions.ts). Why: no self-registration as staff.
- Guest ID files live in the private `guest-ids` bucket, indexed by guest_documents; viewing needs the view_ids permission and uses short signed URLs. Why: ID documents are sensitive.
- Acceptance tests live in supabase/tests/run-acceptance.ts (real sign-ins, self-cleaning); rerun after any change to booking/payment SQL. Why: the DB functions are the security boundary.
- Use AmountInput for booking discounts and advances; it keeps editable text separate from numeric values so empty fields and leading zeroes behave consistently.
- Use ActionTooltip for icon-only header actions; shared hover and focus labels keep navigation identifiable.
- Extra prices live in the `extras` table (owner-only writes); staff add them via add_booking_extra so the price comes from the server. Why: receptionists must not set extra prices.
- Rooms are deleted via delete_room (blocked only by active bookings); bookings/booking_rooms keep a room_number snapshot and room_id becomes null. Why: past bills must still show the room.
