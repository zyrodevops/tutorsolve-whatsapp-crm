'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Trash2, RefreshCw } from 'lucide-react';
import { API_URL } from '@/lib/config';
import { PageShell } from '@/components/ui/PageShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useTemplatesStore } from '@/store/templatesStore';
import { useAuth } from '@/context/AuthContext';

function TemplatesContent() {
  const { templates, isLoading, error, fetch: fetchTemplates, syncTemplates, removeTemplate } = useTemplatesStore();
  const { user } = useAuth();
  const canSync = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canDelete = user?.role === 'ADMIN';
  const [mutationError, setMutationError] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<{ id: string; template_name: string } | null>(null);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSync = async () => {
    setIsSyncing(true);
    setMutationError('');
    await syncTemplates();
    setIsSyncing(false);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setMutationError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/meta-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        removeTemplate(id);
      } else {
        setMutationError('Failed to delete template.');
      }
    } catch {
      setMutationError('Network error. Please try again.');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    if (status === 'APPROVED') return 'bg-emerald-50 text-[var(--color-brand-active)] border-emerald-100';
    if (status === 'REJECTED') return 'bg-red-50 text-[var(--color-status-error)] border-red-100';
    return 'bg-amber-50 text-amber-600 border-amber-100'; // PENDING or other
  };

  return (
    <PageShell>
      <PageHeader
        icon={<FileText className="w-6 h-6" />}
        title="Message Templates"
        subtitle="Approved WhatsApp templates agents can send once the 24-hour reply window has closed."
        actions={
          canSync ? (
            <Button onClick={handleSync} isLoading={isSyncing} className="flex items-center">
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync from Meta
            </Button>
          ) : null
        }
      />

      {(error || mutationError) && (
        <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md mb-6">
          {error || mutationError}
        </div>
      )}

      {isLoading && templates.length === 0 ? (
        <LoadingState label="Loading templates..." />
      ) : (
        <div className="grid gap-4">
          {templates.length === 0 ? (
            <div className="text-center p-12 bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-subtle)] border-dashed">
              <FileText className="mx-auto h-12 w-12 text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">No templates yet</h3>
              <p className="text-[var(--color-text-secondary)] mt-1 mb-4">
                Click sync to fetch approved templates from Meta Business Manager.
              </p>
              {canSync && (
                <Button onClick={handleSync} isLoading={isSyncing} variant="secondary" className="mx-auto">
                   Sync Now
                </Button>
              )}
            </div>
          ) : (
            templates.map(template => (
              <div key={template.id} className="bg-[var(--color-bg-surface)] p-5 rounded-xl border border-[var(--color-border-subtle)] shadow-sm flex items-start justify-between gap-4 hover:border-[var(--color-brand-primary)] transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[var(--color-bg-base)] font-mono text-sm font-bold border border-[var(--color-border-subtle)]">
                      {template.template_name}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${getStatusBadgeColor(template.status)}`}>
                      {template.status || 'UNKNOWN'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--color-bg-base)] text-[var(--color-text-secondary)]">{template.language_code}</span>
                    {template.meta_template_id && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono text-[var(--color-text-muted)]">#{template.meta_template_id}</span>
                    )}
                  </div>
                  {template.body && (
                    <p className="text-[var(--color-text-primary)] whitespace-pre-wrap">{template.body}</p>
                  )}
                </div>
                {canDelete && (
                  <button
                    onClick={() => setPendingDelete(template)}
                    className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title="Hide template"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete this template?"
          description={<><span className="font-mono font-medium text-[var(--color-text-primary)]">{pendingDelete.template_name}</span> will no longer be available for agents to send. This can&apos;t be undone.</>}
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
        <div className="w-16 h-16 bg-red-50 text-[var(--color-status-error)] rounded-full flex items-center justify-center mx-auto mb-4"><FileText size={32} /></div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Access Restricted</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Only administrators can manage templates.</p>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { user } = useAuth();
  if (!user) return null;
  return ['ADMIN', 'MANAGER', 'AGENT'].includes(user.role) ? <TemplatesContent /> : <NotAuthorized />;
}
