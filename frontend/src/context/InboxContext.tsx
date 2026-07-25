'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API_URL } from '@/lib/config';
import { useSocket } from '@/hooks/useSocket';
import type { Conversation, NewMessagePayload } from '@/types/inbox';

interface InboxContextType {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  loadError: string;
  newMessage: NewMessagePayload | null;
  totalUnreadCount: number;
  markAsRead: (conversationId: string) => void;
  isConnected: boolean;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadError, setLoadError] = useState('');
  const [newMessage, setNewMessage] = useState<NewMessagePayload | null>(null);

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
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

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

    on('new_message', onNewMessage as (...args: unknown[]) => void);
    return () => {
      off('new_message', onNewMessage as (...args: unknown[]) => void);
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
      totalUnreadCount,
      markAsRead,
      isConnected
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
