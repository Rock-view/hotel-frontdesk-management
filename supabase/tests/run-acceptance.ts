// End-to-end acceptance tests for bookings, payments and permissions.
// Creates throwaway owner/receptionist accounts + a test room, signs in as them,
// exercises the real database functions, then removes everything it created.
// Run: bun supabase/tests/run-acceptance.ts   (needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL!;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tag = Date.now();
const pw = crypto.randomUUID() + "Aa1!";
const results: string[] = [];
let failed = 0;
const check = (name: string, cond: boolean, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); if (!cond) failed++; };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

async function user(email: string, role: "owner" | "receptionist") {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  await admin.from("profiles").insert({ id, full_name: role });
  await admin.from("user_roles").insert({ user_id: id, role });
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  return { id, c };
}

const { data: settingsBefore } = await admin.from("hotel_settings").select("next_booking_no,next_receipt_no,next_invoice_no,check_in_time").eq("id", 1).single();
const owner = await user(`acc-owner-${tag}@example.com`, "owner");
const rec = await user(`acc-rec-${tag}@example.com`, "receptionist");
const { data: room } = await admin.from("rooms").insert({ number: `__TEST-${tag}`, rate: 1000, max_guests: 2 }).select("id").single();
const bookingIds: string[] = [];
const extraRooms: string[] = [];

const book = (c: SupabaseClient, name: string, a: number, b: number, advance = 0) =>
  c.rpc("create_booking_multi", { _guest_id: null as unknown as string, _guest_name: name, _guest_mobile: "9" + String(tag).slice(-9), _guest_email: "",
    _rooms: [{ room_id: room!.id, rate: 1000 }], _check_in: day(a + 1), _check_out: day(b + 1), _adults: 1, _children: 0, _discount: 0, _gst_bill: false,
    _source: "Walk-in", _notes: "", _advance: advance, _advance_method: "Cash" });
const balance = async (id: string) => Number((await admin.rpc("booking_balance", { _booking_id: id })).data);

try {
  const b1 = await book(rec.c, "Guest A", 0, 2, 500);
  check("Create booking with advance", !b1.error, b1.error?.message);
  bookingIds.push(b1.data);
  check("Balance after advance = 1500", (await balance(b1.data)) === 1500, String(await balance(b1.data)));

  const over = await book(rec.c, "Guest B", 1, 3);
  check("Overlapping booking rejected", !!over.error, over.error?.message);

  const [c1, c2] = await Promise.all([book(rec.c, "Race 1", 5, 7), book(owner.c, "Race 2", 6, 8)]);
  check("Simultaneous bookings: only one succeeds", !!c1.error !== !!c2.error);
  for (const r of [c1, c2]) if (r.data) bookingIds.push(r.data);

  const turn = await book(rec.c, "Guest C", 2, 3);
  check("Same-day turnover allowed (check-out day is free)", !turn.error, turn.error?.message);
  if (turn.data) bookingIds.push(turn.data);

  const p2 = await rec.c.rpc("record_payment", { _booking_id: b1.data, _kind: "payment", _amount: 1500, _method: "UPI", _reference: "T1", _note: null });
  check("Second payment recorded", !p2.error, p2.error?.message);
  const { data: pays } = await admin.from("payments").select("receipt_no").eq("booking_id", b1.data);
  check("Each payment has its own receipt", new Set(pays!.map((p) => p.receipt_no)).size === 2);
  check("Balance after full payment = 0", (await balance(b1.data)) === 0);

  const rf = await rec.c.rpc("record_payment", { _booking_id: b1.data, _kind: "refund", _amount: 100, _method: "Cash", _reference: null, _note: null });
  check("Receptionist refund blocked", !!rf.error);
  const cr = await rec.c.rpc("correct_receipt", { _payment_id: p2.data, _method: "Cash", _reference: null, _note: null, _reason: "x" });
  check("Receptionist correction blocked", !!cr.error);
  const re = await rec.c.from("rooms").update({ rate: 1 }).eq("id", room!.id);
  check("Receptionist cannot change room rate", !!re.error);
  const de = await rec.c.from("bookings").update({ discount: 999 }).eq("id", b1.data);
  check("Direct edit of booking amounts blocked", !!de.error);
  const st = await rec.c.from("hotel_settings").update({ name: "hacked" }).eq("id", 1).select();
  check("Receptionist cannot change settings", !!st.error || (st.data ?? []).length === 0);
  const sf = await rec.c.from("profiles").update({ can_refund: true }).eq("id", rec.id).select();
  check("Receptionist cannot grant themselves permissions", !!sf.error || (sf.data ?? []).length === 0);
  const ro = await rec.c.from("user_roles").insert({ user_id: rec.id, role: "owner" });
  check("Receptionist cannot make themselves owner", !!ro.error);

  const of = await owner.c.rpc("record_payment", { _booking_id: b1.data, _kind: "refund", _amount: 100, _method: "Cash", _reference: null, _note: "t" });
  check("Owner refund allowed", !of.error, of.error?.message);
  check("Refund raises balance to 100", (await balance(b1.data)) === 100);
  const oc = await owner.c.rpc("correct_receipt", { _payment_id: p2.data, _method: "Card", _reference: "X", _note: null, _reason: "wrong method" });
  check("Owner correction allowed", !oc.error, oc.error?.message);
  const { data: revs } = await admin.from("receipt_revisions").select("revision,snapshot").eq("payment_id", p2.data).order("revision");
  check("Correction keeps original revision", revs!.length === 2 && (revs![0]!.snapshot as { payment: { method: string } }).payment.method === "UPI");

  const early = await owner.c.rpc("change_booking_status", { _booking_id: b1.data, _to: "checked_in", _note: "" });
  check("Check-in before arrival day is rejected (even for owner)", !!early.error && /opens/i.test(early.error.message), early.error?.message);
  await admin.from("hotel_settings").update({ check_in_time: "00:00" }).eq("id", 1);
  const bt = await book(rec.c, "Guest Today", -1, 0);
  check("Booking for today created", !bt.error, bt.error?.message);
  if (bt.data) bookingIds.push(bt.data);
  const { data: bts } = await admin.from("bookings").select("status").eq("id", bt.data).single();
  check("Same-day booking is checked in on save", bts?.status === "checked_in", bts?.status);
  const rco = await rec.c.rpc("change_booking_status", { _booking_id: bt.data, _to: "checked_out", _note: null });
  check("Receptionist checkout with balance blocked", !!rco.error);
  const oco = await owner.c.rpc("change_booking_status", { _booking_id: bt.data, _to: "checked_out", _note: "ok" });
  const { data: bk } = await admin.from("bookings").select("balance_exception, invoice_no").eq("id", bt.data).single();
  check("Owner checkout with balance recorded as exception", !oco.error && !!bk?.balance_exception && !!bk?.invoice_no);
  const busy = await owner.c.rpc("delete_room", { _room_id: room!.id });
  check("Room with an upcoming booking cannot be deleted", !!busy.error, busy.error?.message);

  if (turn.data) {
    const clash = await rec.c.rpc("modify_booking", { _booking_id: turn.data, _check_in: day(3), _check_out: day(7), _adults: 1, _children: 0, _discount: 0, _gst_bill: false, _remove_rooms: [], _add_rooms: [], _cancel_charge: 0, _reason: "extend" });
    check("Extending into another booking is rejected", !!clash.error, clash.error?.message);
    const ext = await rec.c.rpc("modify_booking", { _booking_id: turn.data, _check_in: day(3), _check_out: day(5), _adults: 1, _children: 0, _discount: 0, _gst_bill: false, _remove_rooms: [], _add_rooms: [], _cancel_charge: 0, _reason: "extend" });
    check("Extending into free nights works", !ext.error, ext.error?.message);
  }

  const { data: room2 } = await admin.from("rooms").insert({ number: `__TEST2-${tag}`, rate: 800, max_guests: 2 }).select("id").single();
  try {
    const multi = await rec.c.rpc("create_booking_multi", { _guest_id: null as unknown as string, _guest_name: "Group", _guest_mobile: "8" + String(tag).slice(-9), _guest_email: "",
      _rooms: [{ room_id: room2!.id, rate: 800 }], _check_in: day(20), _check_out: day(22), _adults: 1, _children: 0, _discount: 0, _gst_bill: false, _source: "Agoda", _notes: "", _advance: 0, _advance_method: "Cash" });
    if (multi.data) bookingIds.push(multi.data);
    const two = await rec.c.rpc("create_booking_multi", { _guest_id: null as unknown as string, _guest_name: "Group2", _guest_mobile: "7" + String(tag).slice(-9), _guest_email: "",
      _rooms: [{ room_id: room!.id, rate: 1000 }, { room_id: room2!.id, rate: 800 }], _check_in: day(21), _check_out: day(23), _adults: 2, _children: 0, _discount: 0, _gst_bill: false, _source: "Other", _notes: "", _advance: 0, _advance_method: "Cash" });
    check("Multi-room booking rejected when one room is taken", !!two.error, two.error?.message);
    const ok = await rec.c.rpc("create_booking_multi", { _guest_id: null as unknown as string, _guest_name: "Group3", _guest_mobile: "6" + String(tag).slice(-9), _guest_email: "",
      _rooms: [{ room_id: room!.id, rate: 1000 }, { room_id: room2!.id, rate: 800 }], _check_in: day(30), _check_out: day(32), _adults: 2, _children: 0, _discount: 0, _gst_bill: false, _source: "Other", _notes: "", _advance: 0, _advance_method: "Cash" });
    check("Two-room booking created, total 3600", !ok.error && (await balance(ok.data)) === 3600, ok.error?.message);
    if (ok.data) {
      bookingIds.push(ok.data);
      const mod = await rec.c.rpc("modify_booking", { _booking_id: ok.data, _check_in: day(30), _check_out: day(32), _adults: 2, _children: 0, _discount: 0, _gst_bill: false, _remove_rooms: [room2!.id], _add_rooms: [], _cancel_charge: 300, _reason: "guest cancelled a room" });
      check("Removing a room with 300 charge leaves 2300", !mod.error && (await balance(ok.data)) === 2300, mod.error?.message);
      const free = await rec.c.rpc("available_rooms", { _from: day(30), _to: day(32) });
      check("Removed room becomes free again", (free.data ?? []).some((r: { id: string }) => r.id === room2!.id));
    }
  } finally {
    await admin.from("booking_charges").delete().in("booking_id", bookingIds);
    extraRooms.push(room2!.id);
  }

  const { data: roomX } = await admin.from("rooms").insert({ number: `__TESTX-${tag}`, rate: 400, max_guests: 1 }).select("id").single();
  const bx = await rec.c.rpc("create_booking_multi", { _guest_id: null as unknown as string, _guest_name: "Past", _guest_mobile: "5" + String(tag).slice(-9), _guest_email: "",
    _rooms: [{ room_id: roomX!.id, rate: 400 }], _check_in: day(0), _check_out: day(1), _adults: 1, _children: 0, _discount: 0, _gst_bill: false, _source: "Walk-in", _notes: "", _advance: 0, _advance_method: "Cash" });
  if (bx.data) { bookingIds.push(bx.data); await owner.c.rpc("change_booking_status", { _booking_id: bx.data, _to: "checked_out", _note: "t" }); }
  const dx = await owner.c.rpc("delete_room", { _room_id: roomX!.id });
  const { data: bxr } = await admin.from("bookings").select("room_number").eq("id", bx.data).single();
  check("Room with only checked-out bookings is deleted; old booking keeps room number", !dx.error && bxr?.room_number === `__TESTX-${tag}`, dx.error?.message);
  const { data: room3 } = await admin.from("rooms").insert({ number: `__TEST3-${tag}`, rate: 500, max_guests: 1 }).select("id").single();
  const del = await owner.c.rpc("delete_room", { _room_id: room3!.id });
  check("Unused room is fully deleted", del.data === "deleted", del.error?.message);
  const recDel = await rec.c.rpc("delete_room", { _room_id: room!.id });
  check("Receptionist cannot delete rooms", !!recDel.error);
  const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
  const ag = await anon.from("guests").select("id").limit(1);
  check("Signed-out visitors see no guest data", (ag.data ?? []).length === 0);
} finally {
  const { data: pays } = await admin.from("payments").select("id").in("booking_id", bookingIds);
  const pids = (pays ?? []).map((p) => p.id);
  const { data: bks } = await admin.from("bookings").select("guest_id").in("id", bookingIds);
  await admin.from("receipt_revisions").delete().in("payment_id", pids);
  await admin.from("audit_log").delete().in("entity_id", [...pids, ...bookingIds]);
  await admin.from("payments").delete().in("id", pids);
  await admin.from("bookings").delete().in("id", bookingIds);
  await admin.from("guests").delete().in("id", (bks ?? []).map((b) => b.guest_id));
  await admin.from("rooms").delete().in("id", [room!.id, ...extraRooms]);
  if (settingsBefore) await admin.from("hotel_settings").update(settingsBefore).eq("id", 1);
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(rec.id);
}
console.log(results.join("\n"));
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exitCode = failed ? 1 : 0;
