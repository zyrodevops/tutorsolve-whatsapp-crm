'use client';

import React, { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { PageShell } from '@/components/ui/PageShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { useAuditLogsStore } from '@/store/auditLogsStore';
import { useAuth } from '@/context/AuthContext';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function AuditLogsContent() {
  const { entries, isLoading, error, fetch: fetchLogs } = useAuditLogsStore();

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <PageShell>
      <PageHeader
        icon={<ShieldAlert className="w-6 h-6" />}
        title="Audit Log"
        subtitle="A record of every sensitive action taken in the CRM, such as revealing a customer's real phone number."
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md shadow-sm">
          {error}
        </div>
      )}

      <div className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-subtle)] overflow-hidden">
        {isLoading && entries.length === 0 ? (
          <LoadingState label="Loading audit log..." />
        ) : entries.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8 text-[var(--color-brand-primary)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)]">No audit log entries yet</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)] max-w-sm">
              Sensitive actions, like revealing a customer&apos;s phone number, will show up here.
            </p>
          </div>
        ) : (
          <div className="w-full">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm text-[var(--color-text-secondary)]">
                <thead className="bg-[var(--color-bg-base)] text-[var(--color-text-primary)] uppercase text-xs border-b border-[var(--color-border-subtle)]">
                  <tr>
                    <th className="px-6 py-4 font-medium">When</th>
                    <th className="px-6 py-4 font-medium">Action</th>
                    <th className="px-6 py-4 font-medium">Performed By</th>
                    <th className="px-6 py-4 font-medium">Entity</th>
                    <th className="px-6 py-4 font-medium">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[var(--color-bg-base)] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">{formatTimestamp(entry.timestamp)}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-red-50 text-red-700">
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-[var(--color-text-primary)]">
                        {entry.user.full_name}
                        {entry.user.email && (
                          <span className="block text-xs font-normal text-[var(--color-text-muted)]">{entry.user.email}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {entry.entity_type}: <span className="font-mono text-xs">{entry.entity_id}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{entry.ip_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col divide-y divide-[var(--color-border-subtle)]">
              {entries.map((entry) => (
                <div key={entry.id} className="p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-700">{entry.action}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{formatTimestamp(entry.timestamp)}</span>
                  </div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{entry.user.full_name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {entry.entity_type}: <span className="font-mono">{entry.entity_id}</span>
                  </p>
                  <p className="text-xs font-mono text-[var(--color-text-muted)]">{entry.ip_address}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function NotAuthorized() {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-50 text-[var(--color-status-error)] rounded-full flex items-center justify-center mx-auto mb-4"><ShieldAlert size={32} /></div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Access Restricted</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Only administrators can view the audit log.</p>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'ADMIN' ? <AuditLogsContent /> : <NotAuthorized />;
}
