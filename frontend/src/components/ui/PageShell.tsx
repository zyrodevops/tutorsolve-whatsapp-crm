import React from 'react';

interface PageShellProps {
  children: React.ReactNode;
}

/**
 * Standardizes the outer canvas every admin page (Team, Analytics, Quick
 * Replies) renders into -- padding, background, max width, and vertical
 * rhythm. Before this existed, each page redefined its own version of this
 * wrapper slightly differently (different padding on mobile, different
 * background mechanism, different max-width), which is why the pages read
 * as visually inconsistent even though nothing about their content differs.
 */
export function PageShell({ children }: PageShellProps) {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8 bg-[var(--color-bg-base)]">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {children}
      </div>
    </div>
  );
}
