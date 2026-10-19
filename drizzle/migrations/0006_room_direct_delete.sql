SELECT set_config('app.via_fn','on', true);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS room_number text;
ALTER TABLE public.booking_rooms ADD COLUMN IF NOT EXISTS room_number text;
UPDATE public.bookings b SET room_number = r.number FROM public.rooms r WHERE r.id = b.room_id AND b.room_number IS NULL;
UPDATE public.booking_rooms b SET room_number = r.number FROM public.rooms r WHERE r.id = b.room_id AND b.room_number IS NULL;

CREATE OR REPLACE FUNCTION public.set_room_number() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.room_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.room_id IS DISTINCT FROM OLD.room_id) THEN
    SELECT number INTO NEW.room_number FROM public.rooms WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER bookings_set_room_number BEFORE INSERT OR UPDATE OF room_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.set_room_number();
CREATE TRIGGER booking_rooms_set_room_number BEFORE INSERT OR UPDATE OF room_id ON public.booking_rooms FOR EACH ROW EXECUTE FUNCTION public.set_room_number();

ALTER TABLE public.bookings ALTER COLUMN room_id DROP NOT NULL;
ALTER TABLE public.booking_rooms ALTER COLUMN room_id DROP NOT NULL;
ALTER TABLE public.bookings DROP CONSTRAINT bookings_room_id_fkey, ADD CONSTRAINT bookings_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;
ALTER TABLE public.booking_rooms DROP CONSTRAINT booking_rooms_room_id_fkey, ADD CONSTRAINT booking_rooms_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;

UPDATE public.rooms SET archived_at = NULL, active = true WHERE archived_at IS NOT NULL;
COMMENT ON COLUMN public.rooms.archived_at IS 'DEPRECATED: rooms are deleted directly now';

CREATE OR REPLACE FUNCTION public.delete_room(_room_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
DECLARE bno text;
BEGIN
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Not authorised'; END IF;
  SELECT b.booking_no INTO bno FROM public.booking_rooms br JOIN public.bookings b ON b.id = br.booking_id
   WHERE br.room_id = _room_id AND br.active AND b.status IN ('reserved','checked_in') LIMIT 1;
  IF bno IS NOT NULL THEN RAISE EXCEPTION 'Room has an active booking (%). Cancel or move it first.', bno; END IF;
  PERFORM set_config('app.via_fn','on', true);
  DELETE FROM public.rooms WHERE id = _room_id;
  PERFORM set_config('app.via_fn','off', true);
  RETURN 'deleted';
END $f$;
SELECT set_config('app.via_fn','off', true);