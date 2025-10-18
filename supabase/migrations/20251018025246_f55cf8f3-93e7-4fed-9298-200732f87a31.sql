-- Fix FK violation by ensuring history trigger runs AFTER insert/update and removing old BEFORE trigger
-- Drop both possible existing triggers to avoid duplicates
DROP TRIGGER IF EXISTS log_service_request_status_change ON public.service_requests;
DROP TRIGGER IF EXISTS log_request_status_change_trigger ON public.service_requests;

-- Recreate the trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.log_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log if it's a new insert OR the status actually changed
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.request_status_history (request_id, status, changed_by)
    VALUES (NEW.id, NEW.status, COALESCE(auth.uid(), NEW.resident_id));
  END IF;
  RETURN NEW;
END;
$$;

-- Create the AFTER trigger so the parent row definitely exists
CREATE TRIGGER log_service_request_status_change
AFTER INSERT OR UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_request_status_change();

-- Ensure timestamp updates happen in a BEFORE UPDATE trigger
DROP TRIGGER IF EXISTS update_request_timestamps_trigger ON public.service_requests;
CREATE TRIGGER update_request_timestamps_trigger
BEFORE UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_request_timestamps();