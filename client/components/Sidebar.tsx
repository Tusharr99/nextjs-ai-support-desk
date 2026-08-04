'use client';

import { ChatSession } from '@/types';
import { formatDate, truncateText } from '@/lib/api';
import {
  Plus,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  LayoutDashboard,
} from 'lucide-react';
import Link from 'next/link';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
}

export default function Sidebar({
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
}: SidebarProps) {
  return (
    <aside
      className="w-64 flex flex-col h-full glass border-r border-[var(--border-subtle)]"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {/* Logo */}
      <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <div>
            <h1 className="font-bold text-sm text-[var(--text-primary)] leading-tight">
              NextDesk
            </h1>
            <p className="text-[0.65rem] text-[var(--text-muted)] leading-tight">
              AI Support Desk
            </p>
          </div>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="px-4 py-3">
        <button
          onClick={onNewChat}
          className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm"
        >
          <Plus size={15} />
          New Chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="text-xs text-[var(--text-muted)]">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-[var(--text-muted)] px-2 py-1.5">
              Recent Chats
            </p>
            {sessions.map((session) => (
              <button
                key={session._id}
                onClick={() => onSelectSession(session._id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 group ${
                  currentSessionId === session._id
                    ? 'bg-[var(--bg-hover)] border border-[var(--border-active)]'
                    : 'hover:bg-[var(--bg-hover)]/50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex-shrink-0">
                    {session.status === 'escalated' ? (
                      <AlertTriangle size={12} className="text-amber-400" />
                    ) : (
                      <CheckCircle2 size={12} className="text-[var(--accent-green)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {truncateText(session.summary || 'New conversation', 40)}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[0.65rem] text-[var(--text-muted)]">
                        {formatDate(session.createdAt)}
                      </span>
                      {session.status === 'escalated' && (
                        <span className="badge-escalated text-[0.6rem]">
                          Escalated
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Admin Link */}
      <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
        <Link
          href="/admin"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all duration-150"
        >
          <LayoutDashboard size={14} />
          Admin Dashboard
        </Link>
      </div>
    </aside>
  );
}
