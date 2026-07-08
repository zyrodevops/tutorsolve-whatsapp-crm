'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { API_URL } from '@/lib/config';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important to receive the HttpOnly cookie
        body: JSON.stringify({ email, password })
      });

      const responsePayload = await response.json();

      if (!response.ok) {
        throw new Error(responsePayload.message || 'Login failed');
      }

      // Success - Redirect based on role
      const role = responsePayload.data.user.role;
      if (role === 'ADMIN') {
        router.push('/admin/team');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-base)] px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-[var(--color-bg-surface)] p-8 rounded-xl shadow-lg border border-[var(--color-border-subtle)]">
        
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-[var(--color-brand-primary)] flex items-center justify-center mb-4">
            <MessageSquare className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] text-center tracking-tight">
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)] text-center">
            Welcome back to the WhatsApp CRM
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Email address"
              placeholder="admin@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            
            <Input
              id="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-[var(--color-brand-primary)] focus:ring-[var(--color-brand-hover)] border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-[var(--color-text-secondary)]">
                Remember me
              </label>
            </div>
          </div>

          <Button type="submit" className="w-full" isLoading={isLoading}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
