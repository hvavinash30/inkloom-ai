import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  ExternalLink,
  Info,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { api, ApiError } from '../services/api';
import { navigate, parseRoute } from '../lib/router';
import { routeRequirement } from '../lib/navigation';
import {
  getSpeechRecognitionConstructor,
  microphoneAvailable,
  speakText,
  speechSynthesisAvailable,
  stopSpeaking,
  type SpeechRecognitionLike,
} from '../lib/speech';
import type { AssistantResponse, ContentDocument } from '../types';
import { Button, cn } from './ui';

interface ChatLink {
  label: string;
  path: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  response?: AssistantResponse;
  links?: ChatLink[];
  viaVoice?: boolean;
}

const INTRO =
  'I answer from records stored in this workspace — audit findings, approved facts, rules, campaigns, and review decisions. Ask by voice or type below, and I will tell you when something is not verified.';

const ROUTE_COMMANDS: Array<{ pattern: RegExp; path: string; label: string }> = [
  { pattern: /\b(create (your )?(own )?brand|create a (new )?workspace|new workspace)\b/, path: '/onboarding', label: 'Create your own brand' },
  { pattern: /\b(new content|create content|start (a )?(new )?(content|audit|check)|upload (a )?(document|file))\b/, path: '/content/new', label: 'New content check' },
  { pattern: /\b(content history|document history|recent history)\b/, path: '/history', label: 'Content history' },
  { pattern: /\b(review queue|reviews|pending reviews|reviewer queue)\b/, path: '/reviews', label: 'Review queue' },
  { pattern: /\b(brand library|brand guidelines|brand facts|approved facts)\b/, path: '/brand', label: 'Brand library' },
  { pattern: /\b(policies|terminology|naming rules|brand rules)\b/, path: '/policies', label: 'Policies & brand memory' },
  { pattern: /\b(governance insights|insights|analytics|reporting)\b/, path: '/insights', label: 'Governance insights' },
  { pattern: /\b(campaigns?)\b/, path: '/campaigns', label: 'Campaigns' },
  { pattern: /\b(research|validation)\b/, path: '/research', label: 'Research & validation' },
  { pattern: /\b(evaluation)\b/, path: '/evaluation', label: 'Evaluation' },
  { pattern: /\b(team|roles|users|user management)\b/, path: '/team', label: 'Team & roles' },
  { pattern: /\b(settings|workspace settings|organization settings)\b/, path: '/settings', label: 'Organization settings' },
  { pattern: /\b(dashboard|overview|home page|go home)\b/, path: '/', label: 'Overview' },
  { pattern: /\b(content|documents|my documents)\b/, path: '/content', label: 'Content' },
];

const VOICE_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. Allow microphone access for this site in your browser settings, then try again.',
  'service-not-allowed': 'This browser blocked its speech-recognition service. Check site permissions, then try again or type below.',
  'audio-capture': 'No working microphone was detected. Connect a microphone, then try again.',
  'network': 'Speech recognition needs a network connection in this browser. Check your connection, then try again.',
  'language-not-supported': 'This browser does not support the requested speech language. Type your question instead.',
  'no-speech': 'No speech was detected. Press the microphone and try speaking a little closer.',
  'aborted': '',
};

function verificationTone(response: AssistantResponse) {
  if (response.verification === 'verified_from_workspace_records') {
    return {
      label: 'Grounded in workspace records',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      icon: 'text-emerald-600',
    };
  }
  if (response.verification === 'general_guidance') {
    return {
      label: 'General guidance — not a workspace verification',
      className: 'border-sky-200 bg-sky-50 text-sky-900',
      icon: 'text-sky-600',
    };
  }
  return {
    label: 'Unable to verify from current records',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: 'text-amber-600',
  };
}

function cleanSpeechQuery(value: string): string {
  return value
    .replace(/\b(please)\b/gi, ' ')
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function AssistantDrawer() {
  const { assistantOpen, assistantSeed, closeAssistant, can } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedKey, setSeedKey] = useState<string>('');
  const [speakReplies, setSpeakReplies] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voicePhase, setVoicePhase] = useState<'idle' | 'starting' | 'listening' | 'processing'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState('');
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 14 }, () => 0.12));

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const nextId = useRef(1);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef('');
  const discardRecognitionRef = useRef(false);
  const recognitionErroredRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelsFrameRef = useRef<number | null>(null);
  const speakRepliesRef = useRef(speakReplies);
  const commandHandlerRef = useRef<(text: string, viaVoice: boolean) => void>(() => undefined);
  speakRepliesRef.current = speakReplies;

  const recognitionSupported = getSpeechRecognitionConstructor() !== null;
  const synthesisSupported = speechSynthesisAvailable();
  const currentSeedKey = `${assistantSeed.documentId || ''}|${assistantSeed.campaignId || ''}|${assistantSeed.findingId || ''}|${assistantSeed.voice ? 'voice' : 'text'}`;

  const cleanupCapture = useCallback(() => {
    if (levelsFrameRef.current !== null) {
      window.cancelAnimationFrame(levelsFrameRef.current);
      levelsFrameRef.current = null;
    }
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
    setLevels((current) => current.map(() => 0.12));
  }, []);

  const stopSpeakingPlayback = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const speakReply = useCallback((text: string) => {
    if (!speakRepliesRef.current || !speechSynthesisAvailable()) return;
    setSpeaking(true);
    speakText(text, {
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, []);

  const requestAnswer = useCallback(
    async (message: string) => {
      setSending(true);
      setError(null);
      try {
        const response = await api.assistantChat({
          message,
          page_context: assistantSeed.pageContext || window.location.hash.replace(/^#/, '') || '/',
          document_id: assistantSeed.documentId,
          campaign_id: assistantSeed.campaignId,
          finding_id: assistantSeed.findingId,
        });
        setMessages((items) => [
          ...items,
          { id: nextId.current++, role: 'assistant', text: response.reply, response },
        ]);
        speakReply(response.reply);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.detail : 'The assistant could not answer this request.');
      } finally {
        setSending(false);
        if (recognitionSupported) {
          window.setTimeout(() => inputRef.current?.focus(), 60);
        }
      }
    },
    [assistantSeed.campaignId, assistantSeed.documentId, assistantSeed.findingId, assistantSeed.pageContext, recognitionSupported, speakReply]
  );

  const pushUserMessage = (text: string, viaVoice: boolean) => {
    setMessages((items) => [...items, { id: nextId.current++, role: 'user', text, viaVoice }]);
  };

  const send = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setInput('');
    setVoiceError(null);
    pushUserMessage(trimmed, false);
    await requestAnswer(trimmed);
  };

  const openDocument = async (query: string): Promise<boolean> => {
    const cleaned = cleanSpeechQuery(query);
    if (cleaned.length < 2) return false;
    setSending(true);
    setError(null);
    try {
      const documents = await api.listDocuments({ search: cleaned, limit: 5 });
      if (documents.length === 0) {
        const reply = `I could not find a document matching “${cleaned}”. You can browse everything in Content.`;
        setMessages((items) => [
          ...items,
          { id: nextId.current++, role: 'assistant', text: reply, links: [{ label: 'Browse content', path: '/content' }] },
        ]);
        speakReply(reply);
        return true;
      }
      const first = documents[0] as ContentDocument;
      const reply =
        documents.length === 1
          ? `Opening “${first.title}”.`
          : `I found ${documents.length} documents matching “${cleaned}”. Opening the closest match, “${first.title}”.`;
      setMessages((items) => [
        ...items,
        {
          id: nextId.current++,
          role: 'assistant',
          text: reply,
          links: [{ label: `Open ${first.title}`, path: `/content/${first.id}` }],
        },
      ]);
      speakReply(reply);
      navigate(`/content/${first.id}`);
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : 'Document search is unavailable right now.');
      return true;
    } finally {
      setSending(false);
    }
  };

  const handleVoiceCommand = async (text: string, viaVoice = true) => {
    const recognized = cleanSpeechQuery(text);
    if (!recognized) return;
    setVoicePhase('processing');
    pushUserMessage(recognized, viaVoice);
    setHeard(recognized);

    try {
      for (const command of ROUTE_COMMANDS) {
        if (!command.pattern.test(recognized.toLowerCase())) continue;
        const requirement = routeRequirement(parseRoute(command.path));
        if (requirement && !can(requirement)) {
          const reply = `Your current demo role cannot open ${command.label}. Switch roles or ask me something else.`;
          setMessages((items) => [...items, { id: nextId.current++, role: 'assistant', text: reply }]);
          speakReply(reply);
          return;
        }
        const reply = `Opening ${command.label}.`;
        setMessages((items) => [
          ...items,
          { id: nextId.current++, role: 'assistant', text: reply, links: [{ label: command.label, path: command.path }] },
        ]);
        speakReply(reply);
        navigate(command.path);
        return;
      }

      const explicitDocument = recognized.match(
        /\b(?:open|show|find|search for)\s+(?:the\s+)?(?:document|doc|file)\s+(.+)$/i
      );
      if (explicitDocument?.[1]) {
        if (await openDocument(explicitDocument[1])) return;
      }

      const genericOpen = recognized.match(/^(?:open|show|go to|take me to|find)\s+(.+)$/i);
      if (genericOpen?.[1]) {
        const query = genericOpen[1].replace(/^(the|a|an)\s+/i, '');
        if (await openDocument(query)) return;
      }

      await requestAnswer(recognized);
    } finally {
      setVoicePhase('idle');
      if (recognitionSupported) {
        window.setTimeout(() => inputRef.current?.focus(), 60);
      }
    }
  };
  commandHandlerRef.current = (text, viaVoice) => {
    void handleVoiceCommand(text, viaVoice);
  };

  const ensureAnalyser = async (): Promise<string | null> => {
    if (!microphoneAvailable()) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      streamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastPaint = 0;
      const paint = (time: number) => {
        if (!analyserRef.current) return;
        levelsFrameRef.current = window.requestAnimationFrame(paint);
        if (time - lastPaint < 70) return;
        lastPaint = time;
        analyser.getByteFrequencyData(data);
        const next: number[] = [];
        for (let index = 0; index < 14; index += 1) {
          const sample = data[Math.min(data.length - 1, index * 2)];
          next.push(Math.max(0.12, Math.min(1, sample / 180)));
        }
        setLevels(next);
      };
      levelsFrameRef.current = window.requestAnimationFrame(paint);
      return null;
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'Microphone permission was denied. Allow microphone access for this site in your browser settings, then try again.';
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'No microphone was detected. Connect a microphone, then try again.';
      }
      return null;
    }
  };

  const stopListening = () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          // Recognition already stopped.
        }
      }
    }
  };

  const startListening = async () => {
    if (!recognitionSupported || voicePhase !== 'idle') return;
    setVoiceError(null);
    setError(null);
    setInterim('');
    setHeard('');
    finalTranscriptRef.current = '';
    discardRecognitionRef.current = false;
    recognitionErroredRef.current = false;

    const captureIssue = await ensureAnalyser();
    if (captureIssue) {
      cleanupCapture();
      setVoiceError(captureIssue);
      return;
    }

    const Recognizer = getSpeechRecognitionConstructor();
    if (!Recognizer) {
      setVoiceError('Voice input is not available in this browser. You can type your question below.');
      cleanupCapture();
      return;
    }

    setVoicePhase('starting');
    const recognition = new Recognizer();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoicePhase('listening');
      setVoiceError(null);
    };
    recognition.onresult = (event) => {
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim();
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText);
      setHeard(`${finalTranscriptRef.current} ${interimText}`.trim());
    };
    recognition.onerror = (event) => {
      recognitionErroredRef.current = event.error !== 'aborted';
      const message = VOICE_ERRORS[event.error];
      if (message) setVoiceError(message);
      setVoicePhase('idle');
      setInterim('');
      cleanupCapture();
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      const transcript = finalTranscriptRef.current.trim();
      setInterim('');
      cleanupCapture();
      if (discardRecognitionRef.current) {
        setVoicePhase('idle');
        return;
      }
      if (recognitionErroredRef.current) {
        setVoicePhase('idle');
        return;
      }
      if (!transcript) {
        setVoicePhase('idle');
        setVoiceError('I did not catch any speech. Press the microphone and try again, or type your question.');
        return;
      }
      setVoicePhase('processing');
      commandHandlerRef.current(transcript, true);
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      cleanupCapture();
      setVoicePhase('idle');
      setVoiceError('Speech recognition could not start. Close other apps using the microphone, then try again.');
    }
  };

  const handleClose = () => {
    discardRecognitionRef.current = true;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // Recognition already stopped.
      }
    }
    cleanupCapture();
    stopSpeakingPlayback();
    setVoicePhase('idle');
    closeAssistant();
  };

  useEffect(() => {
    if (!assistantOpen) return;
    const key = `${currentSeedKey}|${window.location.hash}`;
    if (key !== seedKey) {
      setSeedKey(key);
      setMessages([]);
      setInput(assistantSeed.prompt || '');
      setError(null);
      setVoiceError(null);
      setHeard('');
      setInterim('');
      setVoicePhase('idle');
      setSpeakReplies(Boolean(assistantSeed.voice) && speechSynthesisAvailable());
    }
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreFocusRef.current = restore;
    const frame = window.requestAnimationFrame(() => {
      if (assistantSeed.voice) {
        micRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantOpen, currentSeedKey]);

  useEffect(() => {
    if (!assistantOpen) {
      cleanupCapture();
      stopSpeakingPlayback();
      recognitionRef.current = null;
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      const target = restoreFocusRef.current;
      if (target?.isConnected) target.focus();
      restoreFocusRef.current = null;
    };
  }, [assistantOpen, cleanupCapture, stopSpeakingPlayback]);

  useEffect(() => {
    if (!assistantOpen) return;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableInPanel = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) =>
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.offsetParent !== null
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusableInPanel();
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantOpen]);

  useEffect(() => {
    if (assistantOpen) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, sending, assistantOpen]);

  useEffect(
    () => () => {
      discardRecognitionRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {
        // Recognition already stopped.
      }
      cleanupCapture();
      stopSpeaking();
    },
    [cleanupCapture]
  );

  if (!assistantOpen) return null;

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

  const listening = voicePhase === 'listening';
  const busy = voicePhase === 'starting' || voicePhase === 'processing';

  const voiceStatus = !recognitionSupported
    ? 'Speech recognition is not available in this browser. Type your question below.'
    : voicePhase === 'starting'
      ? 'Requesting microphone access…'
      : voicePhase === 'listening'
        ? 'Listening now. Speak, then press the stop button.'
        : voicePhase === 'processing'
          ? 'Processing your speech…'
          : speaking
            ? 'Reading the answer aloud. Press stop to silence it.'
            : 'Press the microphone to speak, or type below.';

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
      <button
        type="button"
        aria-label="Close assistant"
        onClick={handleClose}
        className="absolute inset-0 bg-ink-950/30 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="animate-slide-in-right absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-[var(--line)] bg-white shadow-elevated focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-glow-brand">
              <Sparkles className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="assistant-title" className="font-display text-sm font-bold text-ink-900">
                Inkloom Assistant
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-ink-500">
                Grounded in workspace records. Not a legal opinion.
              </p>
              <span
                className={cn(
                  'mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  recognitionSupported
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-[var(--line)] bg-ink-50 text-ink-500'
                )}
              >
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', recognitionSupported ? 'bg-emerald-500' : 'bg-ink-300')}
                  aria-hidden
                />
                {recognitionSupported ? 'Voice input supported' : 'Voice input unavailable'}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {synthesisSupported ? (
              <button
                type="button"
                onClick={() => {
                  setSpeakReplies((value) => {
                    const next = !value;
                    if (!next) stopSpeakingPlayback();
                    return next;
                  });
                }}
                aria-pressed={speakReplies}
                aria-label={speakReplies ? 'Turn off spoken replies' : 'Turn on spoken replies'}
                title={speakReplies ? 'Spoken replies on' : 'Spoken replies off'}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                  speakReplies
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-transparent text-ink-400 hover:bg-ink-50 hover:text-ink-700'
                )}
              >
                {speakReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-[var(--line)] bg-gradient-to-r from-brand-50/70 via-white to-aqua-50/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              ref={micRef}
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={busy}
              aria-pressed={listening}
              aria-label={listening ? 'Stop voice input' : 'Start voice input'}
              className={cn(
                'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-glow-brand transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70',
                listening
                  ? 'bg-gradient-to-br from-rose-500 to-rose-600'
                  : 'bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 hover:from-brand-700 hover:to-violet-600'
              )}
            >
              {listening ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : busy ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Mic className="h-5 w-5" aria-hidden />
              )}
              {listening ? (
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-rose-400/40" aria-hidden />
              ) : null}
            </button>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
                {listening ? <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden /> : null}
                {listening ? 'Listening' : busy ? 'Working' : 'Voice assistant'}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-ink-500" aria-live="polite">
                {voiceStatus}
              </p>
            </div>

            {listening || speaking ? (
              <div className="flex h-10 shrink-0 items-end gap-[3px]" aria-hidden>
                {levels.map((level, index) => (
                  <span
                    key={index}
                    className={cn(
                      'w-[3px] rounded-full transition-[height] duration-100',
                      listening ? 'bg-gradient-to-t from-brand-500 to-aqua-400' : 'bg-brand-300'
                    )}
                    style={{ height: speaking && !listening ? `${8 + ((index * 5) % 18)}px` : `${6 + level * 26}px` }}
                  />
                ))}
              </div>
            ) : null}

            {speaking ? (
              <button
                type="button"
                onClick={stopSpeakingPlayback}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-2 text-[11px] font-semibold text-ink-700 transition-colors hover:border-rose-200 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <Square className="h-3 w-3" aria-hidden />
                Stop
              </button>
            ) : null}
          </div>

          {heard ? (
            <div className="mt-2.5 rounded-lg border border-[var(--line)] bg-white/80 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Recognized speech</p>
              <p className="mt-0.5 text-xs leading-5 text-ink-700">
                {heard}
                {interim ? <span className="text-ink-400"> {interim}</span> : null}
              </p>
            </div>
          ) : null}

          {voiceError ? (
            <div
              role="alert"
              className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              <span className="min-w-0 flex-1">{voiceError}</span>
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                className="shrink-0 rounded text-amber-700 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                aria-label="Dismiss voice message"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 border-b border-[var(--line)] bg-ink-50/60 px-4 py-2">
          <BookOpenCheck className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
          <p className="truncate text-[11px] text-ink-500">{contextLabel}</p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </div>
            <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-[var(--line)] bg-ink-50/70 px-3.5 py-2.5 text-sm leading-6 text-ink-700">
              {INTRO}
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="space-y-2 pt-1">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Try asking</p>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="group flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-left text-xs font-medium text-ink-700 shadow-subtle transition-colors hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  {suggestion}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}

          {messages.map((message) => {
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[88%]">
                    <div className="rounded-xl rounded-tr-sm bg-gradient-to-br from-brand-600 to-brand-500 px-3.5 py-2.5 text-sm leading-6 text-white shadow-subtle">
                      {message.text}
                    </div>
                    {message.viaVoice ? (
                      <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ink-400">
                        <Mic className="h-2.5 w-2.5" aria-hidden />
                        Spoken
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            }
            const response = message.response;
            if (!response) {
              return (
                <div key={message.id} className="flex gap-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div className="min-w-0 max-w-[90%] space-y-2">
                    <div className="whitespace-pre-wrap break-words rounded-xl rounded-tl-sm border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm leading-6 text-ink-700 shadow-subtle">
                      {message.text}
                    </div>
                    {message.links?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {message.links.map((link) => (
                          <button
                            key={link.path}
                            type="button"
                            onClick={() => {
                              navigate(link.path);
                              handleClose();
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                          >
                            {link.label}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }
            const tone = verificationTone(response);
            return (
              <div key={message.id} className="flex gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </div>
                <div className="min-w-0 max-w-[90%] space-y-2.5">
                  <div className="whitespace-pre-wrap break-words rounded-xl rounded-tl-sm border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm leading-6 text-ink-700 shadow-subtle">
                    {response.reply}
                  </div>
                  <div className={cn('rounded-lg border px-3 py-2', tone.className)}>
                    <p className="flex items-start gap-1.5 text-[11px] font-semibold leading-4">
                      {response.verification === 'unable_to_verify' ? (
                        <AlertTriangle className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone.icon)} aria-hidden />
                      ) : (
                        <BookOpenCheck className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone.icon)} aria-hidden />
                      )}
                      {tone.label}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 opacity-80">{response.verification_note}</p>
                  </div>
                  {response.grounding.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Evidence used</p>
                      {response.grounding.map((item, index) => (
                        <div key={index} className="rounded-lg border border-[var(--line)] bg-ink-50/70 px-2.5 py-2">
                          <p className="text-[11px] font-medium text-ink-800">{item.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-500">{item.detail}</p>
                          {item.source_reference ? (
                            <p className="mt-1 truncate text-[10px] text-ink-400">Source: {item.source_reference}</p>
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
                              handleClose();
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white px-2 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                          >
                            {action.label}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </button>
                        ) : null
                      )}
                    </div>
                  ) : null}
                  {response.limitations.length > 0 ? (
                    <details className="text-[10px] text-ink-400">
                      <summary className="cursor-pointer select-none hover:text-ink-700">Limitations</summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {response.limitations.map((limitation, index) => (
                          <li key={index} className="leading-4">
                            {limitation}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              </div>
            );
          })}

          {sending ? (
            <div className="flex items-center gap-2 text-xs text-ink-500" aria-live="polite">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              </div>
              Checking stored workspace records…
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
              {error}
            </div>
          ) : null}
        </div>

        <div className="border-t border-[var(--line)] p-3">
          <div className="rounded-xl border border-[var(--line-strong)] bg-white p-2 shadow-subtle transition-shadow focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-500/20">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder="Ask about findings, rules, facts, campaigns, or next steps…"
              className="w-full resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-5 text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-1">
              <span className="text-[10px] text-ink-400">Enter to send · Shift + Enter for a new line</span>
              <Button size="sm" onClick={() => void send(input)} disabled={!input.trim() || sending} aria-label="Send message">
                <Send className="h-3.5 w-3.5" aria-hidden />
                Send
              </Button>
            </div>
          </div>
          <div className="mt-2 flex items-start gap-1.5 px-1">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-300" aria-hidden />
            <p className="text-[10px] leading-4 text-ink-400">
              Spoken input is handled by your browser's speech service. Assistant answers always come from stored
              workspace records through the Inkloom backend; when a grounded LLM is configured, it is used with those
              records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
