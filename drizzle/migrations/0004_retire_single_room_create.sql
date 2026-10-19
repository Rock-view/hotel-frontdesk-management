CREATE OR REPLACE FUNCTION public.create_booking(_guest_id uuid, _guest_name text, _guest_mobile text, _guest_email text, _room_id uuid, _check_in date, _check_out date, _adults integer, _children integer, _rate numeric, _tax_rate numeric, _discount numeric, _source text, _notes text, _check_in_now boolean, _advance numeric, _advance_method text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Use create_booking_multi';
END $$;