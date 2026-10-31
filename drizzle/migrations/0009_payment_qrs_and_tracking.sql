-- Migration: 0009_payment_qrs_and_tracking.sql
-- 1. Add payment_qrs column and max-3 constraint to hotel_settings
-- 2. Add QR lock columns to quotations
-- 3. Add received_in column to payments
-- 4. Create lock_quotation_qr RPC function
-- 5. Extend record_payment, create_booking_multi, and convert_quotation_to_booking without overload ambiguity

-- 1. Hotel Settings: payment QR codes configuration
ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS payment_qrs jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'max_three_payment_qrs'
  ) THEN
    ALTER TABLE public.hotel_settings
      ADD CONSTRAINT max_three_payment_qrs CHECK (jsonb_array_length(payment_qrs) <= 3);
  END IF;
END $$;

-- 2. Quotations: immutable QR lock columns
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS qr_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_code_id text,
  ADD COLUMN IF NOT EXISTS qr_name text,
  ADD COLUMN IF NOT EXISTS qr_image_url text,
  ADD COLUMN IF NOT EXISTS qr_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS qr_locked_by uuid;

-- 3. Payments: receiving account tracking for UPI
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS received_in text;

-- 4. Secure RPC to permanently lock a quotation's payment QR snapshot
CREATE OR REPLACE FUNCTION public.lock_quotation_qr(
  _quotation_id uuid,
  _qr_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  q public.quotations;
  qrs jsonb;
  matched_qr jsonb;
  item jsonb;
BEGIN
  IF NOT public.is_staff(uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Lock quotation row for update
  SELECT * INTO q FROM public.quotations WHERE id = _quotation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  -- If already locked, return existing locked details (immutable snapshot)
  IF q.qr_locked THEN
    RETURN jsonb_build_object(
      'qr_locked', true,
      'qr_name', q.qr_name,
      'qr_image_url', q.qr_image_url,
      'already_locked', true
    );
  END IF;

  -- Validate against trusted hotel_settings configuration
  SELECT payment_qrs INTO qrs FROM public.hotel_settings WHERE id = 1;
  IF qrs IS NOT NULL THEN
    FOR item IN SELECT * FROM jsonb_array_elements(qrs) LOOP
      IF (item->>'id') = _qr_id THEN
        matched_qr := item;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF matched_qr IS NULL THEN
    RAISE EXCEPTION 'Configured QR code not found';
  END IF;

  -- Atomically lock the quotation with trusted snapshot from hotel_settings
  UPDATE public.quotations
  SET qr_locked = true,
      qr_code_id = _qr_id,
      qr_name = matched_qr->>'name',
      qr_image_url = matched_qr->>'image_url',
      qr_locked_at = now(),
      qr_locked_by = uid
  WHERE id = _quotation_id;

  RETURN jsonb_build_object(
    'qr_locked', true,
    'qr_name', matched_qr->>'name',
    'qr_image_url', matched_qr->>'image_url',
    'already_locked', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_quotation_qr(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_quotation_qr(uuid, text) TO service_role;

-- 5. Extend record_payment with _received_in without ambiguous overloads
-- Drop old 6-arg function so there is no ambiguity with a single 7-arg function with default
DROP FUNCTION IF EXISTS public.record_payment(uuid, text, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.record_payment(
  _booking_id uuid,
  _kind text,
  _amount numeric,
  _method text,
  _reference text,
  _note text,
  _received_in text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pid uuid;
  rno text;
  st text;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _kind NOT IN ('payment','refund') THEN RAISE EXCEPTION 'Invalid type'; END IF;
  IF _kind = 'refund' AND NOT public.has_perm(uid,'refund') THEN RAISE EXCEPTION 'You are not allowed to record refunds'; END IF;
  IF COALESCE(_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF COALESCE(trim(_method),'') = '' THEN RAISE EXCEPTION 'Payment method is required'; END IF;
  SELECT status INTO st FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  UPDATE public.hotel_settings SET next_receipt_no = next_receipt_no + 1 WHERE id = 1
    RETURNING receipt_prefix || lpad((next_receipt_no - 1)::text, 5, '0') INTO rno;
  INSERT INTO public.payments(booking_id, kind, amount, method, reference, note, receipt_no, received_in, created_by)
    VALUES (_booking_id, _kind, _amount, trim(_method), NULLIF(trim(_reference),''), NULLIF(trim(_note),''), rno, NULLIF(trim(_received_in),''), uid)
    RETURNING id INTO pid;
  INSERT INTO public.receipt_revisions(payment_id, revision, snapshot, created_by)
    VALUES (pid, 1, public.build_receipt_snapshot(pid), uid);
  INSERT INTO public.audit_log(entity, entity_id, action, new_data, user_id)
    VALUES ('payment', pid, _kind, jsonb_build_object('amount',_amount,'method',_method,'receipt_no',rno,'received_in',_received_in), uid);
  RETURN pid;
END $$;

GRANT EXECUTE ON FUNCTION public.record_payment(uuid, text, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, text, numeric, text, text, text, text) TO service_role;

-- 6. Extend create_booking_multi with _advance_received_in
DROP FUNCTION IF EXISTS public.create_booking_multi(uuid, text, text, text, jsonb, date, date, integer, integer, numeric, boolean, text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.create_booking_multi(
  _guest_id uuid,
  _guest_name text,
  _guest_mobile text,
  _guest_email text,
  _rooms jsonb,
  _check_in date,
  _check_out date,
  _adults integer,
  _children integer,
  _discount numeric,
  _gst_bill boolean,
  _source text,
  _notes text,
  _advance numeric,
  _advance_method text,
  _advance_received_in text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  gid uuid := _guest_id;
  bid uuid;
  bno text;
  st text;
  cap int := 0;
  total_rate numeric := 0;
  first_room uuid;
  rr jsonb;
  maxg int;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  tax numeric;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _rooms IS NULL OR jsonb_array_length(_rooms) = 0 THEN RAISE EXCEPTION 'Choose at least one room'; END IF;
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'Check-out must be after check-in'; END IF;
  IF _check_in < today AND NOT public.has_perm(uid,'backdate') THEN RAISE EXCEPTION 'Check-in date is in the past'; END IF;
  IF COALESCE(_discount,0) > 0 AND NOT public.has_perm(uid,'discount') THEN RAISE EXCEPTION 'You are not allowed to give discounts'; END IF;
  FOR rr IN SELECT * FROM jsonb_array_elements(_rooms) LOOP
    SELECT max_guests INTO maxg FROM public.rooms WHERE id = (rr->>'room_id')::uuid AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF COALESCE((rr->>'rate')::numeric,0) < 0 THEN RAISE EXCEPTION 'Rate cannot be negative'; END IF;
    cap := cap + maxg; total_rate := total_rate + COALESCE((rr->>'rate')::numeric,0);
    first_room := COALESCE(first_room, (rr->>'room_id')::uuid);
  END LOOP;
  IF gid IS NULL THEN
    IF COALESCE(trim(_guest_name),'') = '' OR COALESCE(trim(_guest_mobile),'') = '' THEN RAISE EXCEPTION 'Guest name and mobile are required'; END IF;
    INSERT INTO public.guests(name, mobile, email) VALUES (trim(_guest_name), trim(_guest_mobile), NULLIF(trim(_guest_email),'')) RETURNING id INTO gid;
  END IF;
  SELECT CASE WHEN COALESCE(_gst_bill,false) THEN default_tax_rate ELSE 0 END INTO tax FROM public.hotel_settings WHERE id = 1;
  UPDATE public.hotel_settings SET next_booking_no = next_booking_no + 1 WHERE id = 1
    RETURNING booking_prefix || lpad((next_booking_no - 1)::text, 5, '0') INTO bno;
  st := CASE WHEN _check_in <= today THEN 'checked_in' ELSE 'reserved' END;
  BEGIN
    INSERT INTO public.bookings(booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, tax_rate, gst_bill, discount, source, notes, status, actual_check_in, created_by, updated_by)
    VALUES (bno, gid, first_room, _check_in, _check_out, COALESCE(_adults,1), COALESCE(_children,0), total_rate, COALESCE(tax,0), COALESCE(_gst_bill,false), COALESCE(_discount,0), COALESCE(_source,'Walk-in'), _notes,
      st, CASE WHEN st = 'checked_in' THEN now() END, uid, uid)
    RETURNING id INTO bid;
    INSERT INTO public.booking_rooms(booking_id, room_id, rate, check_in, check_out)
      SELECT bid, (x->>'room_id')::uuid, COALESCE((x->>'rate')::numeric,0), _check_in, _check_out FROM jsonb_array_elements(_rooms) x;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'One of the selected rooms is already booked for some of these dates';
  END;
  INSERT INTO public.booking_status_history(booking_id, from_status, to_status, changed_by) VALUES (bid, NULL, st, uid);
  IF st = 'reserved' AND COALESCE(_advance,0) > 0 THEN
    PERFORM public.record_payment(bid, 'payment', _advance, _advance_method, NULL, 'Advance', _advance_received_in);
  END IF;
  RETURN bid;
END $$;

GRANT EXECUTE ON FUNCTION public.create_booking_multi(uuid, text, text, text, jsonb, date, date, integer, integer, numeric, boolean, text, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_multi(uuid, text, text, text, jsonb, date, date, integer, integer, numeric, boolean, text, text, numeric, text, text) TO service_role;

-- 7. Extend convert_quotation_to_booking with _advance_received_in
DROP FUNCTION IF EXISTS public.convert_quotation_to_booking(uuid, jsonb, numeric, text, text);

CREATE OR REPLACE FUNCTION public.convert_quotation_to_booking(
  _quotation_id uuid,
  _rooms jsonb,
  _advance numeric DEFAULT 0,
  _advance_method text DEFAULT 'Cash',
  _notes text DEFAULT NULL,
  _advance_received_in text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  q public.quotations;
  bid uuid;
  notes_text text;
  chg jsonb;
  assigned_room_rate numeric;
  quoted_room_rate numeric;
  final_total numeric;
BEGIN
  IF NOT public.is_staff(uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Lock quotation row to prevent concurrent duplicate conversions
  SELECT * INTO q FROM public.quotations WHERE id = _quotation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found or already converted';
  END IF;

  -- Verify assigned room tariff against quoted tariff
  SELECT COALESCE(sum((r->>'rate')::numeric), 0) INTO assigned_room_rate FROM jsonb_array_elements(_rooms) r;
  SELECT COALESCE(sum((r->>'rate')::numeric), 0) INTO quoted_room_rate FROM jsonb_array_elements(q.rooms) r;
  IF assigned_room_rate <> quoted_room_rate THEN
    RAISE EXCEPTION 'Room tariff mismatch (quoted %, assigned %). Please edit the quotation if price needs to be revised.', quoted_room_rate, assigned_room_rate;
  END IF;

  notes_text := CASE
    WHEN _notes IS NOT NULL AND trim(_notes) <> '' THEN '[Converted from ' || q.quotation_no || '] ' || trim(_notes)
    WHEN q.notes IS NOT NULL AND trim(q.notes) <> '' THEN '[Converted from ' || q.quotation_no || '] ' || trim(q.notes)
    ELSE 'Converted from quotation ' || q.quotation_no
  END;

  -- Call the existing multi-room booking creation function with _advance_received_in
  bid := public.create_booking_multi(
    NULL,
    q.guest_name,
    q.guest_mobile,
    q.guest_email,
    _rooms,
    q.check_in,
    q.check_out,
    q.adults,
    q.children,
    q.discount,
    q.gst_bill,
    COALESCE(q.source, 'Walk-in'),
    notes_text,
    COALESCE(_advance, 0),
    COALESCE(_advance_method, 'Cash'),
    _advance_received_in
  );

  -- Migrate quotation charges to booking_charges
  FOR chg IN SELECT * FROM jsonb_array_elements(q.charges) LOOP
    INSERT INTO public.booking_charges(booking_id, description, amount, taxable, created_by)
    VALUES (
      bid,
      chg->>'description',
      (chg->>'amount')::numeric,
      COALESCE((chg->>'taxable')::boolean, true),
      uid
    );
  END LOOP;

  -- Recompute tax and rate if quotation was with GST
  IF q.gst_bill THEN
    SELECT total INTO final_total FROM public.booking_totals WHERE booking_id = bid;
  END IF;

  -- Atomically remove quotation record
  DELETE FROM public.quotations WHERE id = _quotation_id;

  RETURN bid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quotation_to_booking(uuid, jsonb, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_booking(uuid, jsonb, numeric, text, text, text) TO service_role;

-- 8. Reload PostgREST schema cache so new columns & functions are immediately available
NOTIFY pgrst, 'reload schema';

