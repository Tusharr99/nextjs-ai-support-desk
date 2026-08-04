'use client';

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { UIMessage } from '@/types';
import MessageBubble from './MessageBubble';
import { Send, Zap, ChevronDown } from 'lucide-react';

interface ChatWindowProps {
  messages: UIMessage[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
}

const STARTER_PROMPTS = [
  'How does the Next.js App Router work?',
  'How do I implement server-side rendering?',
  'What are React Server Components?',
  'How do I handle dynamic routes?',
];

export default function ChatWindow({
  messages,
  isStreaming,
  onSendMessage,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'instant',
    });
  };

  useEffect(() => {
    if (isStreaming) scrollToBottom();
  }, [messages, isStreaming]);

  // Show scroll-to-bottom button
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full relative">
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
      >
        {isEmpty ? (
          /* Welcome / Empty State */
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            {/* Hero */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center mb-5 glow-blue">
              <Zap size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
              NextDesk AI Support
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-md">
              Ask me anything about Next.js — routing, server components, data
              fetching, deployment, and more. Answers are sourced directly from
              the official documentation.
            </p>

            {/* Starter prompts */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => onSendMessage(prompt)}
                  className="text-left p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-active)] transition-all duration-150 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-24 right-6 w-8 h-8 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shadow-lg hover:bg-[var(--accent-blue-hover)] transition-colors z-10"
        >
          <ChevronDown size={16} className="text-white" />
        </button>
      )}

      {/* Input area */}
      <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a Next.js question… (Shift+Enter for new line)"
            disabled={isStreaming}
            rows={1}
            className="chat-input flex-1 px-4 py-3 text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="btn-primary w-11 h-11 flex items-center justify-center flex-shrink-0"
            aria-label="Send message"
          >
            {isStreaming ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p className="text-[0.65rem] text-[var(--text-muted)] mt-2 text-center">
          Powered by GPT-4o-mini · Next.js documentation · RAG pipeline
        </p>
      </div>
    </div>
  );
}
