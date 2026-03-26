
-- Labels table: stores label definitions per user
CREATE TABLE public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own labels"
  ON public.labels FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Junction table: many-to-many between contacts and labels
CREATE TABLE public.contact_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(contact_id, label_id)
);

ALTER TABLE public.contact_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contact labels"
  ON public.contact_labels FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.contacts WHERE contacts.id = contact_labels.contact_id AND contacts.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.contacts WHERE contacts.id = contact_labels.contact_id AND contacts.user_id = auth.uid())
  );
