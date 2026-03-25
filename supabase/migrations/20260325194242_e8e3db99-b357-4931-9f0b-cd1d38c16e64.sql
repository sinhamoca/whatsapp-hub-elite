-- Contacts table
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  jid text NOT NULL,
  name text DEFAULT '',
  push_name text DEFAULT '',
  phone text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(instance_id, jid)
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contacts"
  ON public.contacts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Conversations table
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  jid text NOT NULL,
  contact_name text DEFAULT '',
  last_message text DEFAULT '',
  last_message_at timestamptz DEFAULT now(),
  unread_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(instance_id, jid)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conversations"
  ON public.conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Messages table
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id text DEFAULT '',
  jid text NOT NULL,
  from_me boolean DEFAULT false,
  body text DEFAULT '',
  msg_type text DEFAULT 'text',
  media_url text DEFAULT '',
  media_mime text DEFAULT '',
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own messages"
  ON public.messages FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for messages and conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Add webhook_configured flag to instances
ALTER TABLE public.instances ADD COLUMN webhook_url text DEFAULT '';