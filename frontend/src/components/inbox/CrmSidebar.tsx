import React, { useState } from 'react';
import { Info, User, Clock, Copy, Check } from 'lucide-react';
import type { Conversation } from '@/types/inbox';
import type { CurrentUser } from '@/types/auth';

interface CrmSidebarProps {
  conversation: Conversation | null | undefined;
  currentUser: CurrentUser;
}

import { API_URL } from '@/lib/config';

export default function CrmSidebar({ conversation, currentUser }: CrmSidebarProps) {
  const [copied, setCopied] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [revealedNumber, setRevealedNumber] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');

  // Sync localTags when conversation changes
  React.useEffect(() => {
    if (conversation?.tags) {
      setLocalTags(conversation.tags);
    } else {
      setLocalTags([]);
    }
  }, [conversation]);

  // A revealed real phone number must never survive a switch to a different
  // conversation - otherwise it renders as if it belonged to the new customer.
  React.useEffect(() => {
    setRevealedNumber(null);
    setIsRevealing(false);
    setRevealError('');
  }, [conversation?.id]);

  const handleUpdateTags = async (updatedTags: string[]) => {
    if (!conversation) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`${API_URL}/api/conversations/${conversation.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tags: updatedTags })
      });
      if (res.ok) {
        setLocalTags(updatedTags);
        // Note: the parent component should ideally re-fetch or be updated via websocket, 
        // but local state gives immediate feedback
      }
    } catch (err) {
      console.error('Failed to update tags', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim()) {
      setIsAddingTag(false);
      return;
    }
    const tag = newTag.trim();
    if (!localTags.includes(tag)) {
      handleUpdateTags([...localTags, tag]);
    }
    setNewTag('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    handleUpdateTags(localTags.filter(t => t !== tagToRemove));
  };

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-bg-surface)] border-l border-[var(--color-border-subtle)]">
        <p className="text-[var(--color-text-muted)] flex items-center gap-2">
          <Info size={16} /> CRM Context
        </p>
      </div>
    );
  }

  const handleCopyAlias = () => {
    if (revealedNumber) {
      navigator.clipboard.writeText(revealedNumber);
    } else if (conversation.masked_id) {
      navigator.clipboard.writeText(conversation.masked_id);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevealNumber = async () => {
    setIsRevealing(true);
    setRevealError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/reveal-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversation_id: conversation.id })
      });
      const data = await res.json();
      if (res.ok) {
        setRevealedNumber(data.data.real_phone_number);
      } else {
        setRevealError(data.message || 'Failed to reveal number');
      }
    } catch (err) {
      setRevealError('Network error');
    } finally {
      setIsRevealing(false);
    }
  };

  return (
    <div className="h-full bg-[var(--color-bg-surface)] border-l border-[var(--color-border-subtle)] p-6 overflow-y-auto shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
      <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-8 flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-4">
        <Info size={20} className="text-[var(--color-brand-primary)]" />
        CRM Details
      </h3>

      <div className="space-y-8">
        {/* Profile Card */}
        <div className="flex flex-col items-center gap-4 bg-gradient-to-b from-emerald-50/50 to-transparent p-6 rounded-2xl border border-emerald-100/50">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-[var(--color-brand-active)] shadow-inner">
            <User size={32} />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--color-text-primary)]">{conversation.whatsapp_name || "Unknown Customer"}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <p className="text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-bg-base)] px-2 py-1 rounded-md shadow-sm">
                {revealedNumber ? revealedNumber : conversation.masked_id}
              </p>
              <button
                onClick={handleCopyAlias}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-brand-primary)] transition-colors p-1"
                title="Copy Number"
              >
                {copied ? <Check size={14} className="text-[var(--color-status-success)]" /> : <Copy size={14} />}
              </button>
            </div>
            {!revealedNumber && currentUser.role === 'ADMIN' && (
              <div className="mt-3">
                <button
                  onClick={handleRevealNumber}
                  disabled={isRevealing}
                  className="text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors shadow-sm bg-[var(--color-bg-surface)]"
                  title="Reveal Masked Number"
                >
                  {isRevealing ? 'Revealing...' : 'Reveal Number'}
                </button>
                {revealError && <p className="text-[var(--color-status-error)] text-xs mt-1">{revealError}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Quick Actions</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled
              title="Coming soon"
              className="py-2 px-3 text-xs font-semibold bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-muted)] cursor-not-allowed"
            >
              Add Note
            </button>
            <button
              disabled
              title="Coming soon"
              className="py-2 px-3 text-xs font-semibold bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-muted)] cursor-not-allowed"
            >
              Mark Resolved
            </button>
          </div>
        </div>

        {/* Tags */}
        <div>
          <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 flex items-center justify-between">
            Tags
            <button 
              onClick={() => setIsAddingTag(!isAddingTag)} 
              className="text-[var(--color-brand-primary)] hover:bg-emerald-50 p-1 rounded transition-colors"
            >
              <Check size={14} className="hidden" /> + Add
            </button>
          </h4>
          <div className="flex flex-wrap gap-2">
            {localTags.map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 group">
                {tag}
                <button 
                  onClick={() => handleRemoveTag(tag)}
                  disabled={isUpdating}
                  className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-700 transition-opacity"
                >
                  &times;
                </button>
              </span>
            ))}
            {localTags.length === 0 && !isAddingTag && (
              <span className="text-xs text-[var(--color-text-muted)] italic">No tags assigned</span>
            )}
          </div>
          {isAddingTag && (
            <div className="mt-2 flex gap-2">
              <input 
                autoFocus
                type="text" 
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') {
                    setIsAddingTag(false);
                    setNewTag('');
                  }
                }}
                className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:border-[var(--color-brand-primary)]" 
                placeholder="Type tag & Enter"
              />
              <button 
                onClick={handleAddTag}
                disabled={isUpdating}
                className="px-2 py-1 text-xs bg-[var(--color-brand-primary)] text-white rounded hover:bg-[var(--color-brand-hover)] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Conversation Status</h4>
          <div className="flex items-center gap-2">
            <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold tracking-wide ${
              conversation.status === 'OPEN' ? 'bg-green-100 text-green-700 border border-green-200' :
              conversation.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
              'bg-[var(--color-bg-base)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]'
            }`}>
              {conversation.status}
            </span>
          </div>
        </div>

        {/* Activity */}
        <div>
          <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Last Activity</h4>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)] bg-[var(--color-bg-base)] p-3 rounded-xl border border-[var(--color-border-subtle)]">
            <Clock size={16} className="text-[var(--color-text-muted)]" />
            {conversation.last_message_at ? `${formatWhatsAppTime(conversation.last_message_at)}` : 'Never'}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatWhatsAppTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Active just now';
  
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `Active ${mins} minute${mins !== 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `Active ${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `Active ${days} day${days !== 1 ? 's' : ''} ago`;
  }
  
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
