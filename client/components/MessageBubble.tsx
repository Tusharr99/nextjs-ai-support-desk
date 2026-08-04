'use client';

import { UIMessage } from '@/types';
import Citations from './Citations';
import { Bot, User, AlertTriangle } from 'lucide-react';

interface MessageBubbleProps {
  message: UIMessage;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />
      <span className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />
    </div>
  );
}

function renderMarkdown(text: string): string {
  // Simple markdown → HTML conversion for display
  return text
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
      return `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Newlines to <br> (not inside code blocks)
    .replace(/\n/g, '<br />');
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === 'user';
  const isAI = message.sender === 'ai';

  return (
    <div
      className={`flex gap-3 animate-fade-in ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]'
            : 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]'
        }`}
      >
        {isUser ? (
          <User size={15} className="text-white" />
        ) : (
          <Bot size={15} className="text-[var(--accent-blue)]" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] text-white rounded-tr-sm'
            : 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-tl-sm'
        }`}
        style={{ wordBreak: 'break-word' }}
      >
        {/* Escalation warning */}
        {message.isEscalated && isAI && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
            <span className="text-amber-400 text-xs font-medium">
              Escalated to human support
            </span>
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
        ) : message.isStreaming && message.text === '' ? (
          <TypingIndicator />
        ) : (
          <div
            className="prose-dark text-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }}
          />
        )}

        {/* Streaming cursor */}
        {message.isStreaming && message.text !== '' && (
          <span className="inline-block w-0.5 h-4 bg-[var(--accent-blue)] ml-0.5 animate-pulse align-middle" />
        )}

        {/* Citations */}
        {!message.isStreaming && isAI && message.citations.length > 0 && (
          <Citations citations={message.citations} />
        )}

        {/* Timestamp */}
        <div
          className={`text-[0.65rem] mt-1.5 ${
            isUser ? 'text-blue-200/60' : 'text-[var(--text-muted)]'
          }`}
        >
          {message.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}
