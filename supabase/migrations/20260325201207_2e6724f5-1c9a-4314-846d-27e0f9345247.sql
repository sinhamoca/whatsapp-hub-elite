INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true);

CREATE POLICY "Anyone can read media" ON storage.objects FOR SELECT USING (bucket_id = 'media');
CREATE POLICY "Service role can insert media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'media');
CREATE POLICY "Service role can delete media" ON storage.objects FOR DELETE USING (bucket_id = 'media');