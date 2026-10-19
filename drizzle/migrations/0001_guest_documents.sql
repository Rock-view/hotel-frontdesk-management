ALTER TABLE public.profiles ADD COLUMN can_view_ids boolean NOT NULL DEFAULT true;

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
    WHEN 'view_ids' THEN p.can_view_ids
    ELSE false END;
END $$;

CREATE TABLE public.guest_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  doc_type text NOT NULL DEFAULT 'Aadhaar',
  storage_path text NOT NULL UNIQUE,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.guest_documents TO authenticated;
GRANT ALL ON public.guest_documents TO service_role;
ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "id viewers read" ON public.guest_documents FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) AND public.has_perm(auth.uid(),'view_ids'));
CREATE POLICY "staff upload" ON public.guest_documents FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "owner delete" ON public.guest_documents FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE POLICY "guest ids upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'guest-ids' AND public.is_staff(auth.uid()));
CREATE POLICY "guest ids read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'guest-ids' AND public.is_staff(auth.uid()) AND public.has_perm(auth.uid(),'view_ids'));
CREATE POLICY "guest ids delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'guest-ids' AND public.has_role(auth.uid(),'owner'));
