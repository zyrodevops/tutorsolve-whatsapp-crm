'use client';

import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import AppShell from '@/components/layout/AppShell';
import type { CurrentUser } from '@/types/auth';

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  system_status: string;
  created_at: string;
  is_current_user: boolean;
}

function TeamManagementContent() {
  const [users, setUsers] = useState<User[]>([]);
  const [isFetchingUsers, setIsFetchingUsers] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'AGENT'
  });

  const router = useRouter();

  const fetchUsers = async () => {
    setIsFetchingUsers(true);
    try {
      const res = await fetch(`${API_URL}/api/users`, { credentials: 'include' });

      if (res.status === 401 || res.status === 403) {
        // Token is invalid or expired, redirect to login
        router.push('/login');
        return;
      }

      const payload = await res.json();
      if (res.ok) {
        setUsers(payload.data);
        setError('');
      } else {
        setError(payload.message || 'Failed to load team members.');
      }
    } catch (err) {
      console.error('Failed to fetch users', err);
      setError('Failed to load team members.');
    } finally {
      setIsFetchingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send the HttpOnly cookie for auth
        body: JSON.stringify(formData)
      });

      const responsePayload = await response.json();

      if (!response.ok) {
        let errorMsg = responsePayload.message || 'Failed to create user';
        if (responsePayload.errors && typeof responsePayload.errors === 'object') {
          const detailedErrors = Object.entries(responsePayload.errors)
            .map(([field, messages]) => `${field.replace('_', ' ')}: ${(messages as string[]).join(', ')}`)
            .join(' | ');
          errorMsg = `${errorMsg} - ${detailedErrors}`;
        }
        throw new Error(errorMsg);
      }

      setSuccess(`User ${formData.full_name} created successfully! An email has been sent.`);
      setIsModalOpen(false);
      setFormData({ full_name: '', email: '', password: '', role: 'AGENT' });

      // Refresh the table
      fetchUsers();

    } catch (err: unknown) {
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('An unexpected error occurred while creating user');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  const handleDeleteUser = async () => {
    if (!pendingDeleteUser) return;
    const userId = pendingDeleteUser.id;
    setPendingDeleteUser(null);

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setSuccess('User deleted successfully');
        fetchUsers();
      } else {
        const payload = await response.json();
        setError(payload.message || 'Failed to delete user');
      }
    } catch (err) {
      console.error('Failed to delete user', err);
      setError('An unexpected error occurred while deleting user');
    }
  };

  const roleBadgeStyles: Record<string, string> = {
    ADMIN: 'bg-purple-50 text-purple-700',
    MANAGER: 'bg-blue-50 text-blue-700',
    AGENT: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
              Team Management
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Manage your CRM agents and their permissions.
            </p>
          </div>

          <Button className="flex items-center" onClick={() => {
            setFormError('');
            setIsModalOpen(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Employee
          </Button>
        </div>

        {success && (
          <div className="p-4 bg-green-50 border border-green-200 text-[var(--color-status-success)] rounded-md">
            {success}
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-[var(--color-status-error)] rounded-md">
            {error}
          </div>
        )}

        {/* Table Section */}
        <div className="bg-[var(--color-bg-surface)] rounded-xl border border-[var(--color-border-subtle)] overflow-hidden">
          <div className="p-6 border-b border-[var(--color-border-subtle)] bg-gray-50 flex items-center space-x-3">
            <Users className="w-5 h-5 text-[var(--color-text-secondary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Active Employees
            </h2>
          </div>

          {isFetchingUsers ? (
            <div className="p-16 flex justify-center">
              <p className="text-[var(--color-text-secondary)]">Loading team...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-[var(--color-brand-primary)]" />
              </div>
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">No team members found</h3>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)] max-w-sm">
                Use the Add Employee button to provision a new Agent or Manager account into the database.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[var(--color-text-secondary)]">
                <thead className="bg-gray-50 text-[var(--color-text-primary)] uppercase text-xs border-b border-[var(--color-border-subtle)]">
                  <tr>
                    <th className="px-6 py-4 font-medium">Name</th>
                    <th className="px-6 py-4 font-medium">Email</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-[var(--color-text-primary)]">
                        {user.full_name}
                      </td>
                      <td className="px-6 py-4">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${roleBadgeStyles[user.role] ?? 'bg-gray-50 text-gray-700'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                          user.system_status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {user.system_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {user.is_current_user ? (
                          <span className="text-xs font-medium text-[var(--color-text-muted)] mr-2">
                            (You)
                          </span>
                        ) : (
                          <button
                            onClick={() => setPendingDeleteUser(user)}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4 inline-block" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Employee Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--color-bg-surface)] w-full max-w-md rounded-xl shadow-lg p-6 relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-6">Create New User</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="full_name"
                  label="Full Name"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                />
                <Input
                  id="email"
                  type="email"
                  label="Email Address"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
                <Input
                  id="password"
                  type="password"
                  label="Temporary Password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                />

                <div className="flex flex-col w-full">
                  <label className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">Role</label>
                  <select
                    className="px-3 py-2 bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] rounded-md text-sm focus:ring-[var(--color-border-focus)] focus:border-transparent outline-none"
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                  >
                    <option value="AGENT">Agent</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                {formError && (
                  <div className="p-3 text-sm text-[var(--color-status-error)] bg-red-50 border border-red-200 rounded-md">
                    {formError}
                  </div>
                )}

                <div className="pt-4 flex justify-end space-x-3">
                  <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                  <Button type="submit" isLoading={isLoading}>Create User</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {pendingDeleteUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--color-bg-surface)] w-full max-w-sm rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">Remove team member?</h2>
              <p className="text-sm text-[var(--color-text-secondary)] mb-6">
                <span className="font-medium text-[var(--color-text-primary)]">{pendingDeleteUser.full_name}</span> will lose access immediately. This can&apos;t be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <Button type="button" variant="ghost" onClick={() => setPendingDeleteUser(null)}>Cancel</Button>
                <Button type="button" variant="danger" onClick={handleDeleteUser}>
                  Remove
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[var(--color-text-secondary)]">You don&apos;t have access to this page.</p>
    </div>
  );
}

export default function TeamManagementPage() {
  return (
    <AppShell>
      {(user: CurrentUser) => (user.role === 'ADMIN' ? <TeamManagementContent /> : <NotAuthorized />)}
    </AppShell>
  );
}
