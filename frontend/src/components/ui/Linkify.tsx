import React from 'react';

interface LinkifyProps {
  text: string;
  // Bubble backgrounds vary (agent messages are a solid brand-color fill,
  // notes/customer messages are light) -- callers on a colored background
  // should pass true so links stay legible against it.
  isOnColoredBackground?: boolean;
}

// Only matches an explicit http(s):// scheme or a www. prefix, so something
// like "javascript:alert(1)" can never be picked up and turned into an
// anchor's href.
const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const TRAILING_PUNCTUATION_REGEX = /[).,!?;:'"]+$/;

function toHref(url: string): string {
  return url.startsWith('www.') ? `https://${url}` : url;
}

export default function Linkify({ text, isOnColoredBackground }: LinkifyProps) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const raw = match[0];
    const start = match.index ?? 0;

    let url = raw;
    let trailing = '';
    const trailingMatch = url.match(TRAILING_PUNCTUATION_REGEX);
    if (trailingMatch) {
      trailing = trailingMatch[0];
      url = url.slice(0, url.length - trailing.length);
    }
    if (!url) continue;

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    parts.push(
      <a
        key={`link-${key++}`}
        href={toHref(url)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`underline break-all ${
          isOnColoredBackground
            ? 'text-white hover:text-emerald-50'
            : 'text-blue-600 hover:text-blue-800'
        }`}
      >
        {url}
      </a>
    );

    if (trailing) {
      parts.push(trailing);
    }

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
