import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageStatusTicks from '../src/components/inbox/MessageStatusTicks';

describe('MessageStatusTicks Component', () => {
  it('shows a single check for SENT', () => {
    const { container } = render(<MessageStatusTicks status="SENT" />);
    expect(screen.getByTitle('Sent')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('shows a double check for DELIVERED', () => {
    render(<MessageStatusTicks status="DELIVERED" />);
    expect(screen.getByTitle('Delivered')).toBeInTheDocument();
  });

  it('shows a blue double check for READ', () => {
    render(<MessageStatusTicks status="READ" />);
    const el = screen.getByTitle('Read');
    expect(el).toBeInTheDocument();
    expect(el.querySelector('svg')).toHaveClass('text-blue-400');
  });

  it('shows a failure indicator for FAILED', () => {
    render(<MessageStatusTicks status="FAILED" />);
    expect(screen.getByTitle('Failed to send')).toBeInTheDocument();
  });

  it('renders nothing for an unrecognized status', () => {
    const { container } = render(<MessageStatusTicks status="UNKNOWN" />);
    expect(container.firstChild).toBeNull();
  });
});
