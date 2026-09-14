'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import type { CurrentUser } from '@/types/auth';

interface AuthContextType {
  user: CurrentUser | null;
  agentStatus: 'ONLINE' | 'BUSY' | 'OFFLINE';
  isChecking: boolean;
  setAgentStatus: (status: 'ONLINE' | 'BUSY' | 'OFFLINE') => void;
  handleLogout: () => Promise<void>;
  handleUpdateStatus: (newStatus: 'ONLINE' | 'BUSY' | 'OFFLINE') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [agentStatus, setAgentStatus] = useState<'ONLINE' | 'BUSY' | 'OFFLINE'>('OFFLINE');

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
        if (body.data.agent_status) {
          setAgentStatus(body.data.agent_status);
        }
      } catch (err) {
        console.error('Failed to verify session', err);
        router.push('/login');
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

  useEffect(() => {
    if (!user) return;
    
    // Heartbeat every 5 minutes (300000 ms) to keep the agent online
    const heartbeatInterval = setInterval(async () => {
      try {
        await fetch(`${API_URL}/api/auth/heartbeat`, { method: 'PUT', credentials: 'include' });
      } catch (err) {
        console.error('Heartbeat failed', err);
      }
    }, 300000);
    
    return () => clearInterval(heartbeatInterval);
  }, [user]);

  const handleUpdateStatus = async (newStatus: 'ONLINE' | 'BUSY' | 'OFFLINE') => {
    if (!user) return;

    // Optimistic update
    const previousStatus = agentStatus;
    setAgentStatus(newStatus);

    try {
      const res = await fetch(`${API_URL}/api/users/${user.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_status: newStatus, agent_status_reason: 'MANUAL' })
      });
      if (!res.ok) {
        setAgentStatus(previousStatus);
        console.error('Failed to update status on server');
      }
    } catch (err) {
      setAgentStatus(previousStatus);
      console.error('Failed to update status', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, agentStatus, isChecking, setAgentStatus, handleLogout, handleUpdateStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
