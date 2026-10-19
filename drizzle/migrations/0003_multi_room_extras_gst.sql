ALTER TABLE public.bookings ADD COLUMN gst_bill boolean NOT NULL DEFAULT true;
SELECT set_config('app.via_fn','on', true);
UPDATE public.bookings SET gst_bill = (tax_rate > 0);
SELECT set_config('app.via_fn','off', true);

CREATE TABLE public.booking_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  rate numeric NOT NULL DEFAULT 0,
  check_in date NOT NULL,
  check_out date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.booking_rooms TO authenticated;
GRANT ALL ON public.booking_rooms TO service_role;
ALTER TABLE public.booking_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read" ON public.booking_rooms FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX booking_rooms_booking_idx ON public.booking_rooms(booking_id);

INSERT INTO public.booking_rooms(booking_id, room_id, rate, check_in, check_out, active)
  SELECT id, room_id, rate, check_in, check_out, status <> 'cancelled' FROM public.bookings;

ALTER TABLE public.bookings DROP CONSTRAINT no_double_booking;
ALTER TABLE public.booking_rooms ADD CONSTRAINT no_double_room_booking
  EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out, '[)') WITH &&) WHERE (active);

CREATE OR REPLACE FUNCTION public.booking_rooms_vs_blocks() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.active AND EXISTS (SELECT 1 FROM public.room_blocks b WHERE b.room_id = NEW.room_id
     AND daterange(b.start_date,b.end_date,'[)') && daterange(NEW.check_in,NEW.check_out,'[)')) THEN
    RAISE EXCEPTION 'Room is blocked for maintenance or by the owner on these dates';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_rooms_blocks BEFORE INSERT OR UPDATE ON public.booking_rooms FOR EACH ROW EXECUTE FUNCTION public.booking_rooms_vs_blocks();

CREATE OR REPLACE FUNCTION public.sync_booking_rooms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.booking_rooms SET check_in = NEW.check_in, check_out = NEW.check_out,
    active = (NEW.status <> 'cancelled' AND removed_at IS NULL)
  WHERE booking_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_sync_rooms AFTER UPDATE OF check_in, check_out, status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_booking_rooms();

CREATE OR REPLACE FUNCTION public.check_booking_vs_blocks() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.check_block_vs_bookings() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.booking_rooms k WHERE k.room_id = NEW.room_id AND k.active
     AND daterange(k.check_in,k.check_out,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) THEN
    RAISE EXCEPTION 'There are active bookings for this room on these dates';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.available_rooms(_from date, _to date) RETURNS SETOF public.rooms LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.* FROM public.rooms r WHERE r.active AND r.housekeeping <> 'maintenance'
   AND NOT EXISTS (SELECT 1 FROM public.booking_rooms b WHERE b.room_id = r.id AND b.active
                   AND daterange(b.check_in,b.check_out,'[)') && daterange(_from,_to,'[)'))
   AND NOT EXISTS (SELECT 1 FROM public.room_blocks k WHERE k.room_id = r.id AND daterange(k.start_date,k.end_date,'[)') && daterange(_from,_to,'[)'))
  ORDER BY r.number
$$;

CREATE OR REPLACE FUNCTION public.build_receipt_snapshot(_payment_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'hotel', to_jsonb(h) - 'next_booking_no' - 'next_receipt_no' - 'next_invoice_no',
    'payment', to_jsonb(p),
    'booking', jsonb_build_object('booking_no', b.booking_no, 'created_at', b.created_at, 'check_in', b.check_in, 'check_out', b.check_out, 'status', b.status, 'gst_bill', b.gst_bill),
    'guest', jsonb_build_object('name', g.name, 'mobile', g.mobile),
    'room', COALESCE((SELECT string_agg(r.number, ', ' ORDER BY r.number) FROM public.booking_rooms br JOIN public.rooms r ON r.id = br.room_id WHERE br.booking_id = b.id AND br.removed_at IS NULL), (SELECT number FROM public.rooms WHERE id = b.room_id)),
    'totals', to_jsonb(t),
    'paid_to_date', (SELECT COALESCE(sum(CASE WHEN kind='payment' THEN amount ELSE -amount END),0) FROM public.payments x WHERE x.booking_id = b.id AND x.received_at <= p.received_at),
    'balance', t.total - t.paid + t.refunded
  )
  FROM public.payments p JOIN public.bookings b ON b.id = p.booking_id
  JOIN public.guests g ON g.id = b.guest_id
  JOIN public.booking_totals t ON t.booking_id = b.id
  CROSS JOIN public.hotel_settings h WHERE p.id = _payment_id
$$;

CREATE TABLE public.extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'per_night',
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extras_unit_chk CHECK (unit IN ('per_night','per_person_night','once')),
  CONSTRAINT extras_price_chk CHECK (price >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extras TO authenticated;
GRANT ALL ON public.extras TO service_role;
ALTER TABLE public.extras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read" ON public.extras FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "owner write" ON public.extras FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

ALTER TABLE public.booking_charges ADD COLUMN extra_id uuid REFERENCES public.extras(id) ON DELETE SET NULL;
ALTER TABLE public.booking_charges ADD COLUMN qty integer NOT NULL DEFAULT 1;

CREATE TABLE public.guest_id_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  id_type text NOT NULL DEFAULT 'Aadhaar',
  id_number text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.guest_id_entries TO authenticated;
GRANT ALL ON public.guest_id_entries TO service_role;
ALTER TABLE public.guest_id_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "id viewers read" ON public.guest_id_entries FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.has_perm(auth.uid(),'view_ids'));
CREATE POLICY "staff add" ON public.guest_id_entries FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "owner delete" ON public.guest_id_entries FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.create_booking_multi(_guest_id uuid, _guest_name text, _guest_mobile text, _guest_email text,
  _rooms jsonb, _check_in date, _check_out date, _adults integer, _children integer, _discount numeric, _gst_bill boolean,
  _source text, _notes text, _advance numeric, _advance_method text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); gid uuid := _guest_id; bid uuid; bno text; st text; cap int := 0; total_rate numeric := 0;
  first_room uuid; rr jsonb; maxg int; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; tax numeric;
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
  IF COALESCE(_adults,1) + COALESCE(_children,0) > cap THEN RAISE EXCEPTION 'Selected rooms allow at most % guests', cap; END IF;
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
    PERFORM public.record_payment(bid, 'payment', _advance, _advance_method, NULL, 'Advance');
  END IF;
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.modify_booking(_booking_id uuid, _check_in date, _check_out date, _adults integer, _children integer,
  _discount numeric, _gst_bill boolean, _remove_rooms uuid[], _add_rooms jsonb, _cancel_charge numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b public.bookings; cap int; total_rate numeric; first_room uuid; tax numeric;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.status NOT IN ('reserved','checked_in') THEN RAISE EXCEPTION 'Only active bookings can be changed'; END IF;
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'Check-out must be after check-in'; END IF;
  IF b.status = 'checked_in' AND _check_in <> b.check_in THEN RAISE EXCEPTION 'Check-in date cannot change after the guest has checked in'; END IF;
  IF _check_in < (now() AT TIME ZONE 'Asia/Kolkata')::date AND _check_in <> b.check_in AND NOT public.has_perm(uid,'backdate') THEN RAISE EXCEPTION 'Check-in date is in the past'; END IF;
  IF COALESCE(_discount,0) <> b.discount AND NOT public.has_perm(uid,'discount') THEN RAISE EXCEPTION 'You are not allowed to change discounts'; END IF;
  IF COALESCE(_cancel_charge,0) < 0 THEN RAISE EXCEPTION 'Charge cannot be negative'; END IF;
  BEGIN
    UPDATE public.booking_rooms SET removed_at = now(), removed_reason = _reason, active = false
      WHERE booking_id = _booking_id AND removed_at IS NULL AND room_id = ANY(COALESCE(_remove_rooms,'{}'));
    IF _add_rooms IS NOT NULL AND jsonb_array_length(_add_rooms) > 0 THEN
      INSERT INTO public.booking_rooms(booking_id, room_id, rate, check_in, check_out)
        SELECT _booking_id, (x->>'room_id')::uuid, COALESCE((x->>'rate')::numeric,0), _check_in, _check_out
        FROM jsonb_array_elements(_add_rooms) x JOIN public.rooms r ON r.id = (x->>'room_id')::uuid AND r.active;
    END IF;
    SELECT sum(br.rate), sum(r.max_guests) INTO total_rate, cap
      FROM public.booking_rooms br JOIN public.rooms r ON r.id = br.room_id WHERE br.booking_id = _booking_id AND br.removed_at IS NULL;
    IF total_rate IS NULL THEN RAISE EXCEPTION 'A booking needs at least one room. Use Cancel booking instead.'; END IF;
    IF COALESCE(_adults,1) + COALESCE(_children,0) > cap THEN RAISE EXCEPTION 'Rooms allow at most % guests', cap; END IF;
    SELECT br.room_id INTO first_room FROM public.booking_rooms br WHERE br.booking_id = _booking_id AND br.removed_at IS NULL ORDER BY br.created_at LIMIT 1;
    SELECT CASE WHEN COALESCE(_gst_bill,false) THEN CASE WHEN b.gst_bill AND b.tax_rate > 0 THEN b.tax_rate ELSE default_tax_rate END ELSE 0 END INTO tax FROM public.hotel_settings WHERE id = 1;
    PERFORM set_config('app.via_fn','on', true);
    UPDATE public.bookings SET room_id = first_room, rate = total_rate, check_in = _check_in, check_out = _check_out,
      adults = COALESCE(_adults,1), children = COALESCE(_children,0), discount = COALESCE(_discount,0), gst_bill = COALESCE(_gst_bill,false), tax_rate = tax
      WHERE id = _booking_id;
    PERFORM set_config('app.via_fn','off', true);
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'A room is already booked for some of these dates';
  END;
  IF COALESCE(_cancel_charge,0) > 0 THEN
    INSERT INTO public.booking_charges(booking_id, description, amount, taxable, created_by) VALUES (_booking_id, 'Cancellation charge — ' || _reason, _cancel_charge, false, uid);
  END IF;
  INSERT INTO public.audit_log(entity, entity_id, action, old_data, new_data, reason, user_id)
    VALUES ('booking', _booking_id, 'modify', to_jsonb(b), (SELECT to_jsonb(x) FROM public.bookings x WHERE id = _booking_id), _reason, uid);
  INSERT INTO public.booking_status_history(booking_id, from_status, to_status, note, changed_by) VALUES (_booking_id, b.status, b.status, 'Modified: ' || _reason, uid);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_booking(_booking_id uuid, _charge numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b public.bookings;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF COALESCE(_charge,0) < 0 THEN RAISE EXCEPTION 'Charge cannot be negative'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.status <> 'reserved' THEN RAISE EXCEPTION 'Only reserved bookings can be cancelled'; END IF;
  PERFORM set_config('app.via_fn','on', true);
  UPDATE public.bookings SET status = 'cancelled', rate = 0, discount = 0, notes = concat_ws(E'\n', notes, 'Cancelled: ' || _reason) WHERE id = _booking_id;
  PERFORM set_config('app.via_fn','off', true);
  UPDATE public.booking_status_history SET note = _reason, changed_by = uid
    WHERE id = (SELECT id FROM public.booking_status_history WHERE booking_id = _booking_id ORDER BY changed_at DESC LIMIT 1);
  IF COALESCE(_charge,0) > 0 THEN
    INSERT INTO public.booking_charges(booking_id, description, amount, taxable, created_by) VALUES (_booking_id, 'Cancellation charge', _charge, false, uid);
  END IF;
  INSERT INTO public.audit_log(entity, entity_id, action, old_data, reason, user_id) VALUES ('booking', _booking_id, 'cancel', to_jsonb(b), _reason, uid);
END $$;

CREATE OR REPLACE FUNCTION public.add_booking_extra(_booking_id uuid, _extra_id uuid, _qty integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e public.extras; st text; cid uuid;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF COALESCE(_qty,0) < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  SELECT * INTO e FROM public.extras WHERE id = _extra_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Extra not found'; END IF;
  SELECT status INTO st FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF st NOT IN ('reserved','checked_in') THEN RAISE EXCEPTION 'Only active bookings can have extras'; END IF;
  INSERT INTO public.booking_charges(booking_id, description, amount, taxable, extra_id, qty, created_by)
    VALUES (_booking_id, e.name || ' × ' || _qty, e.price * _qty, true, e.id, _qty, uid) RETURNING id INTO cid;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.remove_booking_charge(_charge_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); c public.booking_charges; st text;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO c FROM public.booking_charges WHERE id = _charge_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Charge not found'; END IF;
  SELECT status INTO st FROM public.bookings WHERE id = c.booking_id FOR UPDATE;
  IF st NOT IN ('reserved','checked_in') THEN RAISE EXCEPTION 'Charges on closed bookings cannot be removed'; END IF;
  IF c.extra_id IS NULL AND NOT public.has_role(uid,'owner') THEN RAISE EXCEPTION 'Only the owner can remove this charge'; END IF;
  DELETE FROM public.booking_charges WHERE id = _charge_id;
  INSERT INTO public.audit_log(entity, entity_id, action, old_data, user_id) VALUES ('booking_charge', _charge_id, 'remove', to_jsonb(c), uid);
END $$;

CREATE OR REPLACE FUNCTION public.change_booking_status(_booking_id uuid, _to text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b public.bookings; bal numeric; ino text;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT ((b.status = 'reserved' AND _to IN ('checked_in','cancelled')) OR (b.status = 'checked_in' AND _to = 'checked_out')) THEN
    RAISE EXCEPTION 'Cannot change from % to %', b.status, _to;
  END IF;
  bal := public.booking_balance(_booking_id);
  PERFORM set_config('app.via_fn','on', true);
  IF _to = 'checked_in' THEN
    IF bal > 0 AND NOT public.has_perm(uid,'checkout_with_balance') THEN
      RAISE EXCEPTION 'Collect the balance of % before check-in', bal;
    END IF;
    UPDATE public.bookings SET status = _to, actual_check_in = now() WHERE id = _booking_id;
  ELSIF _to = 'cancelled' THEN
    UPDATE public.bookings SET status = _to, notes = concat_ws(E'\n', notes, 'Cancelled: ' || COALESCE(_note,'')) WHERE id = _booking_id;
  ELSE
    IF bal > 0 AND NOT public.has_perm(uid,'checkout_with_balance') THEN
      RAISE EXCEPTION 'Outstanding balance of %. Collect payment or ask the owner to check out.', bal;
    END IF;
    UPDATE public.hotel_settings SET next_invoice_no = next_invoice_no + 1 WHERE id = 1
      RETURNING invoice_prefix || lpad((next_invoice_no - 1)::text, 5, '0') INTO ino;
    UPDATE public.bookings SET status = _to, actual_check_out = now(), invoice_no = COALESCE(invoice_no, ino), invoice_issued_at = COALESCE(invoice_issued_at, now()),
      balance_exception = (bal > 0), balance_exception_note = CASE WHEN bal > 0 THEN concat('Checked out with balance ', bal, '. ', _note) END
      WHERE id = _booking_id;
    UPDATE public.rooms SET housekeeping = 'cleaning' WHERE id IN (SELECT room_id FROM public.booking_rooms WHERE booking_id = _booking_id AND removed_at IS NULL);
  END IF;
  UPDATE public.booking_status_history SET note = _note, changed_by = uid
    WHERE id = (SELECT id FROM public.booking_status_history WHERE booking_id = _booking_id ORDER BY changed_at DESC LIMIT 1);
  PERFORM set_config('app.via_fn','off', true);
END $$;

CREATE OR REPLACE FUNCTION public.update_booking_stay(_booking_id uuid, _room_id uuid, _check_in date, _check_out date, _adults integer, _children integer, _rate numeric, _tax_rate numeric, _discount numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Use Modify booking instead';
END $$;
COMMENT ON FUNCTION public.update_booking_stay(uuid,uuid,date,date,integer,integer,numeric,numeric,numeric,text) IS 'DEPRECATED: replaced by modify_booking';
COMMENT ON FUNCTION public.create_booking(uuid,text,text,text,uuid,date,date,integer,integer,numeric,numeric,numeric,text,text,boolean,numeric,text) IS 'DEPRECATED: replaced by create_booking_multi';

GRANT EXECUTE ON FUNCTION public.create_booking_multi(uuid,text,text,text,jsonb,date,date,integer,integer,numeric,boolean,text,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modify_booking(uuid,date,date,integer,integer,numeric,boolean,uuid[],jsonb,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_booking_extra(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_booking_charge(uuid) TO authenticated;