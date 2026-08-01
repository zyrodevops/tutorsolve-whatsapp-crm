import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, rightElement, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col w-full">
        {label && (
          <label htmlFor={props.id} className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            suppressHydrationWarning
            className={`
              w-full px-3 py-2 bg-[var(--color-bg-surface)] border rounded-md text-sm shadow-sm
              focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200
              ${rightElement ? 'pr-10' : ''}
              ${error 
                ? 'border-[var(--color-status-error)] focus:ring-[var(--color-status-error)]' 
                : 'border-[var(--color-border-subtle)] focus:ring-[var(--color-border-focus)]'
              }
              ${className}
            `}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-0 top-0 h-full flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors">
              {rightElement}
            </div>
          )}
        </div>
        {error && (
          <span className="mt-1 text-xs text-[var(--color-status-error)]">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
