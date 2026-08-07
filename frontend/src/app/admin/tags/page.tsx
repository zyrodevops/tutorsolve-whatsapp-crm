'use client';

import React, { useState, useEffect } from 'react';
import { Tag as TagIcon, Trash2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import AppShell from '@/components/layout/AppShell';
import { PageShell } from '@/components/ui/PageShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { CurrentUser } from '@/types/auth';

interface Tag {
  id: string;
  name: string;
  color_hex: string;
}

const DEFAULT_COLOR = '#10B981';

function TagsContent() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState(DEFAULT_COLOR);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const router = useRouter();

  const closeAddModal = () => {
    setShowAdd(false);
    setName('');
    setColorHex(DEFAULT_COLOR);
    setFormError('');
  };

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/tags`, { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          router.push('/login');
          return;
        }
        const payload = await res.json();
        if (res.ok) {
          setTags(payload.data);
          setError('');
        } else {
          setError(payload.message || 'Failed to load tags.');
        }
      } catch (err) {
        console.error('Failed to fetch tags', err);
        setError('An unexpected error occurred.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTags();
  }, [router]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), color_hex: colorHex })
      });
      const payload = await res.json();
      if (res.ok) {
        setTags([...tags, payload.data]);
        closeAddModal();
      } else {
        setFormError(payload.message || 'Failed to add tag');
      }
    } catch (err) {
      console.error('Failed to add tag', err);
      setFormError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/tags/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setTags(tags.filter(t => t.id !== id));
      } else {
        setError('Failed to delete tag.');
      }
    } catch (err) {
      console.error('Failed to delete tag', err);
      setError('Network error. Please try again.');
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={<TagIcon className="w-6 h-6" />}
        title="Tags"
        subtitle="The managed set of tags agents can apply to a conversation from the CRM sidebar."
        actions={
          <Button onClick={() => setShowAdd(true)} className="flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            Add Tag
          </Button>
        }
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading tags..." />
      ) : tags.length === 0 ? (
        <div className="text-center p-12 bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-subtle)] border-dashed">
          <TagIcon className="mx-auto h-12 w-12 text-[var(--color-text-muted)] mb-4" />
          <h3 className="text-lg font-medium text-[var(--color-text-primary)]">No tags yet</h3>
          <p className="text-[var(--color-text-secondary)] mt-1">Add one so agents can label conversations consistently.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tags.map(tag => (
            <div
              key={tag.id}
              className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-sm"
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color_hex }} />
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{tag.name}</span>
              <button
                onClick={() => setPendingDelete(tag)}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-red-50 rounded-full transition-colors"
                title="Delete tag"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeAddModal}
        >
          <div
            className="bg-[var(--color-bg-surface)] w-full max-w-sm rounded-xl shadow-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-6">Add Tag</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <Input
                id="tag_name"
                label="Tag Name"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VIP"
              />
              <div className="flex flex-col w-full">
                <label htmlFor="tag_color" className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">Color</label>
                <div className="flex items-center gap-3">
                  <input
                    id="tag_color"
                    type="color"
                    value={colorHex}
                    onChange={(e) => setColorHex(e.target.value)}
                    className="w-10 h-10 rounded border border-[var(--color-border-subtle)] cursor-pointer"
                  />
                  <span className="text-sm font-mono text-[var(--color-text-secondary)]">{colorHex}</span>
                </div>
              </div>

              {formError && (
                <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <Button type="button" variant="ghost" onClick={closeAddModal}>Cancel</Button>
                <Button type="submit" isLoading={isSubmitting}>Save Tag</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete this tag?"
          description={
            <>
              <span className="font-medium text-[var(--color-text-primary)]">{pendingDelete.name}</span> will no longer be available to apply to new conversations. Conversations already tagged with it keep the tag as free text.
            </>
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
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
          <TagIcon size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Access Restricted</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Only administrators can manage tags.</p>
      </div>
    </div>
  );
}

export default function TagsPage() {
  return (
    <AppShell>
      {(user: CurrentUser) => (user.role === 'ADMIN' ? <TagsContent /> : <NotAuthorized />)}
    </AppShell>
  );
}
