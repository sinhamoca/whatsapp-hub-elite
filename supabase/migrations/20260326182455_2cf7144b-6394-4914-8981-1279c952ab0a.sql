
-- Chatbot flows
CREATE TABLE public.chatbot_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instance_id uuid REFERENCES public.instances(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own flows" ON public.chatbot_flows FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chatbot nodes
CREATE TABLE public.chatbot_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.chatbot_flows(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL DEFAULT 'response',
  name text NOT NULL DEFAULT 'Novo nó',
  position_x float NOT NULL DEFAULT 0,
  position_y float NOT NULL DEFAULT 0,
  absence_message text DEFAULT '',
  absence_timeout_minutes integer DEFAULT 0,
  label_id uuid REFERENCES public.labels(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chatbot_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own nodes" ON public.chatbot_nodes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chatbot_flows WHERE chatbot_flows.id = chatbot_nodes.flow_id AND chatbot_flows.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chatbot_flows WHERE chatbot_flows.id = chatbot_nodes.flow_id AND chatbot_flows.user_id = auth.uid()));

-- Chatbot edges (connections between nodes with keywords)
CREATE TABLE public.chatbot_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.chatbot_flows(id) ON DELETE CASCADE NOT NULL,
  source_node_id uuid REFERENCES public.chatbot_nodes(id) ON DELETE CASCADE NOT NULL,
  target_node_id uuid REFERENCES public.chatbot_nodes(id) ON DELETE CASCADE NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  match_type text NOT NULL DEFAULT 'contains',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chatbot_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own edges" ON public.chatbot_edges FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chatbot_flows WHERE chatbot_flows.id = chatbot_edges.flow_id AND chatbot_flows.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chatbot_flows WHERE chatbot_flows.id = chatbot_edges.flow_id AND chatbot_flows.user_id = auth.uid()));

-- Node responses (sequential messages)
CREATE TABLE public.chatbot_node_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid REFERENCES public.chatbot_nodes(id) ON DELETE CASCADE NOT NULL,
  response_type text NOT NULL DEFAULT 'text',
  content text DEFAULT '',
  media_url text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  delay_seconds integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chatbot_node_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own responses" ON public.chatbot_node_responses FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chatbot_nodes n
    JOIN public.chatbot_flows f ON f.id = n.flow_id
    WHERE n.id = chatbot_node_responses.node_id AND f.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chatbot_nodes n
    JOIN public.chatbot_flows f ON f.id = n.flow_id
    WHERE n.id = chatbot_node_responses.node_id AND f.user_id = auth.uid()
  ));

-- Chatbot sessions (track lead progress)
CREATE TABLE public.chatbot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instance_id uuid REFERENCES public.instances(id) ON DELETE CASCADE NOT NULL,
  flow_id uuid REFERENCES public.chatbot_flows(id) ON DELETE CASCADE NOT NULL,
  current_node_id uuid REFERENCES public.chatbot_nodes(id) ON DELETE SET NULL,
  jid text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz DEFAULT now(),
  last_interaction_at timestamptz DEFAULT now()
);

ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sessions" ON public.chatbot_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
