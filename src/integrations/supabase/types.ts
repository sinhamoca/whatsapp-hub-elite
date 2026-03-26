export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      chatbot_edges: {
        Row: {
          created_at: string | null
          flow_id: string
          id: string
          keywords: string[]
          match_type: string
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          created_at?: string | null
          flow_id: string
          id?: string
          keywords?: string[]
          match_type?: string
          source_node_id: string
          target_node_id: string
        }
        Update: {
          created_at?: string | null
          flow_id?: string
          id?: string
          keywords?: string[]
          match_type?: string
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_edges_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flows: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string
          is_active: boolean
          name: string
          trigger_keywords: string[]
          trigger_match_type: string
          trigger_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          instance_id: string
          is_active?: boolean
          name: string
          trigger_keywords?: string[]
          trigger_match_type?: string
          trigger_type?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string
          is_active?: boolean
          name?: string
          trigger_keywords?: string[]
          trigger_match_type?: string
          trigger_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flows_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_node_responses: {
        Row: {
          content: string | null
          created_at: string | null
          delay_seconds: number
          id: string
          media_url: string | null
          node_id: string
          response_type: string
          sort_order: number
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          delay_seconds?: number
          id?: string
          media_url?: string | null
          node_id: string
          response_type?: string
          sort_order?: number
        }
        Update: {
          content?: string | null
          created_at?: string | null
          delay_seconds?: number
          id?: string
          media_url?: string | null
          node_id?: string
          response_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_node_responses_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_nodes: {
        Row: {
          absence_message: string | null
          absence_timeout_minutes: number | null
          created_at: string | null
          flow_id: string
          id: string
          label_id: string | null
          name: string
          position_x: number
          position_y: number
          type: string
        }
        Insert: {
          absence_message?: string | null
          absence_timeout_minutes?: number | null
          created_at?: string | null
          flow_id: string
          id?: string
          label_id?: string | null
          name?: string
          position_x?: number
          position_y?: number
          type?: string
        }
        Update: {
          absence_message?: string | null
          absence_timeout_minutes?: number | null
          created_at?: string | null
          flow_id?: string
          id?: string
          label_id?: string | null
          name?: string
          position_x?: number
          position_y?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_nodes_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sessions: {
        Row: {
          current_node_id: string | null
          flow_id: string
          id: string
          instance_id: string
          is_active: boolean
          jid: string
          last_interaction_at: string | null
          started_at: string | null
          user_id: string
        }
        Insert: {
          current_node_id?: string | null
          flow_id: string
          id?: string
          instance_id: string
          is_active?: boolean
          jid: string
          last_interaction_at?: string | null
          started_at?: string | null
          user_id: string
        }
        Update: {
          current_node_id?: string | null
          flow_id?: string
          id?: string
          instance_id?: string
          is_active?: boolean
          jid?: string
          last_interaction_at?: string | null
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_sessions_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_sessions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_labels: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          label_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          label_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_labels_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          instance_id: string
          jid: string
          name: string | null
          phone: string | null
          push_name: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          instance_id: string
          jid: string
          name?: string | null
          phone?: string | null
          push_name?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string
          jid?: string
          name?: string | null
          phone?: string | null
          push_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          contact_name: string | null
          created_at: string | null
          id: string
          instance_id: string
          jid: string
          last_message: string | null
          last_message_at: string | null
          unread_count: number | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          instance_id: string
          jid: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string
          jid?: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          api_url: string
          created_at: string | null
          id: string
          name: string
          phone: string | null
          token: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          api_url: string
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
          token: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          api_url?: string
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          token?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      labels: {
        Row: {
          color: string
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string | null
          from_me: boolean | null
          id: string
          instance_id: string
          jid: string
          media_mime: string | null
          media_url: string | null
          message_id: string | null
          msg_type: string | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          instance_id: string
          jid: string
          media_mime?: string | null
          media_url?: string | null
          message_id?: string | null
          msg_type?: string | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          instance_id?: string
          jid?: string
          media_mime?: string | null
          media_url?: string | null
          message_id?: string | null
          msg_type?: string | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
