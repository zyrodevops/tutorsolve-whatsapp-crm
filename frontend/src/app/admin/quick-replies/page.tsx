'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquarePlus, Trash2, Plus, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import AppShell from '@/components/layout/AppShell';
import { PageShell } from '@/components/ui/PageShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { CurrentUser } from '@/types/auth';

interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
  created_at: string;
}

function QuickRepliesContent() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newShortcut, setNewShortcut] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingDeleteReply, setPendingDeleteReply] = useState<QuickReply | null>(null);

  const router = useRouter();

  const closeAddModal = () => {
    setShowAdd(false);
    setNewShortcut('');
    setNewMessage('');
    setFormError('');
  };

  const fetchReplies = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/quick-replies`, { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        router.push('/login');
        return;
      }
      const payload = await res.json();
      if (res.ok) {
        setReplies(payload.data);
        setError('');
      } else {
        setError(payload.message || 'Failed to load quick replies.');
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
  }, [router]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortcut.trim() || !newMessage.trim()) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/quick-replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shortcut: newShortcut.trim(), message: newMessage.trim() })
      });
      const payload = await res.json();
      if (res.ok) {
        setReplies([...replies, payload.data]);
        closeAddModal();
      } else {
        setFormError(payload.message || 'Failed to add quick reply');
      }
    } catch (err) {
      setFormError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDeleteReply) return;
    const id = pendingDeleteReply.id;
    setPendingDeleteReply(null);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/quick-replies/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setReplies(replies.filter(r => r.id !== id));
      } else {
        setError('Failed to delete quick reply.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={<Zap className="w-6 h-6" />}
        title="Quick Replies"
        subtitle={
          <>
            Manage shortcuts for common messages. Type{' '}
            <kbd className="px-2 py-1 bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded text-xs font-mono">/</kbd>{' '}
            in chat to use them.
          </>
        }
        actions={
          <Button onClick={() => setShowAdd(true)} className="flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            Add Shortcut
          </Button>
        }
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading quick replies..." />
      ) : (
        <div className="grid gap-4">
          {replies.length === 0 ? (
            <div className="text-center p-12 bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-subtle)] border-dashed">
              <MessageSquarePlus className="mx-auto h-12 w-12 text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">No quick replies yet</h3>
              <p className="text-[var(--color-text-secondary)] mt-1">Create one to save your team time.</p>
            </div>
          ) : (
            replies.map(reply => (
              <div key={reply.id} className="bg-[var(--color-bg-surface)] p-5 rounded-xl border border-[var(--color-border-subtle)] shadow-sm flex items-start justify-between gap-4 hover:border-[var(--color-brand-primary)] transition-colors">
                <div>
                  <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-[var(--color-brand-active)] font-mono text-sm font-bold border border-emerald-100 mb-2">
                    /{reply.shortcut}
                  </div>
                  <p className="text-[var(--color-text-primary)] whitespace-pre-wrap">{reply.message}</p>
                </div>
                <button
                  onClick={() => setPendingDeleteReply(reply)}
                  className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  title="Delete shortcut"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeAddModal}
        >
          <div
            className="bg-[var(--color-bg-surface)] w-full max-w-md rounded-xl shadow-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-6">Add Shortcut</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="relative">
                <Input
                  id="shortcut"
                  label="Shortcut (e.g., hello)"
                  required
                  value={newShortcut}
                  onChange={e => setNewShortcut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  className="pl-8 font-mono"
                  placeholder="shortcut"
                />
                <span className="absolute left-3 top-[34px] text-[var(--color-text-muted)] font-mono">/</span>
              </div>
              <Textarea
                id="message"
                label="Message"
                required
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                className="h-24"
                placeholder="Hi there! How can we help you today?"
              />

              {formError && (
                <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <Button type="button" variant="ghost" onClick={closeAddModal}>Cancel</Button>
                <Button type="submit" isLoading={isSubmitting}>Save Quick Reply</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDeleteReply && (
        <ConfirmModal
          title="Delete this quick reply?"
          description={
            <>
              The shortcut <span className="font-mono font-medium text-[var(--color-text-primary)]">/{pendingDeleteReply.shortcut}</span> will no longer be available to any agent. This can&apos;t be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDeleteReply(null)}
        />
      )}
    </PageShell>
  );
}

function NotAuthorized() {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-50 text-[var(--color-status-error)] rounded-full flex items-center justify-center mx-auto mb-4">
          <Zap size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Access Restricted</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Only administrators can manage quick replies.</p>
      </div>
    </div>
  );
}

export default function QuickRepliesPage() {
  return (
    <AppShell>
      {(user: CurrentUser) => (user.role === 'ADMIN' ? <QuickRepliesContent /> : <NotAuthorized />)}
    </AppShell>
  );
}
