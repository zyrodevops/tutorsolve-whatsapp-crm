'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        if (res.ok) {
          const body = await res.json();
          const role = body.data.role;
          if (role === 'ADMIN') {
            router.push('/admin/analytics');
          } else {
            router.push('/dashboard');
          }
        } else {
          router.push('/login');
        }
      } catch (err) {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[var(--color-brand-primary)] font-semibold tracking-wide">Routing...</p>
      </div>
    </div>
  );
}
