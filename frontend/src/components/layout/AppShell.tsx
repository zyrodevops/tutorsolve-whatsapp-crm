'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, Users, LogOut, MessageSquare, Circle, BarChart3, Zap, ShieldAlert, Settings, FileText, Tag as TagIcon, Menu } from 'lucide-react';
import type { CurrentUser } from '@/types/auth';
import { useInbox } from '@/context/InboxContext';
import { useAuth } from '@/context/AuthContext';

interface NavItem {
  href: string;
  label: string;
  // Shown in the mobile bottom-nav slot, which is too narrow for longer
  // labels like "Quick Replies" (it wraps onto two lines there, breaking
  // vertical alignment with the other single-line items). Falls back to
  // `label` when omitted. `title` always uses the full `label`.
  mobileLabel?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  roles: CurrentUser['role'][];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inbox', icon: Inbox, roles: ['ADMIN', 'MANAGER', 'AGENT'] },
  { href: '/admin/team', label: 'Team', icon: Users, roles: ['ADMIN'] },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, roles: ['ADMIN'] },
  { href: '/admin/quick-replies', label: 'Quick Replies', mobileLabel: 'Replies', icon: Zap, roles: ['ADMIN', 'MANAGER', 'AGENT'] },
  { href: '/admin/templates', label: 'Templates', icon: FileText, roles: ['ADMIN', 'MANAGER', 'AGENT'] },
  { href: '/admin/tags', label: 'Tags', icon: TagIcon, roles: ['ADMIN', 'MANAGER', 'AGENT'] },
  { href: '/admin/audit-logs', label: 'Audit Log', mobileLabel: 'Audit', icon: ShieldAlert, roles: ['ADMIN'] },
  { href: '/admin/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user, agentStatus, isChecking, handleLogout, handleUpdateStatus } = useAuth();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const mobileProfileRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showStatusMenu && !showMobileMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showStatusMenu) {
        const inStatusMenu = statusMenuRef.current && statusMenuRef.current.contains(target);
        const inMobileProfile = mobileProfileRef.current && mobileProfileRef.current.contains(target);
        if (!inStatusMenu && !inMobileProfile) {
          setShowStatusMenu(false);
        }
      }
      if (showMobileMenu && navRef.current && !navRef.current.contains(target)) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusMenu, showMobileMenu]);

  const [businessOpen, setBusinessOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) {
      fetch('/api/admin/business-settings/status')
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            setBusinessOpen(data.data.is_open);
          }
        })
        .catch(err => console.error("Failed to fetch business status:", err));
    }
  }, [user]);

  // AppShell renders on pages outside InboxProvider (e.g. /admin/team), so this
  // read must tolerate the context not being present.
  let totalUnreadCount = 0;
  try {
    const inboxCtx = useInbox();
    totalUnreadCount = inboxCtx.totalUnreadCount;
  } catch {
    // Not inside InboxProvider
  }



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
  
  // For mobile, we only want Inbox, Team, and Settings directly on the bar. 
  // Everything else goes into the "More" menu.
  const primaryMobileLabels = ['Inbox', 'Team', 'Settings'];
  const primaryMobileNavItems = visibleNavItems.filter(item => primaryMobileLabels.includes(item.label));
  const secondaryMobileNavItems = visibleNavItems.filter(item => !primaryMobileLabels.includes(item.label));

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-[var(--color-bg-base)]">
      
      {/* Main Content Area */}
      {/* On mobile, pb-16 prevents content hiding behind the bottom nav bar */}
      <main className="flex-1 min-w-0 overflow-hidden relative z-0 pb-[72px] md:pb-0 flex flex-col">
        {/* Top Bar for Business Status & Agent Presence */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-50">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-800 text-lg hidden sm:block">TutorSolve CRM</h2>
            {businessOpen !== null && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                businessOpen 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-gray-100 text-gray-600 border-gray-200'
              }`}>
                <Circle size={8} className={businessOpen ? 'fill-emerald-500 text-emerald-500' : 'fill-gray-400 text-gray-400'} />
                {businessOpen ? 'Business Open' : 'Business Closed'}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-gray-700 hidden sm:block">
              {user.full_name}
            </div>
            <div className="relative" ref={statusMenuRef}>
              <button 
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Circle size={10} className={`${agentStatus === 'ONLINE' ? 'fill-emerald-500 text-emerald-500' : agentStatus === 'BUSY' ? 'fill-orange-500 text-orange-500' : 'fill-gray-400 text-gray-400'}`} />
                <span className="text-xs font-bold text-gray-700">
                  {agentStatus === 'ONLINE' ? 'Online' : agentStatus === 'BUSY' ? 'Busy' : 'Offline'}
                </span>
              </button>
              
              {showStatusMenu && (
                <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 shadow-xl rounded-xl p-2 flex flex-col gap-1 w-36 z-50">
                  <button onClick={() => { handleUpdateStatus('ONLINE'); setShowStatusMenu(false); }} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 rounded-lg text-left transition-colors">
                    <Circle size={10} className="fill-emerald-500 text-emerald-500" /> Online
                  </button>
                  <button onClick={() => { handleUpdateStatus('BUSY'); setShowStatusMenu(false); }} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 rounded-lg text-left transition-colors">
                    <Circle size={10} className="fill-orange-500 text-orange-500" /> Busy
                  </button>
                  <button onClick={() => { handleUpdateStatus('OFFLINE'); setShowStatusMenu(false); }} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg text-left transition-colors">
                    <Circle size={10} className="fill-gray-400 text-gray-400" /> Offline
                  </button>

                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative overflow-hidden">
          {children}
        </div>
      </main>

      {/* Navigation (Sidebar on desktop, Bottom Nav on mobile) */}
      <nav ref={navRef} className="fixed bottom-0 w-full h-[72px] md:static md:w-20 md:h-auto bg-[var(--color-bg-surface)] border-t md:border-t-0 md:border-r border-[var(--color-border-subtle)] flex md:flex-col items-center justify-around md:justify-start px-2 py-2 md:px-0 md:py-6 md:gap-2 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.05)] md:shadow-sm z-50 flex-shrink-0 safe-area-bottom">
        
        {/* Desktop Logo */}
        <Link
          href="/dashboard"
          className="hidden md:flex w-10 h-10 mb-4 bg-gradient-to-tr from-[var(--color-brand-primary)] to-[var(--color-brand-hover)] rounded-xl shadow-lg items-center justify-center text-white transition-transform hover:scale-105 active:scale-95"
          title="WhatsApp CRM"
        >
          <MessageSquare size={20} />
        </Link>

        {/* Desktop Nav Items */}
        <div className="hidden md:flex flex-col items-center justify-start w-full flex-1 gap-2">
          {visibleNavItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;
            const isInbox = item.label === 'Inbox';
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors ${
                  isActive
                    ? 'text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-text-muted)] hover:bg-gray-100 hover:text-[var(--color-text-primary)]'
                }`}
              >
                <div className={`p-2 rounded-xl flex items-center justify-center ${isActive ? 'bg-emerald-50' : 'bg-transparent'}`}>
                  <Icon size={20} className="w-5 h-5" />
                </div>
                {isInbox && totalUnreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse-subtle">
                    {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                  </div>
                )}
              </Link>
            );
          })}
          
          <div className="mt-auto mb-4">
            <button
              onClick={handleLogout}
              title="Logout"
              className="relative flex items-center justify-center w-11 h-11 rounded-xl transition-colors text-[var(--color-text-muted)] hover:bg-red-50 hover:text-red-600"
            >
              <div className="p-2 rounded-xl flex items-center justify-center bg-transparent">
                <LogOut size={20} className="w-5 h-5" />
              </div>
            </button>
          </div>
        </div>

        {/* Mobile Nav Items */}
        <div className="flex md:hidden items-center justify-around w-full gap-1">
          {primaryMobileNavItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;
            const isInbox = item.label === 'Inbox';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-colors ${
                  isActive
                    ? 'text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
                onClick={() => setShowMobileMenu(false)}
              >
                <div className={`p-1.5 rounded-xl flex items-center justify-center ${isActive ? 'bg-emerald-50' : 'bg-transparent'}`}>
                  <Icon size={20} className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-semibold mt-0.5">{item.mobileLabel ?? item.label}</span>
                
                {isInbox && totalUnreadCount > 0 && (
                  <div className="absolute top-1 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse-subtle">
                    {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                  </div>
                )}
              </Link>
            );
          })}

          {/* Mobile "More Menu" Button */}
          {secondaryMobileNavItems.length > 0 && (
            <button
              onClick={() => {
                setShowMobileMenu(!showMobileMenu);
                setShowStatusMenu(false);
              }}
              className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-colors ${
                showMobileMenu
                  ? 'text-[var(--color-brand-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <div className={`p-1.5 rounded-xl flex items-center justify-center ${showMobileMenu ? 'bg-emerald-50' : 'bg-transparent'}`}>
                <Menu size={20} className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-semibold mt-0.5">Menu</span>
            </button>
          )}

          {/* Mobile Profile & Status */}
          <button
            ref={mobileProfileRef}
            onClick={() => {
              setShowStatusMenu(!showStatusMenu);
              setShowMobileMenu(false);
            }}
            className="flex md:hidden flex-col items-center justify-center w-14 h-14 rounded-xl text-[var(--color-text-muted)]"
          >
            <div className="relative p-1.5 rounded-xl flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-[var(--color-brand-primary)] text-white text-[10px] font-bold flex items-center justify-center">
                {initials(user.full_name)}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
                <Circle size={8} className={`${agentStatus === 'ONLINE' ? 'fill-emerald-500 text-emerald-500' : agentStatus === 'BUSY' ? 'fill-orange-500 text-orange-500' : 'fill-gray-400 text-gray-400'}`} />
              </div>
            </div>
            <span className="text-[10px] font-semibold mt-0.5">Profile</span>
          </button>
        </div>

        {/* Desktop Profile & Status removed because it's now in the top bar */}

        {/* Mobile pop-up menu for status removed, merged into top bar */}

        {/* Mobile pop-up menu for extra navigation items */}
        {showMobileMenu && (
          <div className="md:hidden absolute bottom-20 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-2xl rounded-2xl p-2 flex flex-col w-56 z-50">
            <div className="px-3 py-2 border-b border-gray-100 mb-1">
              <p className="text-xs font-bold text-gray-800">Menu</p>
            </div>
            {secondaryMobileNavItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMobileMenu(false)}
                  className={`flex items-center gap-3 px-3 py-3 text-sm rounded-lg text-left transition-colors font-medium ${
                    isActive 
                      ? 'bg-emerald-50 text-[var(--color-brand-primary)]' 
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-[var(--color-brand-primary)]' : 'text-gray-500'} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="h-px bg-gray-100 my-1"></div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-3 text-sm rounded-lg text-left transition-colors font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={18} className="text-red-500" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
