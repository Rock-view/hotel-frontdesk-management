-- Public RPC functions to safely fetch invoice and quotation for customer view links
-- Customers only receive their specific document and public hotel settings.
-- Internal room numbers are never exposed in customer documents.

CREATE OR REPLACE FUNCTION public.get_public_invoice(_booking_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res json;
BEGIN
  SELECT json_build_object(
    'booking', (
      SELECT json_build_object(
        'id', b.id,
        'booking_no', b.booking_no,
        'invoice_no', b.invoice_no,
        'invoice_issued_at', b.invoice_issued_at,
        'check_in', b.check_in,
        'check_out', b.check_out,
        'discount', b.discount,
        'tax_rate', b.tax_rate,
        'gst_bill', b.gst_bill,
        'guests', json_build_object('name', g.name, 'mobile', g.mobile)
      )
      FROM public.bookings b
      LEFT JOIN public.guests g ON g.id = b.guest_id
      WHERE b.id = _booking_id
    ),
    'totals', (
      SELECT row_to_json(bt)
      FROM public.booking_totals bt
      WHERE bt.booking_id = _booking_id
    ),
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
          'room_category_name', COALESCE(rc.name, br.room_category_name, 'Room'),
          'rooms', json_build_object(
            'room_categories', json_build_object('name', COALESCE(rc.name, br.room_category_name, 'Room'), 'description', rc.description)
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
        'tax_label', tax_label,
        'receipt_footer', receipt_footer,
        'guarantee_policy', guarantee_policy,
        'cancellation_policy', cancellation_policy,
        'arrival_departure_policy', arrival_departure_policy,
        'policy_visibility', policy_visibility,
        'show_logo', show_logo,
        'show_address', show_address
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
        'tax_label', tax_label,
        'receipt_footer', receipt_footer,
        'guarantee_policy', guarantee_policy,
        'cancellation_policy', cancellation_policy,
        'arrival_departure_policy', arrival_departure_policy,
        'photo_id_policy', photo_id_policy,
        'policy_visibility', policy_visibility,
        'show_logo', show_logo,
        'show_address', show_address
      )
      FROM public.hotel_settings
      WHERE id = 1
    )
  ) INTO res;
  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_quotation(uuid) TO anon, authenticated, service_role;
