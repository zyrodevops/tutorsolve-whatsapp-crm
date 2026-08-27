import React, { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

/**
 * Textarea sibling of Input.tsx -- same visual language (border, focus ring,
 * error state), so a multi-line field doesn't look like it came from a
 * different app than the single-line fields next to it.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col w-full">
        {label && (
          <label htmlFor={props.id} className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-3 py-2 bg-[var(--color-bg-surface)] border rounded-md text-sm shadow-sm resize-none
            focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200
            ${error
              ? 'border-[var(--color-status-error)] focus:ring-[var(--color-status-error)]'
              : 'border-[var(--color-border-subtle)] focus:ring-[var(--color-border-focus)]'
            }
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="mt-1 text-xs text-[var(--color-status-error)]">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
