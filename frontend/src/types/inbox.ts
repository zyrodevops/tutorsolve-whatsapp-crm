export interface Conversation {
  id: string;
  status: 'OPEN' | 'PENDING' | 'RESOLVED';
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  assigned_agent_id: string | null;
  masked_id: string;
  whatsapp_name: string | null;
  profile_photo_url: string | null;
  tags?: string[];
  whatsapp_window_expires_at?: string | null;
}

export interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  sender_type: 'CUSTOMER' | 'AGENT' | 'SYSTEM' | 'INTERNAL_NOTE';
  message_type: string;
  text_body: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  delivery_status: string;
  timestamp: string;
}

export interface NewMessagePayload {
  conversation_id: string;
  message: Message;
}
