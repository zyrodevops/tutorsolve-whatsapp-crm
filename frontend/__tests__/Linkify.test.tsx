import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Linkify from '../src/components/ui/Linkify';

describe('Linkify Component', () => {
  it('renders plain text with no links unchanged', () => {
    const { container } = render(<Linkify text="Hello, just a normal message." />);
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(screen.getByText('Hello, just a normal message.')).toBeInTheDocument();
  });

  it('turns a bare https:// URL into a clickable link', () => {
    render(<Linkify text="Check this out: https://example.com/page" />);
    const link = screen.getByRole('link', { name: 'https://example.com/page' });
    expect(link).toHaveAttribute('href', 'https://example.com/page');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('turns a www.-prefixed domain into a link, prepending https://', () => {
    render(<Linkify text="Visit www.tutorsolve.com for more info" />);
    const link = screen.getByRole('link', { name: 'www.tutorsolve.com' });
    expect(link).toHaveAttribute('href', 'https://www.tutorsolve.com');
  });

  it('excludes trailing sentence punctuation from the link', () => {
    const { container } = render(<Linkify text="Here is the doc: https://example.com/form." />);
    const link = screen.getByRole('link', { name: 'https://example.com/form' });
    expect(link).toHaveAttribute('href', 'https://example.com/form');
    // The trailing period must still render, just as plain text after the link.
    expect(container.textContent).toBe('Here is the doc: https://example.com/form.');
  });

  it('linkifies multiple URLs in the same message independently', () => {
    render(<Linkify text="First https://a.com then https://b.com" />);
    expect(screen.getByRole('link', { name: 'https://a.com' })).toHaveAttribute('href', 'https://a.com');
    expect(screen.getByRole('link', { name: 'https://b.com' })).toHaveAttribute('href', 'https://b.com');
  });

  it('preserves surrounding text before and after an inline URL', () => {
    const { container } = render(<Linkify text="See https://example.com now" />);
    expect(container.textContent).toBe('See https://example.com now');
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('does not treat a javascript: pseudo-url as a link', () => {
    const { container } = render(<Linkify text="javascript:alert(1) www.safe.com" />);
    // Only the www. match should become a link -- the javascript: text stays plain.
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.safe.com');
  });
});
