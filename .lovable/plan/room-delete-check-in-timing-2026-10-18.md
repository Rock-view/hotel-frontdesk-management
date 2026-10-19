# Room delete + check-in timing

## 1. Deleting a room that has past bookings
Old bookings, receipts and invoices point to the room, so the room can't be erased without breaking those bills. Instead:
- **Delete** on a room with no bookings or blocks: removes it completely (as today).
- **Delete** on a room with only finished bookings (checked out / cancelled): the room is **archived** — it disappears from Rooms, New Booking, availability and the Today screen, but old bills still show its number.
- **Delete** on a room with an upcoming or current guest: blocked with a message naming the booking, so the guest isn't lost.
- Owner can see archived rooms under a "Show archived" switch and restore one.

## 2. Check-in only on the arrival day
For a reserved booking:
- Before the check-in date + hotel check-in time (from Settings): only **Modify booking** and **Cancel** are shown. A note reads "Check-in opens on 5 Dec, 12:00".
- From that moment: **Check in** appears (still needs the full balance, unless the owner overrides), along with Modify and Cancel.
- After check-in: only **Check out** (unchanged).
- The same rule is enforced on the server, so check-in cannot be done early from anywhere.

## Technical details
- Migration: add `rooms.archived_at timestamptz`; new SQL function `delete_room(_room_id)` (owner only) that hard-deletes when unused, archives when only closed bookings exist, and raises when active bookings exist. Filter `archived_at is null` in `available_rooms`, rooms lists and new booking.
- `change_booking_status`: reject `checked_in` when `now()` (hotel local time, Asia/Kolkata default) is before `check_in` date + `hotel_settings.check_in_time`. Same-day auto check-in on create is unaffected.
- `bookings.$id.tsx`: compute `checkInOpen` and hide the Check in button until then.
- Extend `run-acceptance.ts`: early check-in rejected; archive vs delete behaviour.
