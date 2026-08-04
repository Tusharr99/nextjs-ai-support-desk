'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChatSession } from '@/types';
import { fetchSessions, fetchMessages } from '@/lib/api';
import { useStream } from '@/hooks/useStream';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import { UIMessage } from '@/types';
import { Menu, X } from 'lucide-react';

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { messages, streamState, sendMessage, clearMessages, setMessages } =
    useStream();

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Reload sessions after a message is streamed
  useEffect(() => {
    if (!streamState.isStreaming && streamState.currentSessionId) {
      loadSessions();
    }
  }, [streamState.isStreaming, streamState.currentSessionId]);

  const loadSessions = async () => {
    try {
      const data = await fetchSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const handleNewChat = useCallback(() => {
    clearMessages();
  }, [clearMessages]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    try {
      clearMessages();
      const data = await fetchMessages(sessionId);
      const loadedMessages: UIMessage[] = (data.messages || []).map(
        (msg: {
          _id: string;
          sender: 'user' | 'ai';
          text: string;
          citations: string[];
          createdAt: string;
        }) => ({
          id: msg._id,
          sender: msg.sender,
          text: msg.text,
          citations: msg.citations || [],
          isStreaming: false,
          timestamp: new Date(msg.createdAt),
        })
      );
      setMessages(loadedMessages);
    } catch (err) {
      console.error('Failed to load session messages:', err);
    }
  }, [clearMessages, setMessages]);

  const handleSendMessage = useCallback(
    (text: string) => {
      sendMessage(text, streamState.currentSessionId);
    },
    [sendMessage, streamState.currentSessionId]
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:relative z-30 lg:z-auto h-full transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <Sidebar
          sessions={sessions}
          currentSessionId={streamState.currentSessionId}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors lg:hidden"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {streamState.isStreaming ? 'AI is typing…' : 'Next.js AI Support'}
            </span>
          </div>
          {streamState.currentSessionId && (
            <span className="ml-auto text-[0.65rem] font-mono text-[var(--text-muted)] hidden sm:block">
              Session: {streamState.currentSessionId.slice(-8)}
            </span>
          )}
        </header>

        {/* Chat window */}
        <div className="flex-1 min-h-0">
          <ChatWindow
            messages={messages}
            isStreaming={streamState.isStreaming}
            onSendMessage={handleSendMessage}
          />
        </div>
      </main>
    </div>
  );
}
