ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.available_rooms(_from date, _to date)
 RETURNS SETOF rooms LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$
  SELECT r.* FROM public.rooms r WHERE r.active AND r.archived_at IS NULL AND r.housekeeping <> 'maintenance'
   AND NOT EXISTS (SELECT 1 FROM public.booking_rooms b WHERE b.room_id = r.id AND b.active
                   AND daterange(b.check_in,b.check_out,'[)') && daterange(_from,_to,'[)'))
   AND NOT EXISTS (SELECT 1 FROM public.room_blocks k WHERE k.room_id = r.id AND daterange(k.start_date,k.end_date,'[)') && daterange(_from,_to,'[)'))
  ORDER BY r.number
$f$;

CREATE OR REPLACE FUNCTION public.delete_room(_room_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE bno text;
BEGIN
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT b.booking_no INTO bno FROM public.booking_rooms br JOIN public.bookings b ON b.id = br.booking_id
   WHERE br.room_id = _room_id AND br.active AND b.status IN ('reserved','checked_in') LIMIT 1;
  IF bno IS NOT NULL THEN RAISE EXCEPTION 'Room has an active booking (%). Cancel or move it first.', bno; END IF;
  IF EXISTS (SELECT 1 FROM public.booking_rooms WHERE room_id = _room_id)
     OR EXISTS (SELECT 1 FROM public.bookings WHERE room_id = _room_id) THEN
    DELETE FROM public.room_blocks WHERE room_id = _room_id;
    UPDATE public.rooms SET archived_at = now(), active = false WHERE id = _room_id;
    RETURN 'archived';
  END IF;
  DELETE FROM public.room_blocks WHERE room_id = _room_id;
  DELETE FROM public.rooms WHERE id = _room_id;
  RETURN 'deleted';
END $f$;
GRANT EXECUTE ON FUNCTION public.delete_room(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.change_booking_status(_booking_id uuid, _to text, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); b public.bookings; bal numeric; ino text; cit text; opens timestamp;
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
    SELECT check_in_time INTO cit FROM public.hotel_settings WHERE id = 1;
    opens := b.check_in + COALESCE(NULLIF(cit,'')::time, '12:00'::time);
    IF (now() AT TIME ZONE 'Asia/Kolkata') < opens THEN
      RAISE EXCEPTION 'Check-in opens on % at %', to_char(b.check_in,'DD Mon YYYY'), to_char(opens,'HH24:MI');
    END IF;
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
END $function$;