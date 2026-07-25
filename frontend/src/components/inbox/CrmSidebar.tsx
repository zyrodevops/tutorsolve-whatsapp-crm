import React, { useState } from 'react';
import { Info, User, Clock, Copy, Check } from 'lucide-react';
import type { Conversation } from '@/types/inbox';

interface CrmSidebarProps {
  conversation: Conversation | null | undefined;
}

export default function CrmSidebar({ conversation }: CrmSidebarProps) {
  const [copied, setCopied] = useState(false);

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-white border-l border-[var(--color-border-subtle)]">
        <p className="text-gray-400 flex items-center gap-2">
          <Info size={16} /> CRM Context
        </p>
      </div>
    );
  }

  const handleCopyAlias = () => {
    if (conversation.masked_id) {
      navigator.clipboard.writeText(conversation.masked_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-full bg-white border-l border-[var(--color-border-subtle)] p-6 overflow-y-auto shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)]">
      <h3 className="text-lg font-bold text-gray-800 mb-8 flex items-center gap-2 border-b pb-4">
        <Info size={20} className="text-[var(--color-brand-primary)]" />
        CRM Details
      </h3>

      <div className="space-y-8">
        {/* Profile Card */}
        <div className="flex flex-col items-center gap-4 bg-gradient-to-b from-emerald-50/50 to-transparent p-6 rounded-2xl border border-emerald-100/50">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-[var(--color-brand-active)] shadow-inner">
            <User size={32} />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{conversation.whatsapp_name || "Unknown Customer"}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <p className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded-md shadow-sm">
                {conversation.masked_id}
              </p>
              <button
                onClick={handleCopyAlias}
                className="text-gray-400 hover:text-[var(--color-brand-primary)] transition-colors p-1"
                title="Copy Alias"
              >
                {copied ? <Check size={14} className="text-[var(--color-status-success)]" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled
              title="Coming soon"
              className="py-2 px-3 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed"
            >
              Add Note
            </button>
            <button
              disabled
              title="Coming soon"
              className="py-2 px-3 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed"
            >
              Mark Resolved
            </button>
          </div>
        </div>

        {/* Status */}
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Conversation Status</h4>
          <div className="flex items-center gap-2">
            <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold tracking-wide ${
              conversation.status === 'OPEN' ? 'bg-green-100 text-green-700 border border-green-200' :
              conversation.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
              'bg-gray-100 text-gray-700 border border-gray-200'
            }`}>
              {conversation.status}
            </span>
          </div>
        </div>
        
        {/* Activity */}
        <div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Last Activity</h4>
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100">
            <Clock size={16} className="text-gray-400" />
            {conversation.last_message_at ? formatRelativeTime(conversation.last_message_at) : 'Never'}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  
  if (diffInSeconds < 3600) {
    return formatter.format(-Math.floor(diffInSeconds / 60), 'minute');
  }
  if (diffInSeconds < 86400) {
    return formatter.format(-Math.floor(diffInSeconds / 3600), 'hour');
  }
  if (diffInSeconds < 604800) {
    return formatter.format(-Math.floor(diffInSeconds / 86400), 'day');
  }
  
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
