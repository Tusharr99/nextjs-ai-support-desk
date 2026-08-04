'use client';

import { useEffect, useState, useCallback } from 'react';
import { EscalatedSession } from '@/types';
import { fetchEscalatedSessions, resolveSession, formatDate, formatTime } from '@/lib/api';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  User,
  Bot,
  ShieldAlert,
  Clock,
} from 'lucide-react';

export default function AdminPage() {
  const [sessions, setSessions] = useState<EscalatedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<EscalatedSession | null>(null);
  const [resolution, setResolution] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const loadEscalated = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEscalatedSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to load escalated sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEscalated();
  }, [loadEscalated]);

  const handleResolve = async (sessionId: string) => {
    if (!resolution.trim()) return;
    setSubmitting(true);

    try {
      await resolveSession(sessionId, resolution.trim());
      setResolvedIds((prev) => new Set(prev).add(sessionId));
      setResolution('');
      setSelectedSession(null);
      // Reload to reflect changes
      await loadEscalated();
    } catch (err) {
      console.error('Failed to resolve session:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const unresolved = sessions.filter((s) => !resolvedIds.has(s._id));

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20 px-6 py-4 border-b border-[var(--border-subtle)]"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Back to chat"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center">
              <ShieldAlert size={18} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base text-[var(--text-primary)]">
                Admin Escalation Dashboard
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                Review and resolve low-confidence AI responses
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={13} className="text-amber-400" />
              <span className="text-xs font-semibold text-amber-400">
                {unresolved.length} Pending
              </span>
            </div>
            <button
              onClick={loadEscalated}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">
                Loading escalated sessions…
              </p>
            </div>
          </div>
        ) : unresolved.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 flex items-center justify-center mb-4">
              <CheckCircle2 size={28} className="text-[var(--accent-green)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
              All Clear!
            </h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-xs">
              No escalated sessions at this time. The AI is handling all
              questions confidently.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Session List ── */}
            <div className="lg:col-span-1 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3">
                Escalated Sessions ({unresolved.length})
              </h2>
              {unresolved.map((session) => (
                <button
                  key={session._id}
                  onClick={() => {
                    setSelectedSession(session);
                    setResolution('');
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                    selectedSession?._id === session._id
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-active)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2">
                      {session.summary || 'Untitled session'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[0.65rem] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDate(session.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={10} />
                      {session.messages?.length || 0} msgs
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* ── Session Detail ── */}
            <div className="lg:col-span-2">
              {!selectedSession ? (
                <div className="h-full flex items-center justify-center py-16">
                  <div className="text-center">
                    <MessageSquare
                      size={36}
                      className="mx-auto mb-3 text-[var(--text-muted)]"
                    />
                    <p className="text-sm text-[var(--text-secondary)]">
                      Select a session to review
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden"
                  style={{ background: 'var(--bg-card)' }}
                >
                  {/* Session header */}
                  <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
                    <AlertTriangle size={15} className="text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {selectedSession.summary || 'Escalated Session'}
                      </p>
                      <p className="text-[0.65rem] text-[var(--text-muted)]">
                        Created {formatDate(selectedSession.createdAt)} ·{' '}
                        {selectedSession.messages?.length || 0} messages
                      </p>
                    </div>
                    <span className="badge-escalated">Escalated</span>
                  </div>

                  {/* Messages */}
                  <div className="px-5 py-4 space-y-3 max-h-[360px] overflow-y-auto">
                    {selectedSession.messages?.map((msg) => (
                      <div
                        key={msg._id}
                        className={`flex gap-3 ${
                          msg.sender === 'user' ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                            msg.sender === 'user'
                              ? 'bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]'
                              : 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {msg.sender === 'user' ? (
                            <User size={12} className="text-white" />
                          ) : (
                            <Bot size={12} className="text-[var(--accent-blue)]" />
                          )}
                        </div>
                        <div
                          className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                            msg.sender === 'user'
                              ? 'bg-[var(--accent-blue)]/20 text-[var(--text-primary)] rounded-tr-sm'
                              : 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded-tl-sm'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          <p className="text-[0.6rem] text-[var(--text-muted)] mt-1">
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Resolution input */}
                  <div className="px-5 py-4 border-t border-[var(--border-subtle)]">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                      Admin Resolution
                    </label>
                    <textarea
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Type your resolution or correct answer here…"
                      rows={3}
                      className="chat-input w-full px-4 py-3 text-sm mb-3"
                    />
                    <button
                      onClick={() => handleResolve(selectedSession._id)}
                      disabled={!resolution.trim() || submitting}
                      className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"
                    >
                      {submitting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Resolving…
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          Mark as Resolved
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
