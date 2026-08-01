'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, Users, MessageSquare, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import AppShell from '@/components/layout/AppShell';
import { PageShell } from '@/components/ui/PageShell';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import type { CurrentUser } from '@/types/auth';

interface AnalyticsData {
  total_agents: number;
  online_agents: number;
  total_conversations: number;
  open_conversations: number;
  resolved_conversations: number;
}

function AnalyticsContent() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${API_URL}/api/admin/analytics`, { credentials: 'include' });
        
        if (res.status === 401 || res.status === 403) {
          router.push('/login');
          return;
        }

        const payload = await res.json();
        if (res.ok) {
          setData(payload.data);
        } else {
          setError(payload.message || 'Failed to load analytics.');
        }
      } catch (err) {
        console.error('Failed to fetch analytics', err);
        setError('An unexpected error occurred.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [router]);

  return (
    <PageShell>
      <PageHeader
        icon={<BarChart3 className="w-6 h-6" />}
        title="Platform Analytics"
        subtitle="Real-time insights into your team's performance and active conversations. Monitor key metrics and evaluate customer support efficiency at a glance."
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md shadow-sm flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Aggregating metrics..." />
      ) : data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">

            <StatCard 
              title="Total Agents"
              value={data.total_agents}
              subtitle={`${data.online_agents} currently online`}
              icon={<Users className="w-6 h-6 text-[var(--color-brand-primary)]" />}
            />
            
            <StatCard 
              title="Total Chats"
              value={data.total_conversations}
              subtitle="All time conversations"
              icon={<MessageSquare className="w-6 h-6 text-[var(--color-brand-primary)]" />}
            />
            
            <StatCard 
              title="Active Chats"
              value={data.open_conversations}
              subtitle="Currently in progress"
              icon={<BarChart3 className="w-6 h-6 text-[var(--color-brand-primary)]" />}
            />
            
            <StatCard 
              title="Resolved"
              value={data.resolved_conversations}
              subtitle="Successfully closed"
              icon={<CheckCircle2 className="w-6 h-6 text-[var(--color-brand-primary)]" />}
            />
            
          </div>
        ) : null}
    </PageShell>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
}

function StatCard({ title, value, subtitle, icon }: StatCardProps) {
  return (
    <div className="group p-4 sm:p-6 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-start mb-3 sm:mb-4">
          <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-50">
            {icon}
          </div>
        </div>

        <div className="mt-auto">
          <h3 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">{value}</h3>
          <p className="text-sm font-semibold text-[var(--color-text-secondary)] mt-1 uppercase tracking-wider">{title}</p>
          <div className="h-px w-full bg-[var(--color-border-subtle)] my-2 sm:my-3" />
          <p className="text-xs font-medium text-[var(--color-text-muted)]">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="h-full flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-50 text-[var(--color-status-error)] rounded-full flex items-center justify-center mx-auto mb-4">
          <BarChart3 size={32} />
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Access Restricted</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Only administrators can view analytics.</p>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <AppShell>
      {(user: CurrentUser) => (user.role === 'ADMIN' ? <AnalyticsContent /> : <NotAuthorized />)}
    </AppShell>
  );
}
