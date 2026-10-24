import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../services/api';
import { navigate } from '../lib/router';
import type { AssistantResponse } from '../types';
import { Button, cn } from './ui';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  response?: AssistantResponse;
}

const INTRO =
  'I answer from records stored in this workspace — audit findings, approved facts, rules, campaigns, and review decisions. I will tell you when something is not verified.';

function verificationTone(response: AssistantResponse) {
  if (response.verification === 'verified_from_workspace_records') {
    return {
      label: 'Grounded in workspace records',
      className: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
      icon: 'text-emerald-600',
    };
  }
  if (response.verification === 'general_guidance') {
    return {
      label: 'General guidance — not a workspace verification',
      className: 'border-blue-200 bg-blue-50/70 text-blue-900',
      icon: 'text-blue-600',
    };
  }
  return {
    label: 'Unable to verify from current records',
    className: 'border-amber-200 bg-amber-50/70 text-amber-900',
    icon: 'text-amber-600',
  };
}

export function AssistantDrawer() {
  const { assistantOpen, assistantSeed, closeAssistant } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedKey, setSeedKey] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  const currentSeedKey = `${assistantSeed.documentId || ''}|${assistantSeed.campaignId || ''}|${assistantSeed.findingId || ''}`;

  useEffect(() => {
    if (!assistantOpen) return;
    const key = `${currentSeedKey}|${window.location.hash}`;
    if (key !== seedKey) {
      setSeedKey(key);
      setMessages([]);
      setInput(assistantSeed.prompt || '');
      setError(null);
    }
    window.setTimeout(() => inputRef.current?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantOpen, currentSeedKey]);

  useEffect(() => {
    if (!assistantOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAssistant();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [assistantOpen, closeAssistant]);

  useEffect(() => {
    if (assistantOpen) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, sending, assistantOpen]);

  const send = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setError(null);
    setSending(true);
    setInput('');
    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text: trimmed };
    setMessages((items) => [...items, userMessage]);
    try {
      const response = await api.assistantChat({
        message: trimmed,
        page_context: assistantSeed.pageContext || window.location.hash.replace(/^#/, '') || '/',
        document_id: assistantSeed.documentId,
        campaign_id: assistantSeed.campaignId,
        finding_id: assistantSeed.findingId,
      });
      setMessages((items) => [
        ...items,
        { id: nextId.current++, role: 'assistant', text: response.reply, response },
      ]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : 'The assistant could not answer this request.');
    } finally {
      setSending(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const contextLabel = assistantSeed.findingId
    ? 'A specific finding is attached to this conversation.'
    : assistantSeed.documentId
      ? 'A document is attached; answers can cite its stored findings and evidence.'
      : assistantSeed.campaignId
        ? 'A campaign is attached; answers can cite its readiness checks and conflicts.'
        : 'No document or campaign is attached.';

  const suggestions = assistantSeed.findingId
    ? ['Explain this finding and its evidence', 'What correction should I consider?', 'Is this a confirmed contradiction?']
    : assistantSeed.documentId
      ? ['Summarize the findings in this document', 'What should I fix first?', 'Which approved fact is contradicted?']
      : assistantSeed.campaignId
        ? ['Is this campaign ready to launch?', 'Explain the unresolved conflicts', 'What is blocking approval?']
        : ['What needs my attention today?', 'What does the audit score mean?', 'Which approved facts are outdated?'];

  if (!assistantOpen) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Inkloom evidence assistant">
      <button
        type="button"
        aria-label="Close assistant"
        onClick={closeAssistant}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-elevated">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950">Inkloom evidence assistant</h2>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                Rule-based answers grounded in stored records. Not a legal opinion.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAssistant}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close assistant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <BookOpenCheck className="h-3.5 w-3.5 text-slate-400" />
            {contextLabel}
          </p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-6 text-slate-700">
              {INTRO}
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="space-y-2 pt-1">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Try asking</p>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:border-brand-200 hover:bg-brand-50/40 hover:text-brand-800"
                >
                  {suggestion}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          ) : null}

          {messages.map((message) => {
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[88%] rounded-xl rounded-tr-sm bg-brand-600 px-3.5 py-2.5 text-sm leading-6 text-white">
                    {message.text}
                  </div>
                </div>
              );
            }
            const response = message.response;
            if (!response) return null;
            const tone = verificationTone(response);
            return (
              <div key={message.id} className="flex gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 max-w-[90%] space-y-2.5">
                  <div className="whitespace-pre-wrap break-words rounded-xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-700">
                    {response.reply}
                  </div>
                  <div className={cn('rounded-lg border px-3 py-2', tone.className)}>
                    <p className="flex items-start gap-1.5 text-[11px] font-semibold leading-4">
                      {response.verification === 'unable_to_verify' ? (
                        <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone.icon)} />
                      ) : (
                        <BookOpenCheck className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone.icon)} />
                      )}
                      {tone.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 opacity-80">{response.verification_note}</p>
                  </div>
                  {response.grounding.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence used</p>
                      {response.grounding.map((item, index) => (
                        <div key={index} className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                          <p className="text-[11px] font-medium text-slate-700">{item.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">{item.detail}</p>
                          {item.source_reference ? (
                            <p className="mt-1 truncate text-[10px] text-slate-400">Source: {item.source_reference}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {response.suggested_actions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {response.suggested_actions.map((action, index) =>
                        action.route ? (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              navigate(action.route as string);
                              closeAssistant();
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                          >
                            {action.label}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : null
                      )}
                    </div>
                  ) : null}
                  {response.limitations.length > 0 ? (
                    <details className="text-[10px] text-slate-400">
                      <summary className="cursor-pointer select-none hover:text-slate-600">Limitations</summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {response.limitations.map((limitation, index) => (
                          <li key={index} className="leading-4">{limitation}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </div>
            );
          })}

          {sending ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
              Checking stored workspace records…
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
              {error}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 p-3">
          <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-subtle focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder="Ask about findings, rules, facts, campaigns, or next steps…"
              className="w-full resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-5 text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-1">
              <span className="text-[10px] text-slate-400">Enter to send · Shift + Enter for a new line</span>
              <Button
                size="sm"
                onClick={() => send(input)}
                disabled={!input.trim() || sending}
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
          </div>
          <p className="mt-1.5 px-1 text-[10px] leading-4 text-slate-400">
            No external AI is required. When an LLM is configured, responses are still grounded in these records.
          </p>
        </div>
      </div>
    </div>
  );
}
