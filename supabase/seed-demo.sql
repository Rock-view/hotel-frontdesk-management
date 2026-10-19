-- OPTIONAL DEMO DATA. Run manually on a demo backend only — never on a live hotel.
UPDATE public.hotel_settings SET name = 'Demo Lodge', address = 'Demo address', phone = '0000000000',
  default_tax_rate = 12, receipt_footer = 'Thank you for staying with us!' WHERE id = 1 AND name = '';

WITH c AS (
  INSERT INTO public.room_categories (name, unit_type, base_rate, max_guests, description) VALUES
    ('Standard', 'Room', 1500, 2, 'Fan, attached bath'),
    ('Deluxe AC', 'Room', 2500, 3, 'AC, TV, attached bath'),
    ('Garden Cottage', 'Cottage', 4500, 4, 'Private sit-out')
  RETURNING id, name, base_rate, max_guests
)
INSERT INTO public.rooms (number, category_id, rate, max_guests)
SELECT n, c.id, c.base_rate, c.max_guests FROM c
JOIN LATERAL (
  SELECT unnest(CASE c.name WHEN 'Standard' THEN ARRAY['101','102','103','104']
                            WHEN 'Deluxe AC' THEN ARRAY['201','202','203']
                            ELSE ARRAY['Cottage A','Cottage B'] END) AS n
) x ON true
ON CONFLICT (number) DO NOTHING;
