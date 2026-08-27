'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import AppShell from '@/components/layout/AppShell';
import { PageShell } from '@/components/ui/PageShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { getTimezoneOptions } from '@/lib/timezones';
import type { CurrentUser } from '@/types/auth';

const TIMEZONE_OPTIONS = getTimezoneOptions();

interface BusinessSettings {
  business_hours_start: string | null;
  business_hours_end: string | null;
  timezone: string;
  out_of_office_message: string | null;
  first_greeting_message: string | null;
  round_robin_enabled: boolean;
}

function BusinessSettingsContent() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/business-settings`, { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
          router.push('/login');
          return;
        }
        const payload = await res.json();
        if (res.ok) {
          setSettings(payload.data);
        } else {
          setError(payload.message || 'Failed to load settings.');
        }
      } catch (err) {
        console.error('Failed to fetch business settings', err);
        setError('An unexpected error occurred.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [router]);

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_URL}/api/admin/business-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings)
      });
      const payload = await res.json();
      if (res.ok) {
        setSettings(payload.data);
        setSuccess('Settings saved');
      } else {
        setError(payload.message || 'Failed to save settings.');
      }
    } catch (err) {
      console.error('Failed to save business settings', err);
      setError('An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !settings) {
    return (
      <PageShell>
        <PageHeader
          icon={<Settings className="w-6 h-6" />}
          title="Business Settings"
          subtitle="Business hours, automated greetings, and chat routing."
        />
        <LoadingState label="Loading settings..." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        icon={<Settings className="w-6 h-6" />}
        title="Business Settings"
        subtitle="Business hours, automated greetings, and chat routing."
      />

      <div className="p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-md flex items-start gap-3 text-sm">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          These settings control this CRM&apos;s own automated replies and routing only -- they are not synced with,
          and do not change, your real Meta Business Profile (the business hours/info customers see in WhatsApp
          itself, managed separately in Meta Business Manager).
        </p>
      </div>

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-[var(--color-status-success)] rounded-md">
          {success}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md">
          {error}
        </div>
      )}

      <div className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-subtle)] p-6 space-y-6">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-3">Business Hours</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              id="business_hours_start"
              type="time"
              label="Opens at"
              value={settings.business_hours_start ?? ''}
              onChange={(e) => setSettings({ ...settings, business_hours_start: e.target.value || null })}
            />
            <Input
              id="business_hours_end"
              type="time"
              label="Closes at"
              value={settings.business_hours_end ?? ''}
              onChange={(e) => setSettings({ ...settings, business_hours_end: e.target.value || null })}
            />
            <div className="flex flex-col w-full">
              <label htmlFor="timezone" className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">Timezone</label>
              <select
                id="timezone"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="px-3 py-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] focus:border-transparent"
              >
                {!TIMEZONE_OPTIONS.includes(settings.timezone) && (
                  <option value={settings.timezone}>{settings.timezone}</option>
                )}
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Leave opening/closing times blank to treat the business as always open.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-3">Automated Messages</h3>
          <div className="space-y-4">
            <Textarea
              id="first_greeting_message"
              label="First Greeting Message"
              rows={2}
              placeholder="Hi there! Welcome. An agent will be with you shortly."
              value={settings.first_greeting_message ?? ''}
              onChange={(e) => setSettings({ ...settings, first_greeting_message: e.target.value || null })}
            />
            <Textarea
              id="out_of_office_message"
              label="Out-of-Office Message"
              rows={2}
              placeholder="Sent instead of the greeting when a customer messages outside business hours."
              value={settings.out_of_office_message ?? ''}
              onChange={(e) => setSettings({ ...settings, out_of_office_message: e.target.value || null })}
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider mb-3">Chat Routing</h3>
          <label className="flex items-center gap-3 text-sm text-[var(--color-text-primary)]">
            <input
              type="checkbox"
              checked={settings.round_robin_enabled}
              onChange={(e) => setSettings({ ...settings, round_robin_enabled: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--color-border-subtle)] text-[var(--color-brand-primary)] focus:ring-[var(--color-border-focus)]"
            />
            Round robin (auto-assign new chats to the next online agent)
          </label>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            When off, new chats stay unassigned until an agent or manager claims them.
          </p>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={handleSave} isLoading={isSaving}>Save Settings</Button>
        </div>
      </div>
    </PageShell>
  );
}

function NotAuthorized() {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-50 text-[var(--color-status-error)] rounded-full flex items-center justify-center mx-auto mb-4">
          <Settings size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Access Restricted</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Only administrators can view business settings.</p>
      </div>
    </div>
  );
}

export default function BusinessSettingsPage() {
  return (
    <AppShell>
      {(user: CurrentUser) => (user.role === 'ADMIN' ? <BusinessSettingsContent /> : <NotAuthorized />)}
    </AppShell>
  );
}
