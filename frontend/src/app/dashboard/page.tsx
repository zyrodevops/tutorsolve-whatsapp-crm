'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import { Button } from '@/components/ui/Button';

export default function DashboardPage() {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        if (!res.ok) {
          router.push('/login');
          return;
        }
        setIsCheckingSession(false);
      } catch (err) {
        console.error('Failed to verify session', err);
        router.push('/login');
      }
    };
    verifySession();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { 
        method: 'POST',
        credentials: 'include' 
      });
      router.push('/login');
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)]">
        <p className="text-[var(--color-text-secondary)]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
              Agent Dashboard
            </h1>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              Welcome to the WhatsApp CRM. Chat features will be implemented here soon.
            </p>
          </div>
          <Button variant="ghost" className="text-[var(--color-status-error)] hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
