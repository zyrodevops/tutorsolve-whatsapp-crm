'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Inbox, Users, LogOut, MessageSquare } from 'lucide-react';
import { API_URL } from '@/lib/config';
import type { CurrentUser } from '@/types/auth';
import { useInbox } from '@/context/InboxContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  roles: CurrentUser['role'][];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inbox', icon: Inbox, roles: ['ADMIN', 'MANAGER', 'AGENT'] },
  { href: '/admin/team', label: 'Team', icon: Users, roles: ['ADMIN'] },
];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

interface AppShellProps {
  children: (user: CurrentUser) => React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // We conditionally use the Inbox context since AppShell might be used on pages without it, 
  // but in our current app structure, it's wrapped by InboxProvider on the Dashboard.
  // Actually, wait, if AppShell is used on /admin/team, the InboxProvider won't be there!
  // To avoid errors, we should make InboxContext safe to use even if undefined, or wrap AppShell globally.
  // Let's implement a safe usage:
  let totalUnreadCount = 0;
  try {
    const inboxCtx = useInbox();
    totalUnreadCount = inboxCtx.totalUnreadCount;
  } catch (e) {
    // Not inside InboxProvider
  }

  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const body = await res.json();
        setUser(body.data);
      } catch (err) {
        console.error('Failed to verify session', err);
        router.push('/login');
        return;
      } finally {
        setIsChecking(false);
      }
    };
    verifySession();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      router.push('/login');
    }
  };

  if (isChecking || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-[var(--color-brand-primary)] font-semibold tracking-wide">Loading CRM...</p>
        </div>
      </div>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-base)]">
      <nav className="w-20 bg-[var(--color-bg-surface)] border-r border-[var(--color-border-subtle)] flex flex-col items-center py-6 gap-2 shadow-sm z-20 flex-shrink-0">
        <Link
          href="/dashboard"
          className="w-10 h-10 mb-4 bg-gradient-to-tr from-[var(--color-brand-primary)] to-[var(--color-brand-hover)] rounded-xl shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95"
          title="WhatsApp CRM"
        >
          <MessageSquare size={20} />
        </Link>

        <div className="flex flex-col gap-2 flex-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;
            const isInbox = item.label === 'Inbox';
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-emerald-50 text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-text-muted)] hover:bg-gray-100 hover:text-[var(--color-text-primary)]'
                }`}
              >
                <Icon size={20} />
                {isInbox && totalUnreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse-subtle">
                    {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-2 pt-4 border-t border-[var(--color-border-subtle)] w-full px-2">
          <div
            className="w-9 h-9 rounded-full bg-[var(--color-brand-primary)] text-white text-xs font-bold flex items-center justify-center"
            title={`${user.full_name} (${user.role})`}
          >
            {initials(user.full_name)}
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:bg-red-50 hover:text-[var(--color-status-error)] transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0 overflow-hidden">
        {children(user)}
      </main>
    </div>
  );
}
