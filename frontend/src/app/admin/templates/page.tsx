'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Plus } from 'lucide-react';
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

interface MetaTemplate {
  id: string;
  template_name: string;
  meta_template_id: string;
  language_code: string;
  status: string;
  body: string;
}

function TemplatesContent() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [metaTemplateId, setMetaTemplateId] = useState('');
  const [languageCode, setLanguageCode] = useState('en_US');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<MetaTemplate | null>(null);

  const router = useRouter();

  const closeAddModal = () => {
    setShowAdd(false);
    setTemplateName('');
    setMetaTemplateId('');
    setLanguageCode('en_US');
    setBody('');
    setFormError('');
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/meta-templates`, { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          router.push('/login');
          return;
        }
        const payload = await res.json();
        if (res.ok) {
          setTemplates(payload.data);
          setError('');
        } else {
          setError(payload.message || 'Failed to load templates.');
        }
      } catch (err) {
        console.error('Failed to fetch templates', err);
        setError('An unexpected error occurred.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplates();
  }, [router]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim() || !languageCode.trim()) return;

    setIsSubmitting(true);
    setFormError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/meta-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template_name: templateName.trim(),
          meta_template_id: metaTemplateId.trim(),
          language_code: languageCode.trim(),
          body: body.trim()
        })
      });
      const payload = await res.json();
      if (res.ok) {
        setTemplates([...templates, payload.data]);
        closeAddModal();
      } else {
        setFormError(payload.message || 'Failed to add template');
      }
    } catch (err) {
      console.error('Failed to add template', err);
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
      const res = await fetch(`${API_URL}/api/admin/meta-templates/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setTemplates(templates.filter(t => t.id !== id));
      } else {
        setError('Failed to delete template.');
      }
    } catch (err) {
      console.error('Failed to delete template', err);
      setError('Network error. Please try again.');
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={<FileText className="w-6 h-6" />}
        title="Message Templates"
        subtitle="Approved WhatsApp templates agents can send once the 24-hour reply window has closed."
        actions={
          <Button onClick={() => setShowAdd(true)} className="flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            Add Template
          </Button>
        }
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading templates..." />
      ) : (
        <div className="grid gap-4">
          {templates.length === 0 ? (
            <div className="text-center p-12 bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-subtle)] border-dashed">
              <FileText className="mx-auto h-12 w-12 text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">No templates yet</h3>
              <p className="text-[var(--color-text-secondary)] mt-1">
                Add a template that&apos;s already been approved in Meta Business Manager so agents can send it here.
              </p>
            </div>
          ) : (
            templates.map(template => (
              <div key={template.id} className="bg-[var(--color-bg-surface)] p-5 rounded-xl border border-[var(--color-border-subtle)] shadow-sm flex items-start justify-between gap-4 hover:border-[var(--color-brand-primary)] transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-[var(--color-brand-active)] font-mono text-sm font-bold border border-emerald-100">
                      {template.template_name}
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
                <button
                  onClick={() => setPendingDelete(template)}
                  className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-status-error)] hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  title="Delete template"
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
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-6">Add Template</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <Input
                id="template_name"
                label="Template Name"
                required
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="font-mono"
                placeholder="order_confirmation"
              />
              <Input
                id="meta_template_id"
                label="Meta Template ID"
                value={metaTemplateId}
                onChange={e => setMetaTemplateId(e.target.value)}
                placeholder="Optional -- from Meta Business Manager"
              />
              <Input
                id="language_code"
                label="Language Code"
                required
                value={languageCode}
                onChange={e => setLanguageCode(e.target.value)}
                placeholder="en_US"
              />
              <Textarea
                id="body"
                label="Body"
                value={body}
                onChange={e => setBody(e.target.value)}
                className="h-20"
                placeholder="The approved template content, for your own reference."
              />

              {formError && (
                <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <Button type="button" variant="ghost" onClick={closeAddModal}>Cancel</Button>
                <Button type="submit" isLoading={isSubmitting}>Save Template</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete this template?"
          description={
            <>
              <span className="font-mono font-medium text-[var(--color-text-primary)]">{pendingDelete.template_name}</span> will no longer be available for agents to send. This can&apos;t be undone.
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
          <FileText size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Access Restricted</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Only administrators can manage templates.</p>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <AppShell>
      {(user: CurrentUser) => (user.role === 'ADMIN' ? <TemplatesContent /> : <NotAuthorized />)}
    </AppShell>
  );
}
