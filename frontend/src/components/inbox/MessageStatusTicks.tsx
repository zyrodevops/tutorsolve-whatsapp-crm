import React from 'react';
import { Check, CheckCheck, AlertCircle } from 'lucide-react';

interface MessageStatusTicksProps {
  status: string;
}

export default function MessageStatusTicks({ status }: MessageStatusTicksProps) {
  switch (status) {
    case 'SENT':
      return (
        <span title="Sent" className="inline-flex">
          <Check size={14} />
        </span>
      );
    case 'DELIVERED':
      return (
        <span title="Delivered" className="inline-flex">
          <CheckCheck size={14} />
        </span>
      );
    case 'READ':
      return (
        <span title="Read" className="inline-flex">
          <CheckCheck size={14} className="text-blue-400" />
        </span>
      );
    case 'FAILED':
      return (
        <span title="Failed to send" className="inline-flex">
          <AlertCircle size={14} className="text-red-300" />
        </span>
      );
    default:
      return null;
  }
}
