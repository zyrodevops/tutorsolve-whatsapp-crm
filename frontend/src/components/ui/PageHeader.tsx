import React from 'react';

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * The single "page title" treatment for admin pages (icon badge + title +
 * subtitle, with an optional action slot for a primary button like "Add
 * Employee"). Previously each admin page implemented its own version of
 * this -- some card-wrapped, some plain text -- with no content-driven
 * reason for the difference.
 */
export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="bg-[var(--color-bg-surface)] p-5 sm:p-8 rounded-xl border border-[var(--color-border-subtle)] shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-[var(--color-text-primary)] tracking-tight flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-emerald-50 text-[var(--color-brand-primary)] rounded-xl shadow-inner">
              {icon}
            </div>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-[var(--color-text-secondary)] max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
