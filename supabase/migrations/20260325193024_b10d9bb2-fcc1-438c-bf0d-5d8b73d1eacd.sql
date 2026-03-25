CREATE TABLE public.instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text DEFAULT '',
  api_url text NOT NULL,
  token text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own instances"
  ON public.instances
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);