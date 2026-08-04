'use client';

import { useState, useCallback, useRef } from 'react';
import { UIMessage, StreamState } from '@/types';
import { API_BASE_URL } from '@/lib/api';

/**
 * useStream — Custom hook for SSE-based streaming chat with the RAG backend.
 * Handles token-by-token rendering, session management, and escalation events.
 */
export function useStream() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [streamState, setStreamState] = useState<StreamState>({
    isStreaming: false,
    streamingText: '',
    currentSessionId: null,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const generateId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const sendMessage = useCallback(
    async (userInput: string, sessionId?: string | null) => {
      if (!userInput.trim() || streamState.isStreaming) return;

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const userMessage: UIMessage = {
        id: generateId(),
        sender: 'user',
        text: userInput.trim(),
        citations: [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);

      const aiMsgId = generateId();

      setStreamState({
        isStreaming: true,
        streamingText: '',
        currentSessionId: sessionId ?? null,
        error: null,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          sender: 'ai',
          text: '',
          citations: [],
          isStreaming: true,
          timestamp: new Date(),
        },
      ]);

      try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userInput.trim(),
            sessionId: sessionId || undefined,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let rawBuffer = '';
        let accumulatedText = '';
        let finalCitations: string[] = [];
        let resolvedSessionId = sessionId || null;
        let isEscalated = false;

        /**
         * SSE format is:
         *   event: <type>\n
         *   data: <json>\n
         *   \n
         *
         * We accumulate raw bytes, split on double-newlines, and parse each block.
         */
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          rawBuffer += decoder.decode(value, { stream: true });

          // Split on double newlines (SSE event separator)
          const blocks = rawBuffer.split('\n\n');
          // Keep the last (possibly incomplete) block in the buffer
          rawBuffer = blocks.pop() ?? '';

          for (const block of blocks) {
            if (!block.trim()) continue;

            let eventType = '';
            let dataStr = '';

            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                dataStr = line.slice(6).trim();
              }
            }

            if (!eventType || !dataStr) continue;

            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(dataStr);
            } catch {
              continue;
            }

            switch (eventType) {
              case 'session':
                resolvedSessionId = (payload as { sessionId: string }).sessionId;
                setStreamState((prev) => ({
                  ...prev,
                  currentSessionId: resolvedSessionId,
                }));
                break;

              case 'token': {
                const token = (payload as { content: string }).content ?? '';
                accumulatedText += token;
                const snapshot = accumulatedText;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, text: snapshot } : m
                  )
                );
                break;
              }

              case 'escalated':
                isEscalated = true;
                break;

              case 'done':
                finalCitations =
                  (payload as { citations: string[] }).citations || [];
                resolvedSessionId =
                  (payload as { sessionId?: string }).sessionId ||
                  resolvedSessionId;
                break;

              case 'error':
                throw new Error(
                  (payload as { message: string }).message || 'Stream error'
                );
            }
          }
        }

        // Finalize AI message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  citations: finalCitations,
                  isEscalated,
                }
              : m
          )
        );

        setStreamState({
          isStreaming: false,
          streamingText: '',
          currentSessionId: resolvedSessionId,
          error: null,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;

        const errorMsg =
          err instanceof Error ? err.message : 'Connection error';

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: `⚠️ Error: ${errorMsg}`,
                  isStreaming: false,
                  citations: [],
                }
              : m
          )
        );

        setStreamState({
          isStreaming: false,
          streamingText: '',
          currentSessionId: null,
          error: errorMsg,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [streamState.isStreaming]
  );

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setStreamState({
      isStreaming: false,
      streamingText: '',
      currentSessionId: null,
      error: null,
    });
  }, []);

  return {
    messages,
    streamState,
    sendMessage,
    clearMessages,
    setMessages,
  };
}
