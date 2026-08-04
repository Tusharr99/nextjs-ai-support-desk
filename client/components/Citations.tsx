'use client';

import { FileText } from 'lucide-react';

interface CitationsProps {
  citations: string[];
}

export default function Citations({ citations }: CitationsProps) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
      <div className="flex items-center gap-1.5 mb-2">
        <FileText size={12} className="text-[var(--accent-blue)]" />
        <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Sources
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {citations.map((citation, i) => (
          <span key={i} className="citation-chip">
            <FileText size={10} />
            {citation}
          </span>
        ))}
      </div>
    </div>
  );
}
