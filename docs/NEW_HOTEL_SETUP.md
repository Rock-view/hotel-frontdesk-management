# Setting up Front Desk for a new hotel

Each hotel gets its **own copy of the app and its own backend** (database, logins, file storage). Nothing is shared between hotels, and no code changes are needed per hotel.

## Option A — Lovable (recommended)
1. In Lovable, **Remix** this project. The copy gets its own Lovable Cloud backend.
2. The database structure is applied automatically from `drizzle/migrations/` (all files, in order).
3. Create the private storage bucket `guest-ids` (5 MB limit) if it is missing — ask Lovable: "create the guest-ids bucket".
4. Make sure public sign-up is **off** and email sign-in is **on** (Cloud → Users → Auth settings).
5. Publish. Optionally connect the hotel's domain.
6. Open the app. The first screen asks to **create the owner account** — do this with the hotel owner.
7. Owner completes **Settings** (name, logo, address, GSTIN, tax %, numbering prefixes, payment methods, footer, policies).
8. Owner adds **room categories** and **rooms** (bulk ranges like `101-120`).
9. Optional: owner adds receptionists under **Staff** and sets their permissions.

## Option B — your own backend project
1. Create a new backend (Supabase) project for the hotel.
2. Run every SQL file in `drizzle/migrations/` in filename order (SQL editor or `psql`).
3. Create a **private** storage bucket named `guest-ids`.
4. Auth: enable email/password, **disable sign-ups**.
5. Copy `.env.example` to your host's environment settings and fill in values from that project's API settings. Never commit real values.
6. Deploy the same code; then follow steps 6–9 above.

## Environment variables
| Variable | Where it's used | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | no |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser | no (publishable) |
| `SUPABASE_URL` | server functions | no |
| `SUPABASE_PUBLISHABLE_KEY` | server functions | no |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (owner setup, staff accounts) | **yes — never expose** |

`VITE_` values are baked in at build time: rebuild/redeploy after changing them.

## Demo data (optional, never on a live hotel)
`supabase/seed-demo.sql` adds sample categories and rooms for demos. Run it manually only on a demo backend.

## Go-live checklist
- [ ] Owner account created and password stored safely by the owner
- [ ] Property details, logo and GSTIN checked on a printed receipt
- [ ] Tax rate confirmed with the hotel's accountant
- [ ] Receipt / invoice / booking prefixes set
- [ ] All rooms created with correct rates and max guests
- [ ] Test booking → payment → receipt → WhatsApp share → check-out → invoice, then cancel/refund it
- [ ] Receptionist accounts created with the right permissions
- [ ] App installed on the reception phone ("Add to Home screen")

## Checking you are on the right hotel's backend
Settings → **About this installation** shows the backend ID. Record it for each hotel when you set it up, and compare before doing support work.
If the backend address or key is missing, the app shows "This app is not connected yet" instead of crashing.

## Backups and restore
- Lovable Cloud: daily backups are managed by the platform; contact support to restore to a point in time.
- Own backend: enable scheduled backups in your provider, and keep a periodic `pg_dump` of the database (`pg_dump --no-owner -Fc > hotel-YYYYMMDD.dump`). Restore with `pg_restore --no-owner -d <db> hotel-YYYYMMDD.dump`. Back up the `guest-ids` storage bucket separately.
- Test a restore on a spare backend at least once a year.

## Automated acceptance tests
`bun supabase/tests/run-acceptance.ts` creates throwaway accounts and a test room, checks double-booking, same-day turnover, simultaneous bookings, balances, receipts, refunds, corrections and staff restrictions, then deletes everything it created. Run it on a new hotel's backend before handing it over.

## Known limits
- Offline booking is not supported; the installed app needs internet.
- WhatsApp sharing opens WhatsApp with a prefilled message and receipt link — it does not send automatically.
- Tax/GST handling is configurable but not certified; confirm invoice format with the hotel's accountant.
