# Direct room delete (no archive)

## Your questions
- **How many devices at once:** there is no limit. Each staff login works on several phones and computers at the same time.
- **Do bookings show on other devices:** yes, because every device reads the same hotel data. Right now another device shows the change when its screen reloads: when you open a page, come back to the app, or refresh. It does not appear instantly while you watch. (Optional extra below.)

## What changes
- **Delete** removes the room immediately. The room no longer appears in Rooms, New Booking or availability, and no "archived" list remains.
- Old bookings, invoices and receipts for that room keep showing its room number ("Room 101"), so past bills and reports stay correct.
- Deleting is still blocked while a room has a current or upcoming guest, so an active booking is never left without a room. The message names the booking.
- Blocked dates for the deleted room are removed with it.
- The "Show archived rooms" switch and Restore button are removed.

## Optional: live updates
Bookings, room status and payments could refresh by themselves on every open device within a second or two. Ask if you want this; it isn't part of the plan above.

## Technical details
- Migration: add `room_number text` to `bookings` and `booking_rooms` and fill it from the rooms table. A trigger sets it on new rows. Make `room_id` nullable on both tables, with the foreign keys set to `ON DELETE SET NULL` (the approval prompt appears because a NOT NULL constraint is removed). Set `room_blocks` to `ON DELETE CASCADE`. Rewrite `delete_room` so it always deletes the row after checking for active bookings. Change archived rooms back to normal rooms; the `archived_at` column stays but is marked as no longer used.
- Overlap exclusion and block triggers skip rows with a null room.
- UI: invoices, booking detail, the bookings list, payments, reports and the dashboard use `rooms?.number ?? room_number`. Remove the archive UI from rooms.tsx.
- Acceptance test: deleting a room that only has checked-out bookings succeeds, and the old booking still shows the room number.
