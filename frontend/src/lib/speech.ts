export interface SpeechAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternativeLike;
}

export interface SpeechResultListLike {
  length: number;
  [index: number]: SpeechResultLike;
}

export interface SpeechResultEventLike extends Event {
  resultIndex: number;
  results: SpeechResultListLike;
}

export interface SpeechErrorEventLike extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const scoped = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition ?? null;
}

export function speechSynthesisAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

export function microphoneAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function plainSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export function speakText(
  text: string,
  options: { onStart?: () => void; onEnd?: () => void; onError?: () => void } = {}
): boolean {
  if (!speechSynthesisAvailable()) {
    options.onError?.();
    return false;
  }
  const phrase = plainSpeech(text);
  if (!phrase) {
    options.onError?.();
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = 'en-US';
  utterance.rate = 1.02;
  utterance.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((voice) => voice.lang === 'en-US' && /Google|Samantha|Aria|Jenny/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.startsWith('en'));
  if (preferred) utterance.voice = preferred;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if (!speechSynthesisAvailable()) return;
  window.speechSynthesis.cancel();
}
