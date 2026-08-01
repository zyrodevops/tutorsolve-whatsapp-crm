import React, { useEffect, useState, useRef } from 'react';
import { MessageSquare, Send, AlertCircle, ChevronLeft, Paperclip, X, Zap } from 'lucide-react';
import { API_URL } from '@/lib/config';
import type { Message, NewMessagePayload, Conversation } from '@/types/inbox';

interface MessageThreadProps {
  conversationId: string | null;
  conversation?: Conversation | null;
  newMessage?: NewMessagePayload | null;
  onBack?: () => void;
}

const NEAR_BOTTOM_THRESHOLD_PX = 150;

// Mirrors the server-side cap (MAX_UPLOAD_SIZE_BYTES in backend/app/core/config.py) so
// oversized files are rejected instantly instead of round-tripping to the server first.
const MAX_ATTACHMENT_SIZE_BYTES = 16 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];
const ATTACHMENT_ACCEPT = [...ALLOWED_ATTACHMENT_MIME_PREFIXES.map(p => `${p}*`), ...ALLOWED_DOCUMENT_MIME_TYPES].join(',');

function isAllowedAttachmentType(mimeType: string): boolean {
  return ALLOWED_ATTACHMENT_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))
    || ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType);
}

export default function MessageThread({ conversationId, conversation, newMessage, onBack }: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [sendError, setSendError] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isWindowClosed, setIsWindowClosed] = useState(false);
  const [quickReplies, setQuickReplies] = useState<{id: string, shortcut: string, message: string}[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('hello_world');

  useEffect(() => {
    const fetchQuickReplies = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/quick-replies`, { credentials: 'include' });
        if (res.ok) {
          const body = await res.json();
          setQuickReplies(body.data);
        }
      } catch (err) {
        console.error('Failed to fetch quick replies', err);
      }
    };
    fetchQuickReplies();
  }, []);

  // Check window expiry
  useEffect(() => {
    if (!conversation?.whatsapp_window_expires_at) {
      setIsWindowClosed(false);
      return;
    }
    
    const checkExpiry = () => {
      const expiresAt = new Date(conversation.whatsapp_window_expires_at as string);
      if (Number.isNaN(expiresAt.getTime())) {
        // Fail closed: an unparseable timestamp must not be treated as "window
        // still open" (new Date() > Invalid Date is always false), or the
        // 24-hour compliance rule would silently never lock the input.
        console.error('Unparseable whatsapp_window_expires_at, treating window as closed:', conversation.whatsapp_window_expires_at);
        setIsWindowClosed(true);
        return;
      }
      setIsWindowClosed(new Date() > expiresAt);
    };
    
    checkExpiry();
    const interval = setInterval(checkExpiry, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [conversation?.whatsapp_window_expires_at]);

  useEffect(() => {
    if (!conversationId) return;

    const fetchMessages = async () => {
      setIsLoadingMessages(true);
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
      } finally {
        setIsLoadingMessages(false);
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
    setAttachment(null);
    setAttachmentError('');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAttachmentError('');
    setAttachment(null);
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setAttachmentError(`"${file.name}" is too large. Max size is ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB.`);
      e.target.value = '';
      return;
    }
    if (!isAllowedAttachmentType(file.type)) {
      setAttachmentError(`Unsupported file type: ${file.type || 'unknown'}.`);
      e.target.value = '';
      return;
    }
    setAttachment(file);
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !attachment) || isSending || !conversationId) return;
    setIsSending(true);
    setSendError('');

    const endpoint = isNoteMode 
      ? `${API_URL}/api/conversations/${conversationId}/notes`
      : `${API_URL}/api/conversations/${conversationId}/messages`;

    const isMultipart = !!attachment && !isNoteMode;
    let bodyPayload: string | FormData;
    
    if (isMultipart) {
      const formData = new FormData();
      formData.append('file', attachment);
      formData.append('text', inputText);
      bodyPayload = formData;
    } else {
      bodyPayload = JSON.stringify({ text: inputText });
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: isMultipart ? undefined : { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: bodyPayload
      });

      if (res.ok) {
        const body = await res.json();
        forceScrollRef.current = true;
        setMessages(prev => [...prev, body.data]);
        setInputText('');
        setAttachment(null);
        if (isNoteMode) setIsNoteMode(false);
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

  const handleSendTemplate = async () => {
    if (isSending || !conversationId || !selectedTemplate) return;
    setIsSending(true);
    setSendError('');

    try {
      const res = await fetch(`${API_URL}/api/conversations/${conversationId}/messages/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ template_name: selectedTemplate })
      });

      if (res.ok) {
        const body = await res.json();
        forceScrollRef.current = true;
        setMessages(prev => [...prev, body.data]);
      } else {
        const body = await res.json().catch(() => null);
        setSendError(body?.message || 'Failed to send template.');
      }
    } catch (err) {
      console.error('Failed to send template', err);
      setSendError('Failed to send template. Check your connection.');
    } finally {
      setIsSending(false);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[var(--color-bg-base)]">
        <div className="text-center text-[var(--color-text-secondary)]">
          <MessageSquare className="mx-auto mb-4 opacity-30 text-[var(--color-text-muted)]" size={56} />
          <p className="text-xl font-semibold text-[var(--color-text-primary)]">Select a conversation</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">Message History will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-surface)] relative">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/80 backdrop-blur-md sticky top-0 z-10 shadow-sm flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden -ml-2 p-2 rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-base)] hover:text-[var(--color-text-primary)] transition-colors flex-shrink-0"
            title="Back to conversations"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <h3 className="font-semibold text-[var(--color-text-primary)] text-lg">Message History</h3>
      </div>

      {/* Thread */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6 bg-[var(--color-bg-base)]">
        <div className="text-center text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)] my-6">
          <span className="bg-[var(--color-bg-surface)] px-3 py-1 rounded-full border border-[var(--color-border-subtle)] shadow-sm">
            Chat Started
          </span>
        </div>

        <div className="flex flex-col space-y-4">
          {isLoadingMessages ? (
            <div className="animate-pulse space-y-6 flex flex-col">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                  <div className={`w-2/3 h-16 rounded-2xl ${i % 2 === 0 ? 'bg-emerald-100 rounded-br-none' : 'bg-gray-200 rounded-bl-none'}`}></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
            const isAgent = msg.sender_type === 'AGENT';
            const msgDate = new Date(msg.timestamp);
            const prevMsgDate = index > 0 ? new Date(messages[index - 1].timestamp) : null;
            const showDateSeparator = !prevMsgDate || msgDate.toDateString() !== prevMsgDate.toDateString();

            const isNote = msg.sender_type === 'INTERNAL_NOTE';

            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <div className="flex justify-center my-4">
                    <span className="bg-[var(--color-bg-surface)] px-3 py-1 rounded-full border border-[var(--color-border-subtle)] shadow-sm text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                      {msgDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                <div className={`flex ${isNote ? 'justify-center' : isAgent ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-xl px-4 py-3 shadow-sm ${
                    isNote ? 'bg-yellow-100 border border-yellow-200 text-yellow-900' :
                    isAgent ? 'bg-[var(--color-brand-primary)] text-white rounded-br-none' : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-bl-none'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.text_body}</p>
                    
                    {msg.media_url && msg.message_type === 'IMAGE' && (
                      <img src={`${API_URL}${msg.media_url}`} alt="Media" className="mt-2 rounded-lg max-w-full max-h-64 object-contain shadow-sm border border-black/5" />
                    )}
                    {msg.media_url && msg.message_type === 'VIDEO' && (
                      <video src={`${API_URL}${msg.media_url}`} controls className="mt-2 rounded-lg max-w-full max-h-64 shadow-sm border border-black/5" />
                    )}
                    {msg.media_url && (msg.message_type === 'DOCUMENT' || msg.message_type === 'AUDIO' || msg.message_type === 'VOICE') && (
                      <a href={`${API_URL}${msg.media_url}`} target="_blank" rel="noopener noreferrer" className={`mt-2 text-xs font-semibold underline flex items-center gap-1 p-2 rounded ${isAgent ? 'bg-emerald-600/30 text-white' : 'bg-blue-50 text-blue-600'}`}>
                        <Paperclip size={14} /> View Attachment
                      </a>
                    )}

                    <div className={`text-[10px] mt-1 text-right ${isNote ? 'text-yellow-600' : isAgent ? 'text-emerald-100' : 'text-[var(--color-text-muted)]'}`}>
                      {msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={endOfMessagesRef} />
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        {sendError && (
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            {sendError}
          </div>
        )}
        
        {attachmentError && (
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            {attachmentError}
          </div>
        )}

        {attachment && (
          <div className="mx-4 mb-2 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2 text-sm text-blue-700 truncate font-medium">
              <Paperclip size={16} />
              <span className="truncate">{attachment.name}</span>
            </div>
            <button onClick={() => setAttachment(null)} className="p-1 text-blue-400 hover:text-blue-700 hover:bg-blue-100 rounded-full transition-colors">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Quick Replies Popover */}
        {inputText.startsWith('/') && quickReplies.length > 0 && !isNoteMode && !isWindowClosed && (
          <div className="mx-4 mb-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto animate-in slide-in-from-bottom-2 fade-in">
            {quickReplies
              .filter(r => `/${r.shortcut}`.startsWith(inputText.toLowerCase()))
              .map(reply => (
                <button
                  key={reply.id}
                  onClick={() => setInputText(reply.message)}
                  className="w-full text-left px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-base)] focus:bg-[var(--color-bg-base)] transition-colors flex flex-col gap-1 focus:outline-none"
                >
                  <span className="font-mono text-xs font-bold text-[var(--color-brand-hover)] bg-emerald-50 px-2 py-0.5 rounded self-start">/{reply.shortcut}</span>
                  <span className="text-sm text-[var(--color-text-secondary)] truncate">{reply.message}</span>
                </button>
              ))}
            {quickReplies.filter(r => `/${r.shortcut}`.startsWith(inputText.toLowerCase())).length === 0 && (
              <div className="p-4 text-sm text-[var(--color-text-secondary)] text-center">No quick replies found.</div>
            )}
          </div>
        )}

        <div className={`flex items-end gap-3 border rounded-xl p-2 mx-4 mb-4 focus-within:ring-2 focus-within:ring-emerald-100 focus-within:border-[var(--color-border-focus)] transition-all ${isNoteMode ? 'bg-yellow-50 border-yellow-200' : 'bg-[var(--color-bg-base)] border-[var(--color-border-subtle)]'}`}>
          
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept={ATTACHMENT_ACCEPT}
            onChange={handleFileChange}
            disabled={isWindowClosed && !isNoteMode}
          />

          {!isNoteMode && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isWindowClosed}
              className={`p-2 rounded-full transition-colors ${isWindowClosed ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-secondary)] hover:text-blue-600 hover:bg-blue-50'}`}
              title="Attach File"
            >
              <Paperclip size={20} />
            </button>
          )}

          <button
            onClick={() => setIsNoteMode(!isNoteMode)}
            className={`p-2 rounded-full transition-colors ${isNoteMode ? 'text-yellow-600 bg-yellow-100' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-subtle)]'}`}
            title="Toggle Internal Note"
          >
            <AlertCircle size={20} />
          </button>

          {isWindowClosed && !isNoteMode ? (
            <div className="flex-1 px-3 py-2 bg-[var(--color-bg-base)] rounded-lg flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] flex-1">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <span className="truncate text-xs sm:text-sm">Window closed. Send a template:</span>
                <select
                  className="bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-32"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                >
                  <option value="hello_world">hello_world</option>
                </select>
              </div>
            </div>
          ) : (
            <textarea
              placeholder={isNoteMode ? "Type an internal note..." : "Type a message... (Shift+Enter for newline)"}
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
                  e.currentTarget.style.height = 'auto';
                }
              }}
              className="flex-1 px-3 py-2 bg-transparent resize-none focus:outline-none text-sm min-h-[40px] max-h-[150px] overflow-y-auto w-full leading-relaxed"
              rows={1}
            />
          )}

          <button
            onClick={isWindowClosed && !isNoteMode ? handleSendTemplate : handleSend}
            disabled={((!inputText.trim() && !attachment) && !(isWindowClosed && !isNoteMode)) || isSending || (isWindowClosed && !isNoteMode && !selectedTemplate)}
            className={`p-3 mb-1 text-white rounded-full transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-md flex-shrink-0 ${isNoteMode ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-hover)]'}`}
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
