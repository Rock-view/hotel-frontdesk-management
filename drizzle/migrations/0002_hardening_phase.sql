-- Stricter booking guard: only notes/source editable directly
CREATE OR REPLACE FUNCTION public.bookings_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.via_fn', true) IS DISTINCT FROM 'on' THEN
    IF (to_jsonb(NEW) - 'notes' - 'source' - 'updated_at' - 'updated_by') IS DISTINCT FROM (to_jsonb(OLD) - 'notes' - 'source' - 'updated_at' - 'updated_by') THEN
      RAISE EXCEPTION 'Use the booking actions to change status, dates, room, guests or amounts';
    END IF;
  END IF;
  NEW.updated_at := now(); NEW.updated_by := auth.uid();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history(booking_id, from_status, to_status) VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;

-- Receptionists may only change housekeeping on rooms
CREATE OR REPLACE FUNCTION public.rooms_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'owner')
     AND current_setting('app.via_fn', true) IS DISTINCT FROM 'on'
     AND (to_jsonb(NEW) - 'housekeeping') IS DISTINCT FROM (to_jsonb(OLD) - 'housekeeping') THEN
    RAISE EXCEPTION 'Only the owner can edit room details';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rooms_guard BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.rooms_guard();

-- Owner cannot be deactivated / staff cannot touch own permissions (owner-only policy already); protect owner profile active flag
CREATE OR REPLACE FUNCTION public.profiles_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.has_role(NEW.id,'owner') AND NEW.active = false THEN RAISE EXCEPTION 'The owner account cannot be deactivated'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

-- Edit stay (dates/room/rate/discount/tax/guests) with availability re-check
CREATE OR REPLACE FUNCTION public.update_booking_stay(_booking_id uuid, _room_id uuid, _check_in date, _check_out date,
  _adults int, _children int, _rate numeric, _tax_rate numeric, _discount numeric, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b public.bookings; maxg int;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.status NOT IN ('reserved','checked_in') THEN RAISE EXCEPTION 'Only active bookings can be changed'; END IF;
  IF b.status = 'checked_in' AND _check_in <> b.check_in THEN RAISE EXCEPTION 'Check-in date cannot change after the guest has checked in'; END IF;
  IF _check_in < (now() AT TIME ZONE 'Asia/Kolkata')::date AND _check_in <> b.check_in AND NOT public.has_perm(uid,'backdate') THEN
    RAISE EXCEPTION 'Check-in date is in the past';
  END IF;
  IF COALESCE(_discount,0) <> b.discount AND NOT public.has_perm(uid,'discount') THEN RAISE EXCEPTION 'You are not allowed to change discounts'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT max_guests INTO maxg FROM public.rooms WHERE id = _room_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF COALESCE(_adults,1) + COALESCE(_children,0) > maxg THEN RAISE EXCEPTION 'Room allows at most % guests', maxg; END IF;
  PERFORM set_config('app.via_fn','on', true);
  BEGIN
    UPDATE public.bookings SET room_id = _room_id, check_in = _check_in, check_out = _check_out, adults = _adults, children = _children,
      rate = _rate, tax_rate = _tax_rate, discount = COALESCE(_discount,0) WHERE id = _booking_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'This room is already booked for some of these dates';
  END;
  PERFORM set_config('app.via_fn','off', true);
  INSERT INTO public.audit_log(entity, entity_id, action, old_data, new_data, reason, user_id)
    VALUES ('booking', _booking_id, 'stay_change', to_jsonb(b), (SELECT to_jsonb(x) FROM public.bookings x WHERE id = _booking_id), _reason, uid);
END $$;
REVOKE EXECUTE ON FUNCTION public.update_booking_stay FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_booking_stay TO authenticated;

-- ID document audit + retention
ALTER TABLE public.hotel_settings ADD COLUMN id_retention_days int NOT NULL DEFAULT 365;

CREATE OR REPLACE FUNCTION public.log_id_access(_doc_id uuid, _action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) OR _action NOT IN ('view','upload') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _action = 'view' AND NOT public.has_perm(auth.uid(),'view_ids') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  INSERT INTO public.audit_log(entity, entity_id, action, user_id) VALUES ('guest_document', _doc_id, _action, auth.uid());
END $$;
REVOKE EXECUTE ON FUNCTION public.log_id_access FROM anon, public;
GRANT EXECUTE ON FUNCTION public.log_id_access TO authenticated;

CREATE OR REPLACE FUNCTION public.guest_documents_audit_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(entity, entity_id, action, old_data, user_id) VALUES ('guest_document', OLD.id, 'delete', to_jsonb(OLD), auth.uid());
  RETURN OLD;
END $$;
CREATE TRIGGER guest_documents_audit_delete AFTER DELETE ON public.guest_documents FOR EACH ROW EXECUTE FUNCTION public.guest_documents_audit_delete();

-- Lists ID docs older than retention for the owner to purge
CREATE OR REPLACE FUNCTION public.expired_guest_documents() RETURNS SETOF public.guest_documents LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT d.* FROM public.guest_documents d CROSS JOIN public.hotel_settings h
  WHERE public.has_role(auth.uid(),'owner') AND d.created_at < now() - make_interval(days => h.id_retention_days)
$$;
GRANT EXECUTE ON FUNCTION public.expired_guest_documents TO authenticated;
