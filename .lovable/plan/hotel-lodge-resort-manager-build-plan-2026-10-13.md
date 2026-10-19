# Hotel, Lodge & Resort Manager — Build Plan

A mobile-first front-desk app for small Indian hotels. One codebase; every hotel gets its own backend, database, logins and file storage. Nothing hotel-specific is written into the code — it all lives in that hotel's settings.

## Important stack note
This project runs on React + TypeScript + Tailwind with Lovable Cloud as the backend (a full Postgres database, auth and private file storage). Server-side work uses built-in server functions instead of separate Edge Functions. Each new hotel = a remix/copy of this project with its own Cloud backend (or your own backend project connected), the same migrations, and the setup wizard. No shared database between hotels.

## Phase 1 (this build) — core you can use daily
1. **First-owner setup**: if no owner exists, a one-time setup screen creates the owner. Public sign-up is closed afterwards; staff are added only by the owner.
2. **Setup wizard & settings**: hotel name, logo, address, phone, email, GSTIN, INR, check-in/out times, receipt numbering prefix, tax rates (configurable, none hardcoded), payment methods, policies, receipt footer.
3. **Rooms**: categories (room, cottage, villa, cabin…), single or bulk creation, capacity, rate, amenities, status (Available / Reserved / Occupied / Cleaning / Maintenance), maintenance and owner blocks by date.
4. **Bookings**: walk-in and advance, guest search (name, mobile, room, booking ID), check-in, check-out, cancel, status history. Double-booking blocked inside the database (check-out day exclusive), not just on screen.
5. **Payments**: advances and multiple instalments, Cash/UPI/Card/Bank/other, extra charges, discounts, refunds as separate reversing entries. Balance = charges + tax − discount − payments. Checkout with balance allowed for authorised users, recorded as an exception.
6. **Receipts & final invoice**: printable/PDF generated on demand from saved records, with a snapshot of hotel details at issue time. Corrections create a new revision with reason, user and time; originals kept.
7. **WhatsApp share**: opens WhatsApp with the guest's number and a receipt summary message (no paid API needed).
8. **Roles**: Owner and Receptionist with toggleable permissions (refunds, corrections, staff, settings, ID access).
9. **Dashboard**: today's arrivals, departures, occupied rooms, collections, outstanding balances.

## Phase 2 (after Phase 1 is approved and tested)
- Guest ID document upload (private storage, role-restricted links)
- Reports: revenue by date/method, occupancy, outstanding dues, CSV export
- Installable app (PWA), demo-data seed, deployment checklist and per-hotel setup guide

## Design direction
Warm, calm hospitality feel: deep teal + sand palette, large touch targets, a bottom tab bar on mobile (Dashboard, Bookings, Rooms, Payments, More), sidebar on desktop.

## Technical details
- Tables: hotel_settings (single row), user_roles + permissions, room_categories, rooms, room_blocks, guests, bookings, booking_status_history, charges, payments, receipts, receipt_revisions, audit_log.
- Double-booking: Postgres exclusion constraint on (room_id, daterange(check_in, check_out, '[)')) for active statuses, plus same for blocks checked in a booking function.
- Receipt numbers from a per-hotel sequence + configurable prefix; receipts store a JSON snapshot.
- RLS on every table via has_role / has_permission security-definer functions; staff creation and owner bootstrap through authenticated server functions using the admin client only after role checks.
- All migrations version-controlled so a new hotel backend gets an identical schema.
- PDF via browser print-to-PDF of a dedicated receipt page (reliable, no server cost).
