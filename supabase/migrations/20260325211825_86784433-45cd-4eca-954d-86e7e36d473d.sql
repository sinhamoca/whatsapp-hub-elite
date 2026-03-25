ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT '';
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT '';
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public read access for avatars" ON storage.objects FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "Authenticated users can upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Service role full access to avatars" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'avatars');