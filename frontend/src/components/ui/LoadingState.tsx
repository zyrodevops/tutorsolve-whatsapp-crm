import React from 'react';

interface LoadingStateProps {
  label: string;
}

/**
 * The one "this page's data hasn't arrived yet" treatment for admin pages.
 * Previously Team Management and Quick Replies just rendered plain gray
 * text while Analytics had a spinner + pulsing label -- three different
 * loading experiences for the same moment.
 */
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div className="p-16 sm:p-24 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-4">
      <div className="w-10 h-10 border-4 border-[var(--color-brand-primary)] border-t-transparent rounded-full animate-spin" />
      <p className="font-medium animate-pulse text-[var(--color-brand-primary)]">{label}</p>
    </div>
  );
}
