import React, { useState } from 'react';
import { User, MessageCircle, Search, Filter } from 'lucide-react';
import type { Conversation } from '@/types/inbox';

interface ChatListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isSocketConnected?: boolean;
}

export default function ChatList({ conversations, selectedId, onSelect, isSocketConnected }: ChatListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Helper for human-readable time
  const formatTime = (isoString: string | null) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 172800) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredConversations = conversations.filter((conv) => {
    const matchesSearch = (conv.whatsapp_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (conv.masked_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUnread = showUnreadOnly ? (conv.unread_count > 0) : true;
    return matchesSearch && matchesUnread;
  });

  return (
    <div className="flex flex-col h-full border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]">
      <div className="p-4 border-b border-[var(--color-border-subtle)] space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-[var(--color-text-primary)] tracking-tight">Inbox</h2>
            <span
              className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-green-500' : 'bg-gray-300'}`}
              title={isSocketConnected ? 'Live updates connected' : 'Live updates disconnected'}
            />
          </div>
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`p-2 rounded-lg transition-colors ${showUnreadOnly ? 'bg-emerald-100 text-[var(--color-brand-primary)]' : 'text-gray-400 hover:bg-gray-100'}`}
            title="Filter unread"
          >
            <Filter size={18} />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-[var(--color-border-focus)] transition-shadow shadow-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredConversations.map((conv) => (
          <div
            key={conv.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(conv.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(conv.id);
              }
            }}
            className={`p-4 cursor-pointer border-b border-[var(--color-border-subtle)] transition-all duration-200 hover:bg-gray-50 flex items-center gap-3 focus:outline-none focus-visible:bg-gray-50 ${selectedId === conv.id ? 'bg-emerald-50 border-l-4 border-l-[var(--color-brand-primary)]' : 'border-l-4 border-l-transparent'}`}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-[var(--color-brand-primary)] shadow-sm flex-shrink-0">
              <User size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className={`font-bold truncate ${conv.unread_count > 0 ? 'text-gray-900' : 'text-[var(--color-text-primary)]'}`}>
                  {conv.whatsapp_name || conv.masked_id}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap">
                    {formatTime(conv.last_message_at)}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-sm truncate ${conv.unread_count > 0 ? 'font-semibold text-gray-800' : 'text-[var(--color-text-secondary)]'}`}>
                {conv.last_message_preview || "No messages yet"}
              </p>
            </div>
          </div>
        ))}
        {filteredConversations.length === 0 && (
          <div className="p-8 text-center text-[var(--color-text-secondary)] flex flex-col items-center justify-center h-full">
            <MessageCircle className="mb-3 opacity-30 text-gray-400" size={48} />
            <p className="font-medium text-gray-500">No conversations found</p>
          </div>
        )}
      </div>
    </div>
  );
}
