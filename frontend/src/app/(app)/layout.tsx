import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import AppShell from '@/components/layout/AppShell';
import { InboxProvider } from '@/context/InboxContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InboxProvider>
        <AppShell>
          {children}
        </AppShell>
      </InboxProvider>
    </AuthProvider>
  );
}
