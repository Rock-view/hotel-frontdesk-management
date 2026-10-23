-- Add photo_id_policy, policy_visibility, quotation numbering to hotel_settings
ALTER TABLE public.hotel_settings
  ADD COLUMN IF NOT EXISTS photo_id_policy text,
  ADD COLUMN IF NOT EXISTS policy_visibility jsonb DEFAULT '{"guarantee":{"estimate":true,"bill":true},"cancellation":{"estimate":true,"bill":true},"photo_id":{"estimate":true,"bill":false},"arrival_departure":{"estimate":true,"bill":true},"receipt_footer":{"estimate":false,"bill":true}}'::jsonb,
  ADD COLUMN IF NOT EXISTS quotation_prefix text NOT NULL DEFAULT 'QT-',
  ADD COLUMN IF NOT EXISTS next_quotation_no int NOT NULL DEFAULT 1;

-- Create quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_no text NOT NULL UNIQUE,
  guest_name text NOT NULL,
  guest_mobile text NOT NULL,
  guest_email text,
  check_in date NOT NULL,
  check_out date NOT NULL,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  nights integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'Walk-in',
  gst_bill boolean NOT NULL DEFAULT false,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  rooms jsonb NOT NULL DEFAULT '[]'::jsonb,
  charges jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quotations' AND policyname = 'staff read quotations'
  ) THEN
    CREATE POLICY "staff read quotations" ON public.quotations
      FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quotations' AND policyname = 'staff insert quotations'
  ) THEN
    CREATE POLICY "staff insert quotations" ON public.quotations
      FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quotations' AND policyname = 'staff update quotations'
  ) THEN
    CREATE POLICY "staff update quotations" ON public.quotations
      FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quotations' AND policyname = 'staff delete quotations'
  ) THEN
    CREATE POLICY "staff delete quotations" ON public.quotations
      FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));
  END IF;
END $$;

GRANT ALL ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;

CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON public.quotations (created_at DESC);

-- Function to atomically increment and return the next quotation number
CREATE OR REPLACE FUNCTION public.next_quotation_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qno text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.hotel_settings
  SET next_quotation_no = COALESCE(next_quotation_no, 1) + 1
  WHERE id = 1
  RETURNING COALESCE(quotation_prefix, 'QT-') || lpad((COALESCE(next_quotation_no, 1) - 1)::text, 5, '0') INTO qno;
  RETURN qno;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_quotation_no() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_quotation_no() TO service_role;

-- Function to atomically convert quotation to booking, recheck availability, lock, and delete quotation
CREATE OR REPLACE FUNCTION public.convert_quotation_to_booking(
  _quotation_id uuid,
  _rooms jsonb,
  _advance numeric DEFAULT 0,
  _advance_method text DEFAULT 'Cash',
  _notes text DEFAULT NULL
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

  -- Call the existing multi-room booking creation function
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
    COALESCE(_advance_method, 'Cash')
  );

  -- Ensure the booking retains the exact quoted GST bill status and tax rate even if hotel_settings changed
  PERFORM set_config('app.via_fn', 'on', true);
  UPDATE public.bookings
  SET gst_bill = q.gst_bill,
      tax_rate = CASE WHEN q.gst_bill THEN COALESCE(q.tax_rate, 0) ELSE 0 END
  WHERE id = bid;

  -- Carry forward any extra charges defined in the quotation, preserving taxable/non-taxable status
  IF q.charges IS NOT NULL AND jsonb_array_length(q.charges) > 0 THEN
    FOR chg IN SELECT * FROM jsonb_array_elements(q.charges) LOOP
      IF COALESCE((chg->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO public.booking_charges(booking_id, description, amount, taxable, created_by)
        VALUES (
          bid,
          COALESCE(NULLIF(trim(chg->>'description'), ''), 'Quoted charge'),
          (chg->>'amount')::numeric,
          COALESCE((chg->>'taxable')::boolean, true),
          uid
        );
      END IF;
    END LOOP;
  END IF;

  -- Verify that the resulting invoice total matches the agreed quotation total
  SELECT total INTO final_total FROM public.booking_totals WHERE booking_id = bid;
  IF abs(COALESCE(final_total, 0) - COALESCE(q.total, 0)) > 0.05 THEN
    RAISE EXCEPTION 'Converted booking total (%) does not match agreed quotation total (%). Please review charges or edit quotation before conversion.', final_total, q.total;
  END IF;

  -- Delete the quotation atomically within the exact same transaction
  DELETE FROM public.quotations WHERE id = _quotation_id;

  RETURN bid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quotation_to_booking(uuid, jsonb, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_booking(uuid, jsonb, numeric, text, text) TO service_role;

