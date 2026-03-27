
-- Table for scheduled message configurations per label
CREATE TABLE public.label_scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  delay_minutes INTEGER NOT NULL DEFAULT 60,
  message_1 TEXT NOT NULL DEFAULT '',
  message_2 TEXT,
  message_3 TEXT,
  message_4 TEXT,
  media_url TEXT,
  media_type TEXT DEFAULT 'none',
  caption TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.label_scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scheduled messages"
  ON public.label_scheduled_messages
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Table to track which scheduled messages have been sent to which contacts
CREATE TABLE public.label_scheduled_sends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_message_id UUID NOT NULL REFERENCES public.label_scheduled_messages(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  contact_label_id UUID NOT NULL REFERENCES public.contact_labels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(scheduled_message_id, contact_label_id)
);

ALTER TABLE public.label_scheduled_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scheduled sends"
  ON public.label_scheduled_sends
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.label_scheduled_messages lsm
    WHERE lsm.id = label_scheduled_sends.scheduled_message_id
    AND lsm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.label_scheduled_messages lsm
    WHERE lsm.id = label_scheduled_sends.scheduled_message_id
    AND lsm.user_id = auth.uid()
  ));
