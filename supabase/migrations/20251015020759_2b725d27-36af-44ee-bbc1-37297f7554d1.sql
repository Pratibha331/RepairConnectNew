-- Create enum for service request status
CREATE TYPE public.request_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');

-- Create service_requests table
CREATE TABLE public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.provider_profiles(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.service_categories(id) ON DELETE RESTRICT,
  status public.request_status NOT NULL DEFAULT 'pending',
  description TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  location_lat NUMERIC NOT NULL,
  location_lng NUMERIC NOT NULL,
  location_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assigned_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create request_status_history table for tracking status changes
CREATE TABLE public.request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  status public.request_status NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_requests

-- Residents can view their own requests
CREATE POLICY "Residents can view their own requests"
ON public.service_requests
FOR SELECT
USING (auth.uid() = resident_id);

-- Providers can view requests assigned to them
CREATE POLICY "Providers can view assigned requests"
ON public.service_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.provider_profiles
    WHERE provider_profiles.id = service_requests.provider_id
      AND provider_profiles.user_id = auth.uid()
  )
);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests"
ON public.service_requests
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Residents can create requests
CREATE POLICY "Residents can create requests"
ON public.service_requests
FOR INSERT
WITH CHECK (auth.uid() = resident_id);

-- Residents can update their own pending requests
CREATE POLICY "Residents can update own pending requests"
ON public.service_requests
FOR UPDATE
USING (auth.uid() = resident_id AND status = 'pending');

-- Providers can update their assigned requests
CREATE POLICY "Providers can update assigned requests"
ON public.service_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.provider_profiles
    WHERE provider_profiles.id = service_requests.provider_id
      AND provider_profiles.user_id = auth.uid()
  )
);

-- Admins can update all requests
CREATE POLICY "Admins can update all requests"
ON public.service_requests
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for request_status_history

-- Users can view history for their own requests or assigned requests
CREATE POLICY "Users can view relevant request history"
ON public.request_status_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE service_requests.id = request_status_history.request_id
      AND (
        service_requests.resident_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.provider_profiles
          WHERE provider_profiles.id = service_requests.provider_id
            AND provider_profiles.user_id = auth.uid()
        )
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

-- System can insert status history (handled by triggers)
CREATE POLICY "Authenticated users can insert status history"
ON public.request_status_history
FOR INSERT
WITH CHECK (auth.uid() = changed_by);

-- Create trigger to update updated_at on service_requests
CREATE TRIGGER update_service_requests_updated_at
BEFORE UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to automatically log status changes
CREATE OR REPLACE FUNCTION public.log_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.request_status_history (request_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
    
    -- Update timestamp fields based on status
    IF NEW.status = 'assigned' AND NEW.assigned_at IS NULL THEN
      NEW.assigned_at = now();
    ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to log status changes
CREATE TRIGGER log_service_request_status_change
BEFORE INSERT OR UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_request_status_change();

-- Create indexes for performance
CREATE INDEX idx_service_requests_resident_id ON public.service_requests(resident_id);
CREATE INDEX idx_service_requests_provider_id ON public.service_requests(provider_id);
CREATE INDEX idx_service_requests_category_id ON public.service_requests(category_id);
CREATE INDEX idx_service_requests_status ON public.service_requests(status);
CREATE INDEX idx_service_requests_location ON public.service_requests(location_lat, location_lng);
CREATE INDEX idx_request_status_history_request_id ON public.request_status_history(request_id);