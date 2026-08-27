'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { API_URL } from '@/lib/config';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Something went wrong. Please try again.');
      }

      setSubmitted(true);
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
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)] text-center">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6">
            <div className="p-3 text-sm text-[var(--color-text-primary)] bg-emerald-50 border border-emerald-200 rounded-md text-center">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </div>
            <Link
              href="/login"
              className="flex items-center justify-center gap-1 text-sm text-[var(--color-brand-primary)] hover:underline font-medium"
            >
              <ArrowLeft size={16} /> Back to sign in
            </Link>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <Input
              id="email"
              type="email"
              label="Email address"
              placeholder="admin@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && (
              <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Send reset link
            </Button>

            <Link
              href="/login"
              className="flex items-center justify-center gap-1 text-sm text-[var(--color-brand-primary)] hover:underline font-medium"
            >
              <ArrowLeft size={16} /> Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
