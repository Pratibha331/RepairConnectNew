-- Create storage bucket for service request photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photos', 'service-photos', true);

-- Create storage policies for service request photos

-- Anyone can view photos (since bucket is public)
CREATE POLICY "Anyone can view service photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'service-photos');

-- Authenticated users can upload photos
CREATE POLICY "Authenticated users can upload service photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'service-photos'
  AND auth.role() = 'authenticated'
);

-- Users can update their own photos
CREATE POLICY "Users can update own service photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'service-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own photos
CREATE POLICY "Users can delete own service photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'service-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);