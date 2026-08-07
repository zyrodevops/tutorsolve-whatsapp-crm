import React, { useState } from 'react';
import { Info, User, Clock, Copy, Check } from 'lucide-react';
import type { Conversation } from '@/types/inbox';
import type { CurrentUser } from '@/types/auth';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface CrmSidebarProps {
  conversation: Conversation | null | undefined;
  currentUser: CurrentUser;
  onAddNote?: () => void;
  onStatusChange?: (conversationId: string, newStatus: Conversation['status']) => void;
  onTagsChange?: (conversationId: string, tags: string[]) => void;
}

import { API_URL } from '@/lib/config';

interface MasterTag {
  id: string;
  name: string;
  color_hex: string;
}

export default function CrmSidebar({ conversation, currentUser, onAddNote, onStatusChange, onTagsChange }: CrmSidebarProps) {
  const [copied, setCopied] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [masterTags, setMasterTags] = useState<MasterTag[]>([]);

  React.useEffect(() => {
    const fetchMasterTags = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/tags`, { credentials: 'include' });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.data)) {
            setMasterTags(body.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch tags', err);
      }
    };
    fetchMasterTags();
  }, []);
  const [revealedNumber, setRevealedNumber] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [isMarkingResolved, setIsMarkingResolved] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);

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
    setResolveError('');
    setShowResolveConfirm(false);
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
        onTagsChange?.(conversation.id, updatedTags);
      }
    } catch (err) {
      console.error('Failed to update tags', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePickTag = (tagName: string) => {
    if (!localTags.includes(tagName)) {
      handleUpdateTags([...localTags, tagName]);
    }
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

  const handleMarkResolved = async () => {
    if (!conversation) return;
    setShowResolveConfirm(false);
    setIsMarkingResolved(true);
    setResolveError('');
    try {
      const res = await fetch(`${API_URL}/api/conversations/${conversation.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'RESOLVED' })
      });
      if (res.ok) {
        onStatusChange?.(conversation.id, 'RESOLVED');
      } else {
        const data = await res.json().catch(() => null);
        setResolveError(data?.message || 'Failed to mark resolved');
      }
    } catch (err) {
      setResolveError('Network error');
    } finally {
      setIsMarkingResolved(false);
    }
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
              onClick={onAddNote}
              disabled={!onAddNote}
              title={onAddNote ? 'Add an internal note' : 'Not available here'}
              className="py-2 px-3 text-xs font-semibold bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)] hover:border-[var(--color-brand-primary)] hover:text-[var(--color-brand-primary)] transition-colors disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed disabled:hover:border-[var(--color-border-subtle)] disabled:hover:text-[var(--color-text-muted)]"
            >
              Add Note
            </button>
            <button
              onClick={() => setShowResolveConfirm(true)}
              disabled={isMarkingResolved || conversation.status === 'RESOLVED'}
              title={conversation.status === 'RESOLVED' ? 'Already resolved' : 'Mark this conversation resolved'}
              className="py-2 px-3 text-xs font-semibold bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg text-[var(--color-text-primary)] hover:border-[var(--color-brand-primary)] hover:text-[var(--color-brand-primary)] transition-colors disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed disabled:hover:border-[var(--color-border-subtle)] disabled:hover:text-[var(--color-text-muted)]"
            >
              {isMarkingResolved ? 'Marking...' : 'Mark Resolved'}
            </button>
          </div>
          {resolveError && <p className="text-[var(--color-status-error)] text-xs mt-2">{resolveError}</p>}
        </div>

        {showResolveConfirm && (
          <ConfirmModal
            title="Mark this conversation as resolved?"
            description="The customer's chat will be marked resolved. You (or anyone else) can still reopen it later by messaging again, but this isn't something to click by accident."
            confirmLabel="Yes, Mark Resolved"
            onConfirm={handleMarkResolved}
            onCancel={() => setShowResolveConfirm(false)}
          />
        )}

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
            {localTags.map(tag => {
              const color = masterTags.find(t => t.name === tag)?.color_hex ?? '#3B82F6';
              return (
                <span
                  key={tag}
                  className="pl-2 pr-1.5 py-1 rounded-full text-xs font-semibold bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] flex items-center gap-1.5 group"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    disabled={isUpdating}
                    title={`Remove tag "${tag}"`}
                    aria-label={`Remove tag "${tag}"`}
                    className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] transition-opacity"
                  >
                    &times;
                  </button>
                </span>
              );
            })}
            {localTags.length === 0 && !isAddingTag && (
              <span className="text-xs text-[var(--color-text-muted)] italic">No tags assigned</span>
            )}
          </div>
          {isAddingTag && (
            <div className="mt-2 p-2 bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg flex flex-wrap gap-2">
              {(() => {
                const availableTags = masterTags.filter(t => !localTags.includes(t.name));
                if (masterTags.length === 0) {
                  return <span className="text-xs text-[var(--color-text-muted)] italic">No tags configured yet.</span>;
                }
                if (availableTags.length === 0) {
                  return <span className="text-xs text-[var(--color-text-muted)] italic">All available tags are already applied.</span>;
                }
                return availableTags.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handlePickTag(t.name)}
                    disabled={isUpdating}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:border-[var(--color-brand-primary)] transition-colors disabled:opacity-50"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color_hex }} />
                    {t.name}
                  </button>
                ));
              })()}
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

        {/* Assigned Agent */}
        <div>
          <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Assigned Agent</h4>
          <div className="flex items-center gap-2 text-sm font-medium bg-[var(--color-bg-base)] p-3 rounded-xl border border-[var(--color-border-subtle)]">
            <User size={16} className="text-[var(--color-text-muted)]" />
            {conversation.assigned_agent_name ? (
              <span className="text-[var(--color-text-primary)]">{conversation.assigned_agent_name}</span>
            ) : (
              <span className="text-[var(--color-text-muted)] italic">Unassigned</span>
            )}
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
