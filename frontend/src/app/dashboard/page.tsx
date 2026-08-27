'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import ChatList from '@/components/inbox/ChatList';
import MessageThread from '@/components/inbox/MessageThread';
import CrmSidebar from '@/components/inbox/CrmSidebar';
import { InboxProvider, useInbox } from '@/context/InboxContext';
import type { CurrentUser } from '@/types/auth';
import type { Conversation } from '@/types/inbox';

function InboxContent({ currentUser }: { currentUser: CurrentUser }) {
  const { conversations, setConversations, loadError, newMessage, messageStatusUpdate, isConnected, markAsRead, isLoading } = useInbox();

  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [isNoteMode, setIsNoteMode] = useState(false);

  // Resizable left pane (desktop only -- see isDesktop below)
  const [leftWidth, setLeftWidth] = useState(384); // Default 384px (w-96)
  const isDragging = useRef(false);

  // Collapsible right pane
  const [showSidebar, setShowSidebar] = useState(false);

  // Below the lg breakpoint there isn't room for a fixed-width chat list plus
  // a message thread side by side, so we fall back to a single-pane, mobile-style
  // list/detail view instead of the desktop resizable layout.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  // Handlers for resizing
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = 'default';
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isDragging.current) {
      // Allow resizing between 300px and 600px
      const newWidth = Math.max(300, Math.min(e.clientX - 80, 600)); // 80px offset for the AppShell nav bar
      setLeftWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const handleSelectChat = (id: string) => {
    setActiveChat(id);
    setIsNoteMode(false); // Note-composing state shouldn't carry over to a different conversation.
    markAsRead(id); // Optimistic UI update
  };

  const handleAddNote = () => {
    setIsNoteMode(true);
    setShowSidebar(false); // Reveal the compose box behind the CRM sidebar overlay on mobile.
  };

  const handleStatusChange = (conversationId: string, newStatus: Conversation['status']) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, status: newStatus } : c))
    );
  };

  const handleTagsChange = (conversationId: string, tags: string[]) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, tags } : c))
    );
  };

  const activeConversation = conversations.find((c) => c.id === activeChat);

  return (
    <div className="relative flex h-full overflow-hidden bg-gray-50/30">
      {loadError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-red-50 border border-red-200 text-[var(--color-status-error)] text-sm rounded-lg shadow-md">
          {loadError}
        </div>
      )}

      {/* Left Pane: Chat List -- full-width single pane on mobile, fixed-width resizable pane on desktop */}
      <div
        style={isDesktop ? { width: leftWidth } : undefined}
        className={`${activeChat ? 'hidden lg:flex' : 'flex'} w-full lg:w-auto flex-shrink-0 border-r border-[var(--color-border-subtle)] bg-white flex-col z-10 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.02)]`}
      >
        <ChatList
          conversations={conversations}
          selectedId={activeChat}
          onSelect={handleSelectChat}
          isSocketConnected={isConnected}
          isLoading={isLoading}
        />
      </div>

      {/* Resizer Handle (desktop only -- dragging doesn't apply to the mobile single-pane layout) */}
      <div
        className="hidden lg:block w-1 cursor-col-resize hover:bg-[var(--color-brand-primary)] hover:w-1.5 transition-all bg-transparent z-20 flex-shrink-0"
        onMouseDown={startResizing}
      />

      {/* Middle Pane: Message Thread -- hidden on mobile until a conversation is selected */}
      <div className={`${activeChat ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-w-0 bg-transparent relative`}>
        <MessageThread
          conversationId={activeChat}
          conversation={activeConversation ?? null}
          newMessage={newMessage}
          messageStatusUpdate={messageStatusUpdate}
          onBack={() => setActiveChat(null)}
          isNoteMode={isNoteMode}
          onNoteModeChange={setIsNoteMode}
        />

        {/* Floating Action Button for CRM Details */}
        {activeChat && !showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="absolute top-2.5 right-4 w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center text-[var(--color-brand-primary)] hover:scale-105 hover:bg-emerald-50 border border-[var(--color-border-subtle)] transition-all z-20 group"
            title="Show CRM Details"
          >
            <Info size={20} className="group-hover:rotate-12 transition-transform" />
          </button>
        )}
      </div>

      {/* Right Pane: Collapsible CRM Context */}
      <div
        className={`absolute top-0 right-0 h-full w-full md:max-w-[340px] bg-white border-l border-[var(--color-border-subtle)] shadow-2xl z-30 transform transition-transform duration-300 ease-in-out ${showSidebar ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="absolute top-4 right-4 z-40">
          <button
            onClick={() => setShowSidebar(false)}
            className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 shadow-sm transition-colors border border-gray-100"
            title="Close CRM Details"
          >
            <X size={18} />
          </button>
        </div>
        <CrmSidebar
          conversation={activeConversation ?? null}
          currentUser={currentUser}
          onAddNote={handleAddNote}
          onStatusChange={handleStatusChange}
          onTagsChange={handleTagsChange}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <InboxProvider>
      <AppShell>
        {(user: CurrentUser) => <InboxContent currentUser={user} />}
      </AppShell>
    </InboxProvider>
  );
}
