'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { API_URL } from '@/lib/config';
import { useSocket } from '@/hooks/useSocket';
import type { Conversation, NewMessagePayload } from '@/types/inbox';

export interface MessageStatusUpdatePayload {
  conversation_id: string;
  message_id: string;
  delivery_status: string;
}

interface InboxContextType {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  loadError: string;
  newMessage: NewMessagePayload | null;
  messageStatusUpdate: MessageStatusUpdatePayload | null;
  totalUnreadCount: number;
  markAsRead: (conversationId: string) => void;
  isConnected: boolean;
  isLoading: boolean;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadError, setLoadError] = useState('');
  const [newMessage, setNewMessage] = useState<NewMessagePayload | null>(null);
  const [messageStatusUpdate, setMessageStatusUpdate] = useState<MessageStatusUpdatePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { on, off, isConnected } = useSocket();

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`, { credentials: 'include' });
      if (res.ok) {
        const body = await res.json();
        setConversations(body.data);
        setLoadError('');
      } else {
        setLoadError('Failed to load conversations.');
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
      setLoadError('Failed to load conversations.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Any new_message/conversation_updated events emitted while disconnected
  // are permanently missed (no server-side replay), so a reconnect must
  // resync state -- but skip the very first connect, since the mount effect
  // above already fetched.
  const hasConnectedBeforeRef = useRef(false);
  useEffect(() => {
    if (!isConnected) return;
    if (!hasConnectedBeforeRef.current) {
      hasConnectedBeforeRef.current = true;
      return;
    }
    fetchConversations();
  }, [isConnected, fetchConversations]);

  useEffect(() => {
    const onNewMessage = (payload: NewMessagePayload) => {
      const { conversation_id, message } = payload;
      setNewMessage(payload);

      setConversations((prev: Conversation[]) => {
        const convExists = prev.find((c) => c.id === conversation_id);
        if (convExists) {
          // If the message is from the customer, increment unread. 
          // If from an agent, keep unread as is (since agents don't increment unread for themselves).
          const isCustomer = message.sender_type === 'CUSTOMER';
          
          return prev.map((c) =>
            c.id === conversation_id
              ? { 
                  ...c, 
                  last_message_preview: (message.text_body ?? '').substring(0, 50), 
                  unread_count: isCustomer ? (c.unread_count || 0) + 1 : c.unread_count, 
                  last_message_at: message.timestamp 
                }
              : c
          ).sort((a, b) => new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime());
        } else {
          // New conversation created, fetch all
          fetchConversations();
          return prev;
        }
      });
    };

    const onConversationUpdated = (payload: { conversation_id: string, whatsapp_window_expires_at: string }) => {
      setConversations(prev => prev.map(c => 
        c.id === payload.conversation_id 
          ? { ...c, whatsapp_window_expires_at: payload.whatsapp_window_expires_at }
          : c
      ));
    };

    const onMessageStatusUpdated = (payload: MessageStatusUpdatePayload) => {
      setMessageStatusUpdate(payload);
    };

    on('new_message', onNewMessage as (...args: unknown[]) => void);
    on('conversation_updated', onConversationUpdated as (...args: unknown[]) => void);
    on('message_status_updated', onMessageStatusUpdated as (...args: unknown[]) => void);

    return () => {
      off('new_message', onNewMessage as (...args: unknown[]) => void);
      off('conversation_updated', onConversationUpdated as (...args: unknown[]) => void);
      off('message_status_updated', onMessageStatusUpdated as (...args: unknown[]) => void);
    };
  }, [on, off, fetchConversations]);

  const markAsRead = useCallback((conversationId: string) => {
    setConversations((prev) => 
      prev.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
    );
  }, []);

  const totalUnreadCount = conversations.reduce((acc, curr) => acc + (curr.unread_count || 0), 0);

  return (
    <InboxContext.Provider value={{ 
      conversations, 
      setConversations, 
      loadError,
      newMessage,
      messageStatusUpdate,
      totalUnreadCount,
      markAsRead,
      isConnected,
      isLoading
    }}>
      {children}
    </InboxContext.Provider>
  );
}

export function useInbox() {
  const context = useContext(InboxContext);
  if (context === undefined) {
    throw new Error('useInbox must be used within an InboxProvider');
  }
  return context;
}
