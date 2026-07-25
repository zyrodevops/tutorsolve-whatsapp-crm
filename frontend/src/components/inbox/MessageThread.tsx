import React, { useEffect, useState, useRef } from 'react';
import { MessageSquare, Send, AlertCircle } from 'lucide-react';
import { API_URL } from '@/lib/config';
import type { Message, NewMessagePayload } from '@/types/inbox';

interface MessageThreadProps {
  conversationId: string | null;
  newMessage?: NewMessagePayload | null;
}

const NEAR_BOTTOM_THRESHOLD_PX = 150;

export default function MessageThread({ conversationId, newMessage }: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const forceScrollRef = useRef(false);

  useEffect(() => {
    if (!conversationId) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_URL}/api/conversations/${conversationId}/messages`, {
          credentials: 'include'
        });
        if (res.ok) {
          const body = await res.json();
          setMessages(body.data);
        }
      } catch (err) {
        console.error('Failed to fetch messages', err);
      }
    };

    fetchMessages();
  }, [conversationId]);

  // Reset per-conversation UI state during render (guarded by the
  // lastConversationId comparison) rather than in an effect, since this is
  // reacting to a prop change, not synchronizing with an external system.
  const [lastConversationId, setLastConversationId] = useState<string | null>(null);
  if (conversationId !== lastConversationId) {
    setLastConversationId(conversationId);
    setSendError('');
  }

  // Handle incoming real-time messages. Applied during render (guarded by the
  // lastAppliedMessage comparison) rather than in an effect, since this is
  // reacting to a prop change, not synchronizing with an external system.
  const [lastAppliedMessage, setLastAppliedMessage] = useState<NewMessagePayload | null | undefined>(undefined);
  if (newMessage !== lastAppliedMessage) {
    setLastAppliedMessage(newMessage);
    if (newMessage && newMessage.conversation_id === conversationId) {
      setMessages(prev => {
        // Prevent duplicates in case of fast double-fires
        if (prev.find(m => m.id === newMessage.message.id)) return prev;
        return [...prev, newMessage.message];
      });
    }
  }

  const prevConversationIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Only yank the view to the newest message if the agent was already near
    // the bottom, just switched conversations, or just sent a message themselves
    // -- otherwise an incoming message would rip them away from history they're reading.
    const switchedConversation = prevConversationIdRef.current !== conversationId;
    prevConversationIdRef.current = conversationId;

    if (switchedConversation || isNearBottomRef.current || forceScrollRef.current) {
      endOfMessagesRef.current?.scrollIntoView({ behavior: (switchedConversation || forceScrollRef.current) ? 'auto' : 'smooth' });
      forceScrollRef.current = false;
    }
  }, [messages, conversationId]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending || !conversationId) return;
    setIsSending(true);
    setSendError('');

    try {
      const res = await fetch(`${API_URL}/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: inputText })
      });

      if (res.ok) {
        const body = await res.json();
        forceScrollRef.current = true;
        setMessages(prev => [...prev, body.data]);
        setInputText('');
      } else {
        const body = await res.json().catch(() => null);
        setSendError(body?.message || 'Message failed to send. Please try again.');
      }
    } catch (err) {
      console.error('Failed to send message', err);
      setSendError('Message failed to send. Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-gray-50/50">
        <div className="text-center text-gray-500">
          <MessageSquare className="mx-auto mb-4 opacity-30 text-gray-400" size={56} />
          <p className="text-xl font-semibold text-gray-700">Select a conversation</p>
          <p className="text-sm text-gray-400 mt-2">Message History will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-border-subtle)] bg-white/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <h3 className="font-semibold text-gray-800 text-lg">Message History</h3>
      </div>

      {/* Thread */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
        <div className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 my-6">
          <span className="bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
            Chat Started
          </span>
        </div>

        <div className="flex flex-col space-y-4">
          {messages.map((msg, index) => {
            const isAgent = msg.sender_type === 'AGENT';
            const msgDate = new Date(msg.timestamp);
            const prevMsgDate = index > 0 ? new Date(messages[index - 1].timestamp) : null;

            const showDateSeparator = !prevMsgDate || msgDate.toDateString() !== prevMsgDate.toDateString();

            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <div className="flex justify-center my-4">
                    <span className="bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm text-xs font-semibold uppercase tracking-widest text-gray-400">
                      {msgDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${isAgent ? 'bg-[var(--color-brand-primary)] text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.text_body}</p>
                    <div className={`text-[10px] mt-1 text-right ${isAgent ? 'text-emerald-100' : 'text-gray-400'}`}>
                      {msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--color-border-subtle)] bg-white">
        {sendError && (
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            {sendError}
          </div>
        )}
        <div className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-[var(--color-border-focus)] transition-all">
          <textarea
            placeholder="Type a message... (Shift+Enter for newline)"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
                // Reset height
                e.currentTarget.style.height = 'auto';
              }
            }}
            className="flex-1 px-3 py-2 bg-transparent resize-none focus:outline-none text-sm min-h-[40px] max-h-[150px] overflow-y-auto w-full leading-relaxed"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isSending}
            className="p-3 mb-1 bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-hover)] text-white rounded-full transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-md flex-shrink-0"
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
