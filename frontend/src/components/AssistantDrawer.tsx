import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Check,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  MessageSquarePlus,
  Mic,
  RotateCcw,
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
import { copyToClipboard } from '../lib/clipboard';
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
import { AssistantOrb, ORB_STATE_LABEL, type AssistantOrbState } from './AssistantOrb';
import { MarkdownMessage } from './MarkdownMessage';

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

const RECOGNITION_START_TIMEOUT_MS = 10_000;
const RECOGNITION_MAX_DURATION_MS = 30_000;

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

function reduceMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

export function AssistantDrawer() {
  const { assistantOpen, assistantSeed, closeAssistant, can } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [stopNote, setStopNote] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [responding, setResponding] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voicePhase, setVoicePhase] = useState<
    'idle' | 'requesting' | 'listening' | 'finishing' | 'processing'
  >('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [heard, setHeard] = useState('');
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 14 }, () => 0.12));
  const [waveformActive, setWaveformActive] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const nextId = useRef(1);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceSessionRef = useRef(0);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const discardRecognitionRef = useRef(false);
  const recognitionErroredRef = useRef(false);
  const voiceSubmittedRef = useRef(false);
  const startTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelsFrameRef = useRef<number | null>(null);
  const speakRepliesRef = useRef(speakReplies);
  const commandHandlerRef = useRef<(text: string, viaVoice: boolean) => void>(() => undefined);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastRequestRef = useRef('');
  const startListeningRef = useRef<() => void>(() => undefined);
  const openHandledRef = useRef(false);
  const conversationKeyRef = useRef('');
  const openRef = useRef(assistantOpen);
  const copyTimerRef = useRef<number | null>(null);
  speakRepliesRef.current = speakReplies;
  openRef.current = assistantOpen;

  const recognitionSupported = getSpeechRecognitionConstructor() !== null;
  const synthesisSupported = speechSynthesisAvailable();
  const secureContext = typeof window === 'undefined' || window.isSecureContext !== false;

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
    setWaveformActive(false);
    setLevels((current) => current.map(() => 0.12));
  }, []);

  const clearVoiceTimers = useCallback(() => {
    if (startTimerRef.current !== null) {
      window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const stopSpeakingPlayback = useCallback(() => {
    stopSpeaking();
    setResponding(false);
    setSpeaking(false);
  }, []);

  const speakReply = useCallback((text: string) => {
    if (!speakRepliesRef.current || !speechSynthesisAvailable()) return;
    setResponding(true);
    const started = speakText(text, {
      onStart: () => {
        setResponding(false);
        setSpeaking(true);
      },
      onEnd: () => {
        setResponding(false);
        setSpeaking(false);
      },
      onError: () => {
        setResponding(false);
        setSpeaking(false);
      },
    });
    if (!started) {
      setResponding(false);
      setSpeaking(false);
    }
  }, []);

  const abortRequestSilently = useCallback(() => {
    requestIdRef.current += 1;
    const controller = requestAbortRef.current;
    requestAbortRef.current = null;
    if (controller) controller.abort();
    setSending(false);
    setCanStop(false);
  }, []);

  const requestAnswer = useCallback(
    async (message: string, options: { viaVoice?: boolean; appendUser?: boolean } = {}) => {
      const trimmed = message.trim();
      if (!trimmed || requestAbortRef.current) return;
      const appendUser = options.appendUser ?? true;
      const viaVoice = options.viaVoice ?? false;
      const controller = new AbortController();
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      requestAbortRef.current = controller;
      lastRequestRef.current = trimmed;
      if (appendUser) {
        setMessages((items) => [
          ...items,
          { id: nextId.current++, role: 'user', text: trimmed, viaVoice },
        ]);
      }
      setSending(true);
      setCanStop(true);
      setError(null);
      setRetryMessage(null);
      setStopNote(false);
      setVoiceError(null);
      stopSpeakingPlayback();

      try {
        const response = await api.assistantChat(
          {
            message: trimmed,
            page_context:
              assistantSeed.pageContext || window.location.hash.replace(/^#/, '') || '/',
            document_id: assistantSeed.documentId,
            campaign_id: assistantSeed.campaignId,
            finding_id: assistantSeed.findingId,
          },
          controller.signal
        );
        if (requestIdRef.current !== requestId) return;
        setMessages((items) => [
          ...items,
          { id: nextId.current++, role: 'assistant', text: response.reply, response },
        ]);
        speakReply(response.reply);
      } catch (caught) {
        if (requestIdRef.current !== requestId) return;
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          setStopNote(true);
        } else {
          setError(
            caught instanceof ApiError
              ? caught.detail
              : 'The assistant could not answer this request. Check the connection and try again.'
          );
          setRetryMessage(trimmed);
        }
      } finally {
        if (requestIdRef.current !== requestId) return;
        requestAbortRef.current = null;
        setSending(false);
        setCanStop(false);
        if (!reduceMotion()) {
          window.setTimeout(() => inputRef.current?.focus(), 60);
        } else {
          inputRef.current?.focus();
        }
      }
    },
    [assistantSeed, speakReply, stopSpeakingPlayback]
  );

  const pushUserMessage = (text: string, viaVoice: boolean) => {
    setMessages((items) => [...items, { id: nextId.current++, role: 'user', text, viaVoice }]);
  };

  const stopVoiceCapture = useCallback(
    (discard: boolean) => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      clearVoiceTimers();
      cleanupCapture();
      if (discard) {
        discardRecognitionRef.current = true;
        voiceSessionRef.current += 1;
        try {
          recognition?.abort();
        } catch {
          // Recognition already stopped.
        }
        setVoicePhase('idle');
        setInterim('');
        setHeard('');
        return;
      }
      try {
        recognition?.stop();
      } catch {
        try {
          recognition?.abort();
        } catch {
          // Recognition already stopped.
        }
      }
      setVoicePhase('finishing');
    },
    [cleanupCapture, clearVoiceTimers]
  );

  const attachWaveform = useCallback(
    async (session: number) => {
      if (reduceMotion()) return;
      if (!microphoneAvailable()) return;
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (voiceSessionRef.current !== session || discardRecognitionRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const AudioContextCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const context = new AudioContextCtor();
        if (context.state === 'suspended') {
          await context.resume().catch(() => undefined);
        }
        if (
          voiceSessionRef.current !== session ||
          discardRecognitionRef.current ||
          context.state === 'closed'
        ) {
          stream.getTracks().forEach((track) => track.stop());
          void context.close().catch(() => undefined);
          return;
        }
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        streamRef.current = stream;
        audioContextRef.current = context;
        analyserRef.current = analyser;
        setWaveformActive(true);
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
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        // The recognizer can still work without the decorative live level meter.
      }
    },
    []
  );

  const startListening = () => {
    if (!openRef.current) return;
    if (voicePhase !== 'idle') return;
    if (sending || requestAbortRef.current) {
      setVoiceError('Wait for the current answer before using the microphone, or type below.');
      return;
    }
    const Recognizer = getSpeechRecognitionConstructor();
    if (!Recognizer) {
      setVoiceError('Voice input is not available in this browser. You can type your question below.');
      return;
    }
    if (!secureContext) {
      setVoiceError(
        'Voice input requires a secure connection. Open Inkloom over HTTPS or on localhost, or type your question below.'
      );
      return;
    }

    setVoiceError(null);
    setError(null);
    setStopNote(false);
    setInterim('');
    setHeard('');
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    discardRecognitionRef.current = false;
    recognitionErroredRef.current = false;
    voiceSubmittedRef.current = false;
    stopSpeakingPlayback();

    setVoicePhase('requesting');
    const session = voiceSessionRef.current + 1;
    voiceSessionRef.current = session;
    const isCurrent = () => voiceSessionRef.current === session;

    const recognition = new Recognizer();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let started = false;
    let finished = false;

    recognition.onstart = () => {
      if (!isCurrent()) return;
      started = true;
      clearVoiceTimers();
      setVoicePhase('listening');
      setVoiceError(null);
      maxTimerRef.current = window.setTimeout(() => {
        if (!isCurrent() || finished) return;
        stopVoiceCapture(false);
      }, RECOGNITION_MAX_DURATION_MS);
    };

    recognition.onresult = (event) => {
      if (!isCurrent()) return;
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
      interimTranscriptRef.current = interimText;
      setInterim(interimText);
      setHeard(finalTranscriptRef.current);
    };

    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      const code = event.error;
      if (code === 'aborted') return;
      finished = true;
      recognitionErroredRef.current = true;
      const message =
        VOICE_ERRORS[code] ??
        `Speech recognition stopped with the error “${code}”. Try again or type your question.`;
      if (message) setVoiceError(message);
      setVoicePhase('idle');
      setInterim('');
      setHeard('');
      recognitionRef.current = null;
      clearVoiceTimers();
      cleanupCapture();
    };

    recognition.onend = () => {
      if (!isCurrent() || finished) return;
      finished = true;
      recognitionRef.current = null;
      clearVoiceTimers();
      cleanupCapture();
      if (discardRecognitionRef.current || voiceSubmittedRef.current) {
        setVoicePhase('idle');
        return;
      }
      const transcript = (finalTranscriptRef.current || interimTranscriptRef.current).trim();
      setInterim('');
      if (recognitionErroredRef.current && !transcript) {
        setVoicePhase('idle');
        setHeard('');
        return;
      }
      if (!transcript) {
        setVoicePhase('idle');
        setHeard('');
        setVoiceError(
          'I did not catch any speech. Press the microphone and try again, or type your question.'
        );
        return;
      }
      voiceSubmittedRef.current = true;
      setHeard('');
      setVoicePhase('processing');
      commandHandlerRef.current(transcript, true);
    };

    try {
      // Start synchronously inside the click so the browser keeps the user activation
      // and owns the microphone before any other capture request is made.
      recognition.start();
    } catch {
      recognitionRef.current = null;
      voiceSessionRef.current += 1;
      setVoicePhase('idle');
      setVoiceError(
        'Speech recognition could not start. Close other apps using the microphone, then try again or type below.'
      );
      cleanupCapture();
      clearVoiceTimers();
      return;
    }

    startTimerRef.current = window.setTimeout(() => {
      if (!isCurrent() || started) return;
      finished = true;
      voiceSessionRef.current += 1;
      recognitionErroredRef.current = true;
      setVoicePhase('idle');
      setVoiceError(
        'Speech recognition did not start within a few seconds. Allow microphone access when your browser asks, then press the microphone to try again.'
      );
      recognitionRef.current = null;
      clearVoiceTimers();
      cleanupCapture();
      try {
        recognition.abort();
      } catch {
        // Recognition never started.
      }
    }, RECOGNITION_START_TIMEOUT_MS);

    void attachWaveform(session);
  };
  startListeningRef.current = startListening;

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending || requestAbortRef.current) return;
    if (voicePhase !== 'idle') stopVoiceCapture(true);
    setInput('');
    void requestAnswer(trimmed);
  };

  const stopGeneration = () => {
    requestAbortRef.current?.abort();
  };

  const retryLast = () => {
    const message = retryMessage || lastRequestRef.current;
    if (!message || sending) return;
    setError(null);
    setRetryMessage(null);
    setStopNote(false);
    void requestAnswer(message, { appendUser: false });
  };

  const openDocument = async (query: string): Promise<boolean> => {
    const cleaned = cleanSpeechQuery(query);
    if (cleaned.length < 2) return false;
    setSending(true);
    setCanStop(false);
    setError(null);
    try {
      const documents = await api.listDocuments({ search: cleaned, limit: 5 });
      if (documents.length === 0) {
        const reply = `I could not find a document matching “${cleaned}”. You can browse everything in Content.`;
        setMessages((items) => [
          ...items,
          {
            id: nextId.current++,
            role: 'assistant',
            text: reply,
            links: [{ label: 'Browse content', path: '/content' }],
          },
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
      setError(
        caught instanceof ApiError ? caught.detail : 'Document search is unavailable right now.'
      );
      return true;
    } finally {
      setSending(false);
    }
  };

  const handleVoiceCommand = async (text: string, viaVoice = true) => {
    const recognized = cleanSpeechQuery(text);
    if (!recognized) {
      setVoicePhase('idle');
      return;
    }
    setVoicePhase('processing');
    pushUserMessage(recognized, viaVoice);
    setHeard('');
    setInterim('');

    try {
      for (const command of ROUTE_COMMANDS) {
        if (!command.pattern.test(recognized.toLowerCase())) continue;
        const requirement = routeRequirement(parseRoute(command.path));
        if (requirement && !can(requirement)) {
          const reply = `Your current demo role cannot open ${command.label}. Switch roles or ask me something else.`;
          setMessages((items) => [
            ...items,
            { id: nextId.current++, role: 'assistant', text: reply },
          ]);
          speakReply(reply);
          return;
        }
        const reply = `Opening ${command.label}.`;
        setMessages((items) => [
          ...items,
          {
            id: nextId.current++,
            role: 'assistant',
            text: reply,
            links: [{ label: command.label, path: command.path }],
          },
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

      await requestAnswer(recognized, { appendUser: false, viaVoice: true });
    } finally {
      setVoicePhase('idle');
      if (!reduceMotion()) {
        window.setTimeout(() => inputRef.current?.focus(), 60);
      } else {
        inputRef.current?.focus();
      }
    }
  };
  commandHandlerRef.current = (text, viaVoice) => {
    void handleVoiceCommand(text, viaVoice);
  };

  const copyResponse = async (id: number, text: string) => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    const copied = await copyToClipboard(text);
    if (copied) {
      setCopiedId(id);
      setCopyErrorId(null);
    } else {
      setCopyErrorId(id);
      setCopiedId(null);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedId(null);
      setCopyErrorId(null);
      copyTimerRef.current = null;
    }, 2400);
  };

  const newConversation = () => {
    abortRequestSilently();
    stopVoiceCapture(true);
    stopSpeakingPlayback();
    setMessages([]);
    setInput('');
    setError(null);
    setRetryMessage(null);
    setStopNote(false);
    setVoiceError(null);
    setHeard('');
    setInterim('');
    lastRequestRef.current = '';
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleClose = () => {
    stopVoiceCapture(true);
    stopSpeakingPlayback();
    closeAssistant();
  };

  useEffect(() => {
    if (!assistantOpen) {
      openHandledRef.current = false;
      return;
    }
    if (openHandledRef.current) return;
    openHandledRef.current = true;

    const contextKey = `${assistantSeed.documentId || ''}|${assistantSeed.campaignId || ''}|${assistantSeed.findingId || ''}`;
    if (contextKey !== conversationKeyRef.current) {
      conversationKeyRef.current = contextKey;
      abortRequestSilently();
      setMessages([]);
      setError(null);
      setRetryMessage(null);
      setStopNote(false);
      setVoiceError(null);
      setHeard('');
      setInterim('');
      setInput(assistantSeed.prompt || '');
    } else if (assistantSeed.prompt) {
      setInput(assistantSeed.prompt);
    }
    if (assistantSeed.voice && speechSynthesisAvailable()) setSpeakReplies(true);
    setVoiceError(null);
    setStopNote(false);

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      if (assistantSeed.voice && getSpeechRecognitionConstructor()) {
        startListeningRef.current();
        micRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assistantOpen, assistantSeed, abortRequestSilently]);

  useEffect(() => {
    if (!assistantOpen) {
      cleanupCapture();
      clearVoiceTimers();
      stopSpeakingPlayback();
      voiceSessionRef.current += 1;
      try {
        recognitionRef.current?.abort();
      } catch {
        // Recognition already stopped.
      }
      recognitionRef.current = null;
      setVoicePhase('idle');
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
  }, [assistantOpen, cleanupCapture, clearVoiceTimers, stopSpeakingPlayback]);

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
    if (!assistantOpen) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduceMotion() ? 'auto' : 'smooth',
    });
  }, [messages, sending, assistantOpen, voiceError, stopNote]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      voiceSessionRef.current += 1;
      discardRecognitionRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {
        // Recognition already stopped.
      }
      recognitionRef.current = null;
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      cleanupCapture();
      clearVoiceTimers();
      stopSpeaking();
    },
    [cleanupCapture, clearVoiceTimers]
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
  const requesting = voicePhase === 'requesting';
  const finishing = voicePhase === 'finishing';
  const voiceProcessing = voicePhase === 'processing';
  const micDisabled = sending || finishing || voiceProcessing;

  const orbState: AssistantOrbState = listening
    ? 'listening'
    : requesting || finishing || voiceProcessing || sending
      ? 'processing'
      : speaking
        ? 'speaking'
        : responding
          ? 'responding'
          : stopNote
            ? 'stopped'
            : error || voiceError
              ? 'error'
              : 'idle';

  const voiceStatus = !recognitionSupported
    ? 'Speech recognition is not available in this browser. Type your question below.'
    : !secureContext
      ? 'Voice input needs an HTTPS connection. Type your question below.'
      : requesting
        ? 'Requesting microphone access… grant permission if your browser asks.'
        : listening
          ? 'Listening now. Speak, then press the stop button.'
          : finishing
            ? 'Finishing the recognition session…'
            : voiceProcessing
              ? 'Processing your speech…'
              : speaking
                ? 'Reading the answer aloud. Press stop to silence it.'
                : sending
                  ? 'Waiting for the assistant’s answer…'
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
        <div className="flex items-start justify-between gap-2 border-b border-[var(--line)] px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <AssistantOrb
              state={orbState}
              size={42}
              className="mt-0.5"
              label={`Inkloom AI orb — ${ORB_STATE_LABEL[orbState]}`}
            />
            <div className="min-w-0">
              <h2 id="assistant-title" className="font-display text-sm font-bold text-ink-900">
                Inkloom AI
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-ink-500">
                Grounded in workspace records. Not a legal opinion.
              </p>
              {!recognitionSupported ? (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                  Voice input unavailable — type instead
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={newConversation}
              aria-label="Start a new conversation"
              title="New conversation"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
            </button>
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
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="border-b border-[var(--line)] bg-gradient-to-r from-brand-50/70 via-white to-aqua-50/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              ref={micRef}
              type="button"
              onClick={() => {
                if (listening) stopVoiceCapture(false);
                else if (requesting) stopVoiceCapture(true);
                else startListening();
              }}
              disabled={micDisabled}
              aria-pressed={listening || requesting}
              aria-label={
                listening
                  ? 'Stop voice input and use what was heard'
                  : requesting
                    ? 'Cancel starting voice input'
                    : 'Start voice input'
              }
              className={cn(
                'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-glow-brand transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
                listening
                  ? 'bg-gradient-to-br from-rose-500 to-rose-600'
                  : requesting
                    ? 'bg-gradient-to-br from-brand-500 to-violet-500'
                    : 'bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 hover:from-brand-700 hover:to-violet-600'
              )}
            >
              {listening ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : requesting || voiceProcessing || finishing ? (
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
                {listening
                  ? 'Listening'
                  : requesting
                    ? 'Starting microphone'
                    : finishing
                      ? 'Finishing'
                      : voiceProcessing
                        ? 'Processing speech'
                        : speaking
                          ? 'Reading aloud'
                          : 'Voice input'}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-ink-500" aria-live="polite">
                {voiceStatus}
              </p>
            </div>

            {listening && waveformActive ? (
              <div className="hidden h-10 shrink-0 items-end gap-[3px] sm:flex" aria-hidden>
                {levels.map((level, index) => (
                  <span
                    key={index}
                    className="w-[3px] rounded-full bg-gradient-to-t from-brand-500 to-aqua-400 transition-[height] duration-100"
                    style={{ height: `${6 + level * 26}px` }}
                  />
                ))}
              </div>
            ) : null}

            {speaking || responding ? (
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

          {heard || interim ? (
            <div className="mt-2.5 rounded-lg border border-[var(--line)] bg-white/80 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                Recognized speech
              </p>
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
              {recognitionSupported && secureContext && !sending ? (
                <button
                  type="button"
                  onClick={startListening}
                  className="shrink-0 rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  Try again
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                className="shrink-0 rounded text-amber-700 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                aria-label="Dismiss voice message"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 border-b border-[var(--line)] bg-ink-50/60 px-4 py-2">
          <BookOpenCheck className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
          <p className="truncate text-[11px] text-ink-500">{contextLabel}</p>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="flex gap-2.5">
            <AssistantOrb state="idle" size={28} className="mt-0.5" />
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
            const tone = response ? verificationTone(response) : null;
            const copied = copiedId === message.id;
            const copyFailed = copyErrorId === message.id;
            return (
              <div key={message.id} className="flex gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </div>
                <div className="min-w-0 max-w-[90%] space-y-2.5">
                  <div className="rounded-xl rounded-tl-sm border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm leading-6 text-ink-700 shadow-subtle">
                    <MarkdownMessage text={message.text} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-ink-400">
                    <button
                      type="button"
                      onClick={() => void copyResponse(message.id, message.text)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                        copied
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : copyFailed
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-[var(--line)] bg-white text-ink-500 hover:border-brand-200 hover:text-brand-700'
                      )}
                      aria-label={copied ? 'Response copied' : 'Copy response'}
                    >
                      {copied ? (
                        <Check className="h-3 w-3" aria-hidden />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden />
                      )}
                      <span aria-live="polite">{copied ? 'Copied' : copyFailed ? 'Copy failed' : 'Copy'}</span>
                    </button>
                    {response ? (
                      <span
                        title={
                          response.mode === 'grounded_llm'
                            ? 'A server-side AI provider rephrased the verified record-based answer.'
                            : 'The answer was assembled by the rules engine from stored workspace records.'
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold',
                          response.mode === 'grounded_llm'
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-slate-200 bg-slate-50 text-ink-500'
                        )}
                      >
                        {response.mode === 'grounded_llm'
                          ? `AI wording${response.provider ? ` · ${response.provider}` : ''}`
                          : 'Records engine'}
                      </span>
                    ) : null}
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

                  {response && tone ? (
                    <>
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

                      {response.ai_error ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                          <span>
                            <strong className="font-semibold">AI wording unavailable.</strong>{' '}
                            {response.ai_error} The verified record-based answer above is shown instead.
                          </span>
                        </div>
                      ) : null}

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
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}

          {sending ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500" aria-live="polite">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              </div>
              <span className="min-w-0 flex-1">Checking stored workspace records…</span>
              {canStop ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white px-2 py-1 text-[11px] font-semibold text-ink-700 transition-colors hover:border-rose-200 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  <Square className="h-3 w-3" aria-hidden />
                  Stop generation
                </button>
              ) : null}
            </div>
          ) : null}

          {stopNote ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-ink-700"
            >
              <span className="min-w-0 flex-1">Generation stopped. No answer was added.</span>
              {lastRequestRef.current ? (
                <button
                  type="button"
                  onClick={retryLast}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700 hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="flex flex-wrap items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"
            >
              <span className="min-w-0 flex-1">{error}</span>
              {retryMessage ? (
                <button
                  type="button"
                  onClick={retryLast}
                  disabled={sending}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-60"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setRetryMessage(null);
                }}
                className="shrink-0 rounded text-rose-600 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                aria-label="Dismiss error"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
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
              <span className="hidden text-[10px] text-ink-400 sm:inline">
                Enter to send · Shift + Enter for a new line
              </span>
              <Button
                size="sm"
                onClick={() => void send(input)}
                disabled={!input.trim() || sending}
                aria-label="Send message"
              >
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
              records. The assistant can open records but cannot approve, publish, or delete content.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
