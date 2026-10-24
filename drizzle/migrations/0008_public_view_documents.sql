-- Public RPC functions to safely fetch invoice and quotation for customer view links
-- Customers only receive their specific document and public hotel settings.
-- Internal room numbers are never exposed in customer documents.

CREATE OR REPLACE FUNCTION public.get_public_invoice(_booking_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res json;
  b record;
  t record;
BEGIN
  SELECT b_in.id, b_in.booking_no, b_in.invoice_no, b_in.invoice_issued_at,
         b_in.check_in, b_in.check_out, b_in.discount, b_in.tax_rate, b_in.gst_bill,
         b_in.rate,
         g.name AS guest_name, g.mobile AS guest_mobile
  INTO b
  FROM public.bookings b_in
  LEFT JOIN public.guests g ON g.id = b_in.guest_id
  WHERE b_in.id = _booking_id;

  IF b.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    (b.check_out - b.check_in)::int AS nights,
    (b.rate * (b.check_out - b.check_in)::numeric)::numeric(12,2) AS room_charges,
    COALESCE(c.extras, 0::numeric)::numeric(12,2) AS extra_charges,
    b.discount,
    round(GREATEST(b.rate * (b.check_out - b.check_in)::numeric + COALESCE(c.taxable_extras, 0::numeric) - b.discount, 0::numeric) * b.tax_rate / 100::numeric, 2) AS tax_amount,
    round(b.rate * (b.check_out - b.check_in)::numeric + COALESCE(c.extras, 0::numeric) - b.discount + GREATEST(b.rate * (b.check_out - b.check_in)::numeric + COALESCE(c.taxable_extras, 0::numeric) - b.discount, 0::numeric) * b.tax_rate / 100::numeric, 2) AS total,
    COALESCE(p.paid, 0::numeric)::numeric(12,2) AS paid,
    COALESCE(p.refunded, 0::numeric)::numeric(12,2) AS refunded
  INTO t
  FROM (SELECT 1) _dummy
  LEFT JOIN (
    SELECT sum(amount) AS extras, sum(amount) FILTER (WHERE taxable) AS taxable_extras
    FROM public.booking_charges WHERE booking_id = _booking_id
  ) c ON true
  LEFT JOIN (
    SELECT sum(amount) FILTER (WHERE kind = 'payment') AS paid,
           sum(amount) FILTER (WHERE kind = 'refund') AS refunded
    FROM public.payments WHERE booking_id = _booking_id
  ) p ON true;

  SELECT json_build_object(
    'booking', json_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'invoice_no', b.invoice_no,
      'invoice_issued_at', b.invoice_issued_at,
      'check_in', b.check_in,
      'check_out', b.check_out,
      'discount', b.discount,
      'tax_rate', b.tax_rate,
      'gst_bill', b.gst_bill,
      'guests', json_build_object('name', b.guest_name, 'mobile', b.guest_mobile)
    ),
    'totals', row_to_json(t),
    'charges', (
      SELECT COALESCE(json_agg(row_to_json(bc)), '[]'::json)
      FROM (SELECT id, booking_id, description, amount, taxable, created_at FROM public.booking_charges WHERE booking_id = _booking_id ORDER BY created_at) bc
    ),
    'payments', (
      SELECT COALESCE(json_agg(row_to_json(bp)), '[]'::json)
      FROM (SELECT id, receipt_no, method, received_at, kind, amount FROM public.payments WHERE booking_id = _booking_id ORDER BY received_at) bp
    ),
    'rooms', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', br.id,
          'rate', br.rate,
          'rooms', json_build_object(
            'room_categories', json_build_object('name', COALESCE(rc.name, 'Room'), 'description', rc.description)
          )
        )
      ), '[]'::json)
      FROM public.booking_rooms br
      LEFT JOIN public.rooms rm ON rm.id = br.room_id
      LEFT JOIN public.room_categories rc ON rc.id = rm.category_id
      WHERE br.booking_id = _booking_id AND br.removed_at IS NULL
    ),
    'settings', (
      SELECT json_build_object(
        'name', name,
        'logo_url', logo_url,
        'address', address,
        'phone', phone,
        'email', email,
        'gstin', gstin,
        'currency', currency,
        'check_in_time', check_in_time,
        'check_out_time', check_out_time,
        'tax_label', tax_label,
        'receipt_footer', receipt_footer,
        'terms', terms,
        'cancellation_policy', cancellation_policy,
        'photo_id_policy', photo_id_policy,
        'policy_visibility', policy_visibility,
        'show_logo', show_logo,
        'show_address', show_address,
        'show_gstin', show_gstin
      )
      FROM public.hotel_settings
      WHERE id = 1
    )
  ) INTO res;

  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_invoice(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_quotation(_quotation_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res json;
BEGIN
  SELECT json_build_object(
    'quotation', (
      SELECT row_to_json(q)
      FROM public.quotations q
      WHERE q.id = _quotation_id
    ),
    'settings', (
      SELECT json_build_object(
        'name', name,
        'logo_url', logo_url,
        'address', address,
        'phone', phone,
        'email', email,
        'gstin', gstin,
        'currency', currency,
        'check_in_time', check_in_time,
        'check_out_time', check_out_time,
        'tax_label', tax_label,
        'receipt_footer', receipt_footer,
        'terms', terms,
        'cancellation_policy', cancellation_policy,
        'photo_id_policy', photo_id_policy,
        'policy_visibility', policy_visibility,
        'show_logo', show_logo,
        'show_address', show_address,
        'show_gstin', show_gstin
      )
      FROM public.hotel_settings
      WHERE id = 1
    )
  ) INTO res;
  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_quotation(uuid) TO anon, authenticated, service_role;
