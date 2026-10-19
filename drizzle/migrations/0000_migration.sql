CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE public.app_role AS ENUM ('owner','receptionist');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  active boolean NOT NULL DEFAULT true,
  can_refund boolean NOT NULL DEFAULT false,
  can_correct boolean NOT NULL DEFAULT false,
  can_discount boolean NOT NULL DEFAULT true,
  can_checkout_with_balance boolean NOT NULL DEFAULT false,
  can_backdate boolean NOT NULL DEFAULT false,
  can_view_reports boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
                 WHERE r.user_id = _user_id AND p.active)
$$;

CREATE OR REPLACE FUNCTION public.has_perm(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  IF public.has_role(_user_id, 'owner') THEN RETURN true; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _user_id AND active;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN CASE _perm
    WHEN 'refund' THEN p.can_refund
    WHEN 'correct' THEN p.can_correct
    WHEN 'discount' THEN p.can_discount
    WHEN 'checkout_with_balance' THEN p.can_checkout_with_balance
    WHEN 'backdate' THEN p.can_backdate
    WHEN 'reports' THEN p.can_view_reports
    ELSE false END;
END $$;

CREATE POLICY "own role or owner" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'owner'));
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "owner update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.hotel_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT '',
  property_type text NOT NULL DEFAULT 'Hotel',
  logo_url text,
  address text, phone text, email text, gstin text,
  currency text NOT NULL DEFAULT 'INR',
  check_in_time text NOT NULL DEFAULT '12:00',
  check_out_time text NOT NULL DEFAULT '11:00',
  booking_prefix text NOT NULL DEFAULT 'BK-',
  receipt_prefix text NOT NULL DEFAULT 'RC-',
  invoice_prefix text NOT NULL DEFAULT 'INV-',
  next_booking_no int NOT NULL DEFAULT 1,
  next_receipt_no int NOT NULL DEFAULT 1,
  next_invoice_no int NOT NULL DEFAULT 1,
  tax_label text NOT NULL DEFAULT 'GST',
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  payment_methods text[] NOT NULL DEFAULT ARRAY['Cash','UPI','Card','Bank Transfer'],
  cancellation_policy text, receipt_footer text, terms text,
  show_logo boolean NOT NULL DEFAULT true,
  show_gstin boolean NOT NULL DEFAULT true,
  show_address boolean NOT NULL DEFAULT true,
  show_balance boolean NOT NULL DEFAULT true,
  setup_complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.hotel_settings (id) VALUES (1);
GRANT SELECT, UPDATE ON public.hotel_settings TO authenticated;
GRANT ALL ON public.hotel_settings TO service_role;
ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read settings" ON public.hotel_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "owner update settings" ON public.hotel_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.room_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit_type text NOT NULL DEFAULT 'Room',
  base_rate numeric(12,2) NOT NULL DEFAULT 0,
  max_guests int NOT NULL DEFAULT 2,
  description text,
  amenities text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.room_categories(id) ON DELETE SET NULL,
  floor text,
  rate numeric(12,2) NOT NULL DEFAULT 0,
  max_guests int NOT NULL DEFAULT 2,
  amenities text[] NOT NULL DEFAULT '{}',
  description text,
  housekeeping text NOT NULL DEFAULT 'ready' CHECK (housekeeping IN ('ready','cleaning','maintenance')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.room_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  kind text NOT NULL DEFAULT 'maintenance' CHECK (kind IN ('maintenance','owner')),
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date),
  EXCLUDE USING gist (room_id WITH =, daterange(start_date, end_date, '[)') WITH &&)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_categories, public.rooms, public.room_blocks TO authenticated;
GRANT ALL ON public.room_categories, public.rooms, public.room_blocks TO service_role;
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read" ON public.room_categories FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "owner write" ON public.room_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "staff read" ON public.rooms FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "owner write" ON public.rooms FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));
CREATE POLICY "staff update housekeeping" ON public.rooms FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff read" ON public.room_blocks FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "owner write" ON public.room_blocks FOR ALL TO authenticated USING (public.has_role(auth.uid(),'owner')) WITH CHECK (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text NOT NULL,
  email text, address text, id_type text, id_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guests_mobile_idx ON public.guests(mobile);
GRANT SELECT, INSERT, UPDATE ON public.guests TO authenticated;
GRANT ALL ON public.guests TO service_role;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff all" ON public.guests FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_no text NOT NULL UNIQUE,
  guest_id uuid NOT NULL REFERENCES public.guests(id),
  room_id uuid NOT NULL REFERENCES public.rooms(id),
  check_in date NOT NULL,
  check_out date NOT NULL,
  adults int NOT NULL DEFAULT 1,
  children int NOT NULL DEFAULT 0,
  rate numeric(12,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','checked_in','checked_out','cancelled')),
  source text NOT NULL DEFAULT 'Walk-in',
  notes text,
  actual_check_in timestamptz,
  actual_check_out timestamptz,
  balance_exception boolean NOT NULL DEFAULT false,
  balance_exception_note text,
  invoice_no text UNIQUE,
  invoice_issued_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in),
  CHECK (discount >= 0 AND rate >= 0),
  CONSTRAINT no_double_booking EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out, '[)') WITH &&) WHERE (status <> 'cancelled')
);
CREATE INDEX bookings_dates_idx ON public.bookings(check_in, check_out);

CREATE TABLE public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_status text, to_status text NOT NULL, note text,
  changed_by uuid DEFAULT auth.uid(),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.booking_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  taxable boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  kind text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL,
  reference text, note text,
  receipt_no text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.receipt_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  revision int NOT NULL,
  snapshot jsonb NOT NULL,
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, revision)
);
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL, entity_id uuid, action text NOT NULL,
  old_data jsonb, new_data jsonb, reason text,
  user_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.bookings TO authenticated;
GRANT SELECT ON public.booking_status_history, public.payments, public.receipt_revisions, public.audit_log TO authenticated;
GRANT SELECT, INSERT ON public.booking_charges TO authenticated;
GRANT ALL ON public.bookings, public.booking_status_history, public.booking_charges, public.payments, public.receipt_revisions, public.audit_log TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read" ON public.bookings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff update notes" ON public.bookings FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff read" ON public.booking_status_history FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff read" ON public.booking_charges FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff add" ON public.booking_charges FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff read" ON public.payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff read" ON public.receipt_revisions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "owner read" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE OR REPLACE FUNCTION public.bookings_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('app.via_fn', true) IS DISTINCT FROM 'on' THEN
    IF NEW.status <> OLD.status OR NEW.rate <> OLD.rate OR NEW.discount <> OLD.discount OR NEW.tax_rate <> OLD.tax_rate
       OR NEW.room_id <> OLD.room_id OR NEW.check_in <> OLD.check_in OR NEW.check_out <> OLD.check_out
       OR NEW.booking_no <> OLD.booking_no OR NEW.invoice_no IS DISTINCT FROM OLD.invoice_no
       OR NEW.balance_exception <> OLD.balance_exception THEN
      RAISE EXCEPTION 'Use the booking actions to change status, dates, room or amounts';
    END IF;
  END IF;
  NEW.updated_at := now(); NEW.updated_by := auth.uid();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history(booking_id, from_status, to_status) VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_guard BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.bookings_guard();

CREATE OR REPLACE FUNCTION public.check_booking_vs_blocks() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'cancelled' AND EXISTS (SELECT 1 FROM public.room_blocks b WHERE b.room_id = NEW.room_id
     AND daterange(b.start_date,b.end_date,'[)') && daterange(NEW.check_in,NEW.check_out,'[)')) THEN
    RAISE EXCEPTION 'Room is blocked for maintenance or by the owner on these dates';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_blocks BEFORE INSERT OR UPDATE OF room_id, check_in, check_out ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_vs_blocks();

CREATE OR REPLACE FUNCTION public.check_block_vs_bookings() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bookings k WHERE k.room_id = NEW.room_id AND k.status IN ('reserved','checked_in')
     AND daterange(k.check_in,k.check_out,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) THEN
    RAISE EXCEPTION 'There are active bookings for this room on these dates';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER blocks_bookings BEFORE INSERT OR UPDATE ON public.room_blocks FOR EACH ROW EXECUTE FUNCTION public.check_block_vs_bookings();

CREATE VIEW public.booking_totals WITH (security_invoker = true) AS
SELECT b.id AS booking_id,
  (b.check_out - b.check_in) AS nights,
  (b.rate * (b.check_out - b.check_in))::numeric(12,2) AS room_charges,
  COALESCE(c.extras,0)::numeric(12,2) AS extra_charges,
  b.discount,
  round(GREATEST(b.rate * (b.check_out - b.check_in) + COALESCE(c.taxable_extras,0) - b.discount, 0) * b.tax_rate / 100, 2) AS tax_amount,
  round(b.rate * (b.check_out - b.check_in) + COALESCE(c.extras,0) - b.discount
        + GREATEST(b.rate * (b.check_out - b.check_in) + COALESCE(c.taxable_extras,0) - b.discount, 0) * b.tax_rate / 100, 2) AS total,
  COALESCE(p.paid,0)::numeric(12,2) AS paid,
  COALESCE(p.refunded,0)::numeric(12,2) AS refunded
FROM public.bookings b
LEFT JOIN (SELECT booking_id, sum(amount) extras, sum(amount) FILTER (WHERE taxable) taxable_extras FROM public.booking_charges GROUP BY booking_id) c ON c.booking_id = b.id
LEFT JOIN (SELECT booking_id, sum(amount) FILTER (WHERE kind='payment') paid, sum(amount) FILTER (WHERE kind='refund') refunded FROM public.payments GROUP BY booking_id) p ON p.booking_id = b.id;
GRANT SELECT ON public.booking_totals TO authenticated;

CREATE OR REPLACE FUNCTION public.booking_balance(_booking_id uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT total - paid + refunded FROM public.booking_totals WHERE booking_id = _booking_id
$$;

CREATE OR REPLACE FUNCTION public.build_receipt_snapshot(_payment_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'hotel', to_jsonb(h) - 'next_booking_no' - 'next_receipt_no' - 'next_invoice_no',
    'payment', to_jsonb(p),
    'booking', jsonb_build_object('booking_no', b.booking_no, 'created_at', b.created_at, 'check_in', b.check_in, 'check_out', b.check_out, 'status', b.status),
    'guest', jsonb_build_object('name', g.name, 'mobile', g.mobile),
    'room', r.number,
    'totals', to_jsonb(t),
    'paid_to_date', (SELECT COALESCE(sum(CASE WHEN kind='payment' THEN amount ELSE -amount END),0) FROM public.payments x WHERE x.booking_id = b.id AND x.received_at <= p.received_at),
    'balance', t.total - t.paid + t.refunded
  )
  FROM public.payments p JOIN public.bookings b ON b.id = p.booking_id
  JOIN public.guests g ON g.id = b.guest_id JOIN public.rooms r ON r.id = b.room_id
  JOIN public.booking_totals t ON t.booking_id = b.id
  CROSS JOIN public.hotel_settings h WHERE p.id = _payment_id
$$;

CREATE OR REPLACE FUNCTION public.record_payment(_booking_id uuid, _kind text, _amount numeric, _method text, _reference text, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); pid uuid; rno text; st text;
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
  INSERT INTO public.payments(booking_id, kind, amount, method, reference, note, receipt_no, created_by)
    VALUES (_booking_id, _kind, _amount, trim(_method), NULLIF(trim(_reference),''), NULLIF(trim(_note),''), rno, uid) RETURNING id INTO pid;
  INSERT INTO public.receipt_revisions(payment_id, revision, snapshot, created_by) VALUES (pid, 1, public.build_receipt_snapshot(pid), uid);
  INSERT INTO public.audit_log(entity, entity_id, action, new_data, user_id) VALUES ('payment', pid, _kind, jsonb_build_object('amount',_amount,'method',_method,'receipt_no',rno), uid);
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.create_booking(
  _guest_id uuid, _guest_name text, _guest_mobile text, _guest_email text,
  _room_id uuid, _check_in date, _check_out date, _adults int, _children int,
  _rate numeric, _tax_rate numeric, _discount numeric, _source text, _notes text,
  _check_in_now boolean, _advance numeric, _advance_method text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); gid uuid := _guest_id; bid uuid; bno text; maxg int; st text;
BEGIN
  IF NOT public.is_staff(uid) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _check_in < (now() AT TIME ZONE 'Asia/Kolkata')::date AND NOT public.has_perm(uid,'backdate') THEN
    RAISE EXCEPTION 'Check-in date is in the past';
  END IF;
  IF COALESCE(_discount,0) > 0 AND NOT public.has_perm(uid,'discount') THEN RAISE EXCEPTION 'You are not allowed to give discounts'; END IF;
  SELECT max_guests INTO maxg FROM public.rooms WHERE id = _room_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF COALESCE(_adults,1) + COALESCE(_children,0) > maxg THEN RAISE EXCEPTION 'Room allows at most % guests', maxg; END IF;
  IF gid IS NULL THEN
    IF COALESCE(trim(_guest_name),'') = '' OR COALESCE(trim(_guest_mobile),'') = '' THEN RAISE EXCEPTION 'Guest name and mobile are required'; END IF;
    INSERT INTO public.guests(name, mobile, email) VALUES (trim(_guest_name), trim(_guest_mobile), NULLIF(trim(_guest_email),'')) RETURNING id INTO gid;
  END IF;
  UPDATE public.hotel_settings SET next_booking_no = next_booking_no + 1 WHERE id = 1
    RETURNING booking_prefix || lpad((next_booking_no - 1)::text, 5, '0') INTO bno;
  st := CASE WHEN _check_in_now THEN 'checked_in' ELSE 'reserved' END;
  BEGIN
    INSERT INTO public.bookings(booking_no, guest_id, room_id, check_in, check_out, adults, children, rate, tax_rate, discount, source, notes, status, actual_check_in, created_by, updated_by)
    VALUES (bno, gid, _room_id, _check_in, _check_out, COALESCE(_adults,1), COALESCE(_children,0), _rate, COALESCE(_tax_rate,0), COALESCE(_discount,0), COALESCE(_source,'Walk-in'), _notes,
      st, CASE WHEN _check_in_now THEN now() END, uid, uid)
    RETURNING id INTO bid;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'This room is already booked for some of these dates';
  END;
  INSERT INTO public.booking_status_history(booking_id, from_status, to_status, changed_by) VALUES (bid, NULL, st, uid);
  IF COALESCE(_advance,0) > 0 THEN
    PERFORM public.record_payment(bid, 'payment', _advance, _advance_method, NULL, 'Advance');
  END IF;
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.correct_receipt(_payment_id uuid, _method text, _reference text, _note text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); oldp public.payments; rev int;
BEGIN
  IF NOT public.has_perm(uid,'correct') THEN RAISE EXCEPTION 'You are not allowed to correct receipts'; END IF;
  IF COALESCE(trim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO oldp FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  UPDATE public.payments SET method = trim(_method), reference = NULLIF(trim(_reference),''), note = NULLIF(trim(_note),'') WHERE id = _payment_id;
  SELECT COALESCE(max(revision),0) + 1 INTO rev FROM public.receipt_revisions WHERE payment_id = _payment_id;
  INSERT INTO public.receipt_revisions(payment_id, revision, snapshot, reason, created_by) VALUES (_payment_id, rev, public.build_receipt_snapshot(_payment_id), _reason, uid);
  INSERT INTO public.audit_log(entity, entity_id, action, old_data, new_data, reason, user_id)
    VALUES ('payment', _payment_id, 'correction', to_jsonb(oldp), (SELECT to_jsonb(p) FROM public.payments p WHERE id = _payment_id), _reason, uid);
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
  PERFORM set_config('app.via_fn','on', true);
  IF _to = 'checked_in' THEN
    UPDATE public.bookings SET status = _to, actual_check_in = now() WHERE id = _booking_id;
  ELSIF _to = 'cancelled' THEN
    UPDATE public.bookings SET status = _to, notes = concat_ws(E'\n', notes, 'Cancelled: ' || COALESCE(_note,'')) WHERE id = _booking_id;
  ELSE
    bal := public.booking_balance(_booking_id);
    IF bal > 0 AND NOT public.has_perm(uid,'checkout_with_balance') THEN
      RAISE EXCEPTION 'Outstanding balance of %. Collect payment or ask the owner to check out.', bal;
    END IF;
    UPDATE public.hotel_settings SET next_invoice_no = next_invoice_no + 1 WHERE id = 1
      RETURNING invoice_prefix || lpad((next_invoice_no - 1)::text, 5, '0') INTO ino;
    UPDATE public.bookings SET status = _to, actual_check_out = now(), invoice_no = COALESCE(invoice_no, ino), invoice_issued_at = COALESCE(invoice_issued_at, now()),
      balance_exception = (bal > 0), balance_exception_note = CASE WHEN bal > 0 THEN concat('Checked out with balance ', bal, '. ', _note) END
      WHERE id = _booking_id;
    UPDATE public.rooms SET housekeeping = 'cleaning' WHERE id = b.room_id;
  END IF;
  UPDATE public.booking_status_history SET note = _note, changed_by = uid
    WHERE id = (SELECT id FROM public.booking_status_history WHERE booking_id = _booking_id ORDER BY changed_at DESC LIMIT 1);
  PERFORM set_config('app.via_fn','off', true);
END $$;

CREATE OR REPLACE FUNCTION public.available_rooms(_from date, _to date)
RETURNS SETOF public.rooms LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT r.* FROM public.rooms r WHERE r.active AND r.housekeeping <> 'maintenance'
   AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.room_id = r.id AND b.status IN ('reserved','checked_in')
                   AND daterange(b.check_in,b.check_out,'[)') && daterange(_from,_to,'[)'))
   AND NOT EXISTS (SELECT 1 FROM public.room_blocks k WHERE k.room_id = r.id AND daterange(k.start_date,k.end_date,'[)') && daterange(_from,_to,'[)'))
  ORDER BY r.number
$$;

CREATE OR REPLACE FUNCTION public.owner_exists() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner')
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking, public.record_payment, public.correct_receipt, public.change_booking_status, public.build_receipt_snapshot FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_booking, public.record_payment, public.correct_receipt, public.change_booking_status, public.available_rooms, public.booking_balance, public.has_role, public.has_perm, public.is_staff TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_exists TO anon, authenticated;
