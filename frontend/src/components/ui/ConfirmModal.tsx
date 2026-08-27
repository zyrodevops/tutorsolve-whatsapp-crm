import React from 'react';
import { Button } from './Button';

interface ConfirmModalProps {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's one destructive-confirmation pattern (extracted from Team
 * Management's original "Remove team member?" modal). Anything that used to
 * reach for window.confirm() -- e.g. Quick Replies' delete flow -- should
 * use this instead, so every "are you sure you want to delete X" moment in
 * the app looks and behaves the same way.
 */
export function ConfirmModal({ title, description, confirmLabel = 'Confirm', onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--color-bg-surface)] w-full max-w-sm rounded-xl shadow-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">{title}</h2>
        <div className="text-sm text-[var(--color-text-secondary)] mb-6">{description}</div>
        <div className="flex justify-end space-x-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
