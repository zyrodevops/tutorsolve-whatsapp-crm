import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  isLoading,
  variant = 'primary',
  className = '',
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-[var(--color-brand-primary)] hover:bg-[var(--color-brand-hover)] text-white focus:ring-[var(--color-border-focus)] shadow-sm",
    secondary: "bg-[var(--color-bg-surface)] hover:bg-gray-50 text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] focus:ring-[var(--color-border-focus)] shadow-sm",
    ghost: "bg-transparent hover:bg-gray-100 text-[var(--color-text-secondary)] focus:ring-[var(--color-border-focus)]",
    danger: "bg-[var(--color-status-error)] hover:bg-red-600 text-white focus:ring-red-300 shadow-sm"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
};
