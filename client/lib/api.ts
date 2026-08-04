// ─── API Base URL ──────────────────────────────────────────────────────────────
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// ─── API Client ────────────────────────────────────────────────────────────────

export async function fetchSessions() {
  const res = await fetch(`${API_BASE_URL}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchMessages(sessionId: string) {
  const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function fetchEscalatedSessions() {
  const res = await fetch(`${API_BASE_URL}/admin/escalated`);
  if (!res.ok) throw new Error('Failed to fetch escalated sessions');
  return res.json();
}

export async function resolveSession(sessionId: string, resolution: string) {
  const res = await fetch(
    `${API_BASE_URL}/admin/sessions/${sessionId}/resolve`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    }
  );
  if (!res.ok) throw new Error('Failed to resolve session');
  return res.json();
}

// ─── Format helpers ────────────────────────────────────────────────────────────

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}
