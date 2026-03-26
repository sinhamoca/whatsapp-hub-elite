ALTER TABLE public.chatbot_flows ADD COLUMN trigger_type text NOT NULL DEFAULT 'keyword';
ALTER TABLE public.chatbot_flows ADD COLUMN trigger_keywords text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.chatbot_flows ADD COLUMN trigger_match_type text NOT NULL DEFAULT 'contains';