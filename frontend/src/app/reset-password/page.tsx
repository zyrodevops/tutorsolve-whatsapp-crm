'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { API_URL } from '@/lib/config';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || 'Failed to reset password');
      }

      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)] px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-[var(--color-bg-surface)] p-6 sm:p-8 rounded-xl shadow-lg border border-[var(--color-border-subtle)] mx-4">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-[var(--color-brand-primary)] flex items-center justify-center mb-4">
            <MessageSquare className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] text-center tracking-tight">
            Choose a new password
          </h1>
        </div>

        {!token ? (
          <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md text-center">
            This reset link is missing or invalid.
            <div className="mt-3">
              <Link href="/forgot-password" className="text-[var(--color-brand-primary)] hover:underline font-medium">
                Request a new link
              </Link>
            </div>
          </div>
        ) : success ? (
          <div className="p-3 text-sm text-[var(--color-text-primary)] bg-emerald-50 border border-emerald-200 rounded-md text-center">
            Your password has been reset. Redirecting to sign in...
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <Input
                id="new_password"
                type="password"
                label="New password"
                placeholder="••••••••"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Input
                id="confirm_password"
                type="password"
                label="Confirm new password"
                placeholder="••••••••"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Reset password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
