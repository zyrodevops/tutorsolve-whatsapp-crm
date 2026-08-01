'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Eye, EyeOff } from 'lucide-react';
import { API_URL } from '@/lib/config';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
        body: JSON.stringify({ email, password, remember_me: rememberMe })
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
      <div className="max-w-md w-full space-y-8 bg-[var(--color-bg-surface)] p-6 sm:p-8 rounded-xl shadow-lg border border-[var(--color-border-subtle)] mx-4">
        
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
            
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="password" className="text-sm font-medium text-[var(--color-text-primary)]">Password</label>
              </div>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                rightElement={
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="focus:outline-none hover:text-gray-800 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
              <div className="flex justify-end mt-2">
                <Link href="/forgot-password" className="text-sm text-[var(--color-brand-primary)] hover:underline font-medium">Forgot password?</Link>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input 
              type="checkbox" 
              id="remember" 
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <label htmlFor="remember" className="text-sm text-gray-500 font-medium">Remember me</label>
          </div>

          <Button type="submit" className="w-full h-11" isLoading={isLoading}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
