-- First, check if the trigger exists and drop it if needed
DROP TRIGGER IF EXISTS log_request_status_change_trigger ON public.service_requests;

-- Recreate the trigger as an AFTER trigger (not BEFORE)
-- This ensures the service_request row is committed before trying to insert into history
CREATE TRIGGER log_request_status_change_trigger
  AFTER INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.log_request_status_change();

-- Also update the trigger function to handle the timing correctly
CREATE OR REPLACE FUNCTION public.log_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only log if it's a new insert OR the status actually changed
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.request_status_history (request_id, status, changed_by)
    VALUES (NEW.id, NEW.status, COALESCE(auth.uid(), NEW.resident_id));
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Remove the timestamp update logic from trigger since we'll handle it via UPDATE statement
-- Update the service_requests table directly for timestamps
CREATE OR REPLACE FUNCTION public.update_request_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'assigned' AND NEW.assigned_at IS NULL THEN
    NEW.assigned_at = now();
  ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at = now();
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create BEFORE trigger for timestamp updates
DROP TRIGGER IF EXISTS update_request_timestamps_trigger ON public.service_requests;
CREATE TRIGGER update_request_timestamps_trigger
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_request_timestamps();