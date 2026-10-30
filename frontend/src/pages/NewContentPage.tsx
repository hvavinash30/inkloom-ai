import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileImage,
  FileText,
  Film,
  Loader2,
  RefreshCw,
  RotateCcw,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate } from '../lib/router';
import { useAsync } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
  Field,
  InfoCallout,
  Input,
  PageHeader,
  Select,
  Textarea,
  cn,
} from '../components/ui';
import {
  CONTENT_TYPE_LABEL,
  formatFileSize,
  formatSeconds,
  parseTranscript,
} from '../lib/format';
import type { ContentType, UploadRecord, VideoState } from '../types';

type Mode = 'text' | 'pdf' | 'image' | 'video';

type FieldErrors = Partial<Record<'title' | 'content' | 'file' | 'transcript' | 'source', string>>;

const FIRST_INVALID_ID: Record<keyof FieldErrors, string> = {
  title: 'content-title',
  content: 'content-text',
  file: 'content-upload',
  transcript: 'video-transcript',
  source: 'content-source',
};

const MODES: { id: Mode; label: string; description: string; icon: typeof FileText }[] = [
  {
    id: 'text',
    label: 'Text',
    description: 'Paste copy, a script, or a social post.',
    icon: FileText,
  },
  {
    id: 'pdf',
    label: 'PDF',
    description: 'Real page extraction with page-linked findings.',
    icon: FileText,
  },
  {
    id: 'image',
    label: 'Image',
    description: 'OCR reads the text; visual checks stay manual.',
    icon: FileImage,
  },
  {
    id: 'video',
    label: 'Video',
    description: 'Automatic speech and on-screen text checks. Transcript optional.',
    icon: Film,
  },
];

const ACCEPT_BY_MODE: Record<Exclude<Mode, 'text'>, string> = {
  pdf: '.pdf,application/pdf',
  image: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
  video: '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime',
};

const DEFAULT_TYPE: Record<Mode, ContentType> = {
  text: 'social_media',
  pdf: 'product_copy',
  image: 'ad_copy',
  video: 'video_script',
};

const PAGE_DELIMITER = /^\s*(?:-{2,}\s*)?page\s+\d+\s*(?:-{2,})?\s*$/i;

function splitPastedPages(raw: string): string[] {
  const byFormFeed = raw.split('\f').map((page) => page.trim()).filter(Boolean);
  if (byFormFeed.length > 1) return byFormFeed;

  const pages: string[][] = [[]];
  let foundDelimiter = false;
  for (const line of raw.split(/\r?\n/)) {
    if (PAGE_DELIMITER.test(line)) {
      foundDelimiter = true;
      if (pages[pages.length - 1].some((entry) => entry.trim())) pages.push([]);
      continue;
    }
    pages[pages.length - 1].push(line);
  }
  if (!foundDelimiter) return byFormFeed;
  return pages.map((page) => page.join('\n').trim()).filter(Boolean);
}

const VIDEO_STATUS: Record<string, { label: string; tone: string }> = {
  not_started: { label: 'Not started', tone: 'border-white/10 bg-white/[0.06] text-slate-300' },
  queued: { label: 'Queued', tone: 'border-sky-400/25 bg-sky-400/10 text-sky-200' },
  processing: { label: 'Processing', tone: 'border-sky-400/25 bg-sky-400/10 text-sky-200' },
  completed: { label: 'Complete', tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' },
  partial: { label: 'Partial results', tone: 'border-amber-400/25 bg-amber-400/10 text-amber-200' },
  no_content: { label: 'No text found', tone: 'border-white/10 bg-white/[0.06] text-slate-300' },
  failed: { label: 'Failed', tone: 'border-rose-400/25 bg-rose-500/10 text-rose-200' },
  canceled: { label: 'Canceled', tone: 'border-white/10 bg-white/[0.06] text-slate-300' },
};

const STAGE_LABEL: Record<string, string> = {
  speech: 'Speech to text',
  visual: 'On-screen text (OCR)',
};

const STAGE_STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  running: 'Running',
  completed: 'Complete',
  skipped: 'Skipped',
  unavailable: 'Unavailable',
  failed: 'Failed',
  no_audio: 'No audio track',
  no_speech: 'No speech detected',
};

function isVideoActive(video: VideoState | null | undefined): boolean {
  return video?.status === 'queued' || video?.status === 'processing';
}

function VideoAnalysisPanel({
  video,
  busy,
  pollError,
  onRetry,
  onCancel,
  onRefresh,
}: {
  video: VideoState;
  busy: boolean;
  pollError: string | null;
  onRetry: (rerunSpeech: boolean) => void;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  const meta = VIDEO_STATUS[video.status] || {
    label: video.status.replace(/_/g, ' '),
    tone: 'border-white/10 bg-white/[0.06] text-slate-300',
  };
  const active = isVideoActive(video);
  const transcriptComplete = video.transcript.status === 'completed';
  const canReprocess =
    video.can_retry && ['failed', 'partial', 'no_content', 'canceled'].includes(video.status);
  const stages = (['speech', 'visual'] as const).map((name) => ({
    name,
    stage: video.stages?.[name],
  }));

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <Film className="h-3.5 w-3.5 text-slate-400" />
          Automatic video analysis
        </p>
        <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium', meta.tone)}>
          {active ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {meta.label}
          {video.attempt > 0 ? ` · attempt ${video.attempt}` : ''}
        </span>
      </div>

      {video.duration_seconds ? (
        <p className="mt-1 text-[10px] text-slate-400">
          {formatSeconds(video.duration_seconds)} ·{' '}
          {video.audio_present === false ? 'no audio track' : video.audio_present ? 'audio track present' : 'audio not checked'}
          {video.frame_count ? ` · ${video.frames_read}/${video.frame_count} frames read` : ''}
        </p>
      ) : null}

      <p className="mt-1.5 text-[11px] leading-5 text-slate-300">{video.message}</p>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {stages.map(({ name, stage }) => {
          const status = stage?.status || 'pending';
          const done = status === 'completed';
          const failed = status === 'failed';
          return (
            <div
              key={name}
              className={cn(
                'rounded-lg border px-2.5 py-2',
                done
                  ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
                  : failed
                    ? 'border-rose-400/20 bg-rose-500/[0.06]'
                    : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
                {done ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                ) : failed ? (
                  <XCircle className="h-3 w-3 text-rose-300" />
                ) : status === 'running' || status === 'pending' ? (
                  <Loader2 className={cn('h-3 w-3 text-sky-300', status === 'running' && 'animate-spin')} />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-300" />
                )}
                {STAGE_LABEL[name]} · {STAGE_STATUS_LABEL[status] || status.replace(/_/g, ' ')}
              </p>
              {stage?.message ? (
                <p className="mt-1 text-[10px] leading-4 text-slate-400">{stage.message}</p>
              ) : null}
              {done && name === 'speech' && video.transcript.segment_count > 0 ? (
                <p className="mt-1 text-[10px] text-slate-400">
                  {video.transcript.segment_count} timestamped segment
                  {video.transcript.segment_count === 1 ? '' : 's'} from{' '}
                  {video.transcript.provider || 'the provider'}
                  {video.transcript.model ? ` (${video.transcript.model})` : ''}
                </p>
              ) : null}
              {done && name === 'visual' && video.frames.length > 0 ? (
                <p className="mt-1 text-[10px] text-slate-400">
                  {video.frames.filter((frame) => frame.text).length} frame
                  {video.frames.filter((frame) => frame.text).length === 1 ? '' : 's'} with readable text
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {!video.config.ffmpeg.available ? (
        <p className="mt-2 rounded-md border border-rose-400/20 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-4 text-rose-200">
          {video.config.ffmpeg.message}
        </p>
      ) : null}
      {!video.config.transcription_configured ? (
        <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-4 text-amber-100">
          Speech-to-text is not configured on this server. {video.config.transcription_reason} Add a manual
          transcript below to check spoken content.
        </p>
      ) : null}
      {!video.config.ocr_available ? (
        <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1.5 text-[10px] leading-4 text-amber-100">
          On-screen text cannot be read on this server. {video.config.ocr_reason}
        </p>
      ) : null}

      {pollError ? (
        <p role="alert" className="mt-2 text-[10px] leading-4 text-amber-200">
          {pollError}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {video.can_cancel ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel analysis
          </Button>
        ) : null}
        {canReprocess ? (
          <Button variant="secondary" size="sm" loading={busy} onClick={() => onRetry(false)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Retry analysis
          </Button>
        ) : null}
        {transcriptComplete && video.can_retry ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRetry(true)}
            className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
          >
            Re-transcribe speech (calls the provider again)
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-300 hover:underline"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh status
        </button>
      </div>
    </div>
  );
}

export function NewContentPage() {
  const { can, session } = useSession();
  const { toast } = useToast();
  const health = useAsync(() => api.getHealth(), []);
  const campaigns = useAsync(() => api.listCampaigns(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('text');
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState<ContentType>('social_media');
  const [campaignId, setCampaignId] = useState('');
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoPollError, setVideoPollError] = useState<string | null>(null);
  const [pdfFallback, setPdfFallback] = useState('');
  const [showFallback, setShowFallback] = useState(false);
  const [saveDraft, setSaveDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const errorRef = useRef<HTMLParagraphElement>(null);

  const limits = health.data?.limits;
  const segments = useMemo(() => parseTranscript(transcript), [transcript]);
  const fallbackPages = useMemo(() => splitPastedPages(pdfFallback), [pdfFallback]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setContentType(DEFAULT_TYPE[next]);
    setFile(null);
    setUpload(null);
    setUploadError(null);
    setError(null);
    setFieldErrors({});
    setPdfFallback('');
    setTranscript('');
    setTranscriptOpen(false);
    setVideoBusy(false);
    setVideoPollError(null);
    setShowFallback(false);
  };

  const accept = mode === 'text' ? undefined : ACCEPT_BY_MODE[mode];

  const handleFile = async (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setUpload(null);
    setUploadError(null);
    setVideoPollError(null);
    clearFieldError('file');
    setUploading(true);
    if (!title.trim()) {
      setTitle(selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
    }
    try {
      const kind = mode === 'text' ? undefined : mode;
      const record = await api.uploadFile(selected, kind);
      setUpload(record);
      if (mode === 'video') {
        const active = record.video?.status === 'queued' || record.video?.status === 'processing';
        toast(
          active
            ? 'Video stored. Automatic speech and on-screen text analysis is queued; this page reports the real stage status.'
            : 'Video stored. Check the analysis status below before running the audit.',
          'info'
        );
      } else if (record.extraction_status === 'processed') {
        toast('File uploaded and text extracted. Review the extraction note below.', 'success');
      } else {
        toast('File uploaded. This format has an inspection boundary shown below.', 'info');
      }
    } catch (caught) {
      setUploadError(caught instanceof ApiError ? caught.detail : 'The file could not be uploaded.');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setUpload(null);
    setUploadError(null);
    setShowFallback(false);
    setVideoPollError(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const refreshVideo = async () => {
    if (!upload) return;
    setVideoPollError(null);
    try {
      const fresh = await api.getUpload(upload.id);
      setUpload(fresh);
    } catch (caught) {
      setVideoPollError(
        caught instanceof ApiError ? caught.detail : 'The processing status could not be refreshed.'
      );
    }
  };

  const retryVideo = async (rerunSpeech: boolean) => {
    if (!upload || videoBusy) return;
    setVideoBusy(true);
    setVideoPollError(null);
    try {
      const fresh = await api.retryVideoAnalysis(upload.id, rerunSpeech);
      setUpload(fresh);
      toast(
        rerunSpeech
          ? 'Speech transcription was re-queued and will call the configured provider again.'
          : 'Video analysis was re-queued. Completed stages are reused where possible.',
        'info'
      );
    } catch (caught) {
      setVideoPollError(
        caught instanceof ApiError ? caught.detail : 'Video analysis could not be re-queued.'
      );
    } finally {
      setVideoBusy(false);
    }
  };

  const cancelVideo = async () => {
    if (!upload || videoBusy) return;
    setVideoBusy(true);
    setVideoPollError(null);
    try {
      const fresh = await api.cancelVideoAnalysis(upload.id);
      setUpload(fresh);
      toast('Cancellation requested. The job stops after its current step.', 'info');
    } catch (caught) {
      setVideoPollError(
        caught instanceof ApiError ? caught.detail : 'The processing job could not be canceled.'
      );
    } finally {
      setVideoBusy(false);
    }
  };

  useEffect(() => {
    const video = upload?.video;
    if (!upload || mode !== 'video' || !isVideoActive(video)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const fresh = await api.getUpload(upload.id);
        if (!cancelled) {
          setUpload(fresh);
          setVideoPollError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setVideoPollError(
            caught instanceof ApiError
              ? caught.detail
              : 'Automatic status updates stopped. Use Refresh status to check again.'
          );
        }
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [upload, mode]);

  const showError = (message: string) => {
    setError(message);
    window.requestAnimationFrame(() => errorRef.current?.focus());
  };

  const clearFieldError = (key: keyof FieldErrors) => {
    setFieldErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (title.trim().length < 2) errors.title = 'Add a title with at least two characters.';
    if (mode === 'text' && text.trim().split(/\s+/).filter(Boolean).length < 3) {
      errors.content = 'Enter at least a few words of content.';
    }
    if (mode === 'pdf' && !upload && fallbackPages.length === 0) {
      errors.file = 'Upload a PDF or paste at least one page of extracted text.';
    }
    if (mode === 'image' && !upload) {
      errors.file = 'Upload an image to store it for review.';
    }
    if (mode === 'video' && !upload && !transcript.trim()) {
      errors.transcript =
        'Upload a video for automatic analysis, or paste a transcript for a transcript-only check.';
    } else if (mode === 'video' && upload && !saveDraft && isVideoActive(upload.video)) {
      errors.file =
        'Automatic video analysis is still running. Wait for it to finish, or cancel it before running the audit.';
    }
    if (sourceUrl.trim() && !/^https?:\/\//i.test(sourceUrl.trim())) {
      errors.source = 'Source URLs must start with http:// or https://.';
    }
    return errors;
  };

  const focusFirstInvalid = (errors: FieldErrors) => {
    const firstKey = (Object.keys(FIRST_INVALID_ID) as (keyof FieldErrors)[]).find(
      (key) => errors[key]
    );
    if (!firstKey) return;
    window.requestAnimationFrame(() => {
      window.document.getElementById(FIRST_INVALID_ID[firstKey])?.focus();
    });
  };

  const submit = async (draft: boolean) => {
    setError(null);
    const validation = validate();
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      if (validation.transcript) setTranscriptOpen(true);
      focusFirstInvalid(validation);
      return;
    }
    setFieldErrors({});
    if (uploading || submitting) return;
    setSubmitting(true);
    try {
      const segmentsToSend =
        mode === 'video' && segments.length > 0
          ? segments.map((segment) => ({
              timestamp_seconds: segment.timestamp_seconds,
              text: segment.text,
            }))
          : undefined;

      const document = await api.submitAndAudit({
        title: title.trim(),
        content_type: contentType,
        content_text:
          mode === 'text'
            ? text
            : mode === 'video'
              ? transcript || ''
              : fallbackPages.length
                ? fallbackPages.join('\n\f\n')
                : '',
        asset_type: mode,
        campaign_id: campaignId || null,
        upload_id: upload?.id || null,
        source_url: sourceUrl.trim() || null,
        page_texts: mode === 'pdf' && fallbackPages.length ? fallbackPages : undefined,
        transcript_segments: segmentsToSend,
        save_as_draft: draft,
      });
      toast(
        draft ? 'Draft saved. Run a check when the content is ready.' : 'Content created and checked.',
        'success'
      );
      navigate(`/content/${document.id}`);
    } catch (caught) {
      showError(caught instanceof ApiError ? caught.detail : 'The content could not be created.');
    } finally {
      setSubmitting(false);
    }
  };

  const videoProcessing = mode === 'video' && isVideoActive(upload?.video);
  const runLabel =
    mode === 'video'
      ? upload
        ? 'Run video audit'
        : 'Run transcript check'
      : 'Run check';
  const transcriptionConfigured =
    health.data?.transcription?.configured ?? health.data?.integrations.transcription_configured;

  return (
    <div>
      <PageHeader
        backTo="/content"
        backLabel="Content"
        title="New content check"
        description="Start with text, a PDF, an image, or a video. Checks are deterministic and compare only against active workspace rules and approved facts."
      />

      {health.error ? (
        <div className="mb-5">
          <InfoCallout tone="warning" title="Workspace limits could not be loaded">
            Upload limits and integration status may be unavailable, but the server still enforces them.{' '}
            {health.error}{' '}
            <button
              type="button"
              onClick={health.reload}
              className="font-medium text-amber-200 underline underline-offset-2"
            >
              Retry
            </button>
          </InfoCallout>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-4">
            <p className="text-xs font-semibold text-slate-100">1. Choose a content format</p>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => switchMode(item.id)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      active
                        ? 'border-brand-400/40 bg-brand-500/10'
                        : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg',
                        active ? 'bg-brand-600 text-white' : 'bg-white/[0.06] text-slate-400'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="mt-2 block text-xs font-semibold text-slate-200">{item.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-400">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-100">2. Describe the content</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="Title"
                htmlFor="content-title"
                required
                error={fieldErrors.title}
                className="sm:col-span-2"
              >
                <Input
                  id="content-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    clearFieldError('title');
                  }}
                  placeholder="e.g. Q4 launch LinkedIn post"
                  maxLength={255}
                  aria-required="true"
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={fieldErrors.title ? 'content-title-error' : undefined}
                />
              </Field>
              <Field label="Content type" htmlFor="content-type">
                <Select
                  id="content-type"
                  value={contentType}
                  onChange={(event) => setContentType(event.target.value as ContentType)}
                >
                  {(Object.keys(CONTENT_TYPE_LABEL) as ContentType[]).map((key) => (
                    <option key={key} value={key}>
                      {CONTENT_TYPE_LABEL[key]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Campaign (optional)"
                htmlFor="content-campaign"
                hint={
                  campaigns.error ? (
                    <span role="alert" className="text-amber-300">
                      Campaigns could not be loaded. You can still create content without one.{' '}
                      <button
                        type="button"
                        onClick={campaigns.reload}
                        className="font-medium underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </span>
                  ) : (
                    'Linking assets lets Inkloom compare claims across the campaign.'
                  )
                }
              >
                <Select
                  id="content-campaign"
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                >
                  <option value="">No campaign</option>
                  {(campaigns.data || []).map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-100">3. Add the content</p>

            {mode === 'text' ? (
              <div className="mt-3">
                <Field
                  label="Content text"
                  htmlFor="content-text"
                  required
                  error={fieldErrors.content}
                  hint={`${text.trim() ? text.trim().split(/\s+/).length : 0} words · Checks are rule and fact matching, not a grammar score.`}
                >
                  <Textarea
                    id="content-text"
                    rows={12}
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      clearFieldError('content');
                    }}
                    placeholder="Paste the copy you want to check…"
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors.content)}
                    aria-describedby={fieldErrors.content ? 'content-text-error' : undefined}
                  />
                </Field>
                <div className="mt-3">
                  <Field
                    label="Source URL (optional)"
                    htmlFor="content-source"
                    error={fieldErrors.source}
                    hint="Only add a link you can vouch for."
                  >
                    <Input
                      id="content-source"
                      value={sourceUrl}
                      onChange={(event) => {
                        setSourceUrl(event.target.value);
                        clearFieldError('source');
                      }}
                      placeholder="https://…"
                      inputMode="url"
                      aria-invalid={Boolean(fieldErrors.source)}
                      aria-describedby={fieldErrors.source ? 'content-source-error' : undefined}
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={accept}
                    className="sr-only"
                    onChange={(event) => void handleFile(event.target.files?.[0] || null)}
                    aria-label={`Upload ${mode} file`}
                  />
                  <div
                    id="content-upload"
                    tabIndex={-1}
                    aria-describedby={
                      fieldErrors.file
                        ? 'content-file-error'
                        : uploadError
                          ? 'content-upload-error'
                          : undefined
                    }
                    className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                  >
                    {!file ? (
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        aria-describedby={
                          fieldErrors.file
                            ? 'content-file-error'
                            : uploadError
                              ? 'content-upload-error'
                              : undefined
                        }
                        className={cn(
                          'flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-white/[0.035] px-5 py-9 text-center transition-colors hover:bg-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                          fieldErrors.file
                            ? 'border-rose-400/35 hover:border-rose-400'
                            : 'border-white/15 hover:border-brand-400/40'
                        )}
                      >
                        <UploadCloud className="h-6 w-6 text-slate-400" />
                        <span className="mt-2 text-sm font-medium text-slate-300">
                          Choose a {mode === 'pdf' ? 'PDF' : mode === 'image' ? 'PNG, JPEG, or WebP image' : 'MP4, WebM, or MOV video'}
                        </span>
                        <span className="mt-1 text-[11px] text-slate-400">
                          {limits
                            ? mode === 'pdf'
                              ? `${limits.max_pdf_pages} page limit · ${limits.max_upload_mb} MB maximum`
                              : `${mode === 'video' ? limits.max_video_upload_mb : limits.max_upload_mb} MB maximum`
                            : 'Upload limits are reported by the server.'}
                        </span>
                      </button>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-slate-400 shadow-subtle">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-200">{file.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {formatFileSize(file.size)}
                              {upload ? ` · stored as ${upload.kind}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={clearFile}
                            disabled={uploading}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-slate-300"
                            aria-label="Remove selected file"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {upload ? (
                          mode === 'video' && upload.video ? (
                            <div className="mt-2.5">
                              <VideoAnalysisPanel
                                video={upload.video}
                                busy={videoBusy}
                                pollError={videoPollError}
                                onRetry={(rerunSpeech) => void retryVideo(rerunSpeech)}
                                onCancel={() => void cancelVideo()}
                                onRefresh={() => void refreshVideo()}
                              />
                            </div>
                          ) : (
                            <div className="mt-2.5 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 text-[11px] leading-5 text-slate-300">
                              <p className="flex items-center gap-1.5 font-medium text-slate-300">
                                {upload.extraction_status === 'processed' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                                )}
                                Extraction status: {upload.extraction_status.replace(/_/g, ' ')}
                                {upload.page_count ? ` · ${upload.page_count} pages` : ''}
                              </p>
                              <p className="mt-1 text-slate-400">{upload.extraction_message}</p>
                            </div>
                          )
                        ) : null}

                      </div>
                    )}
                  </div>
                  {uploadError ? (
                    <p
                      id="content-upload-error"
                      role="alert"
                      className="mt-2 rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300"
                    >
                      {uploadError}
                    </p>
                  ) : null}
                  {fieldErrors.file ? (
                    <p
                      id="content-file-error"
                      role="alert"
                      className="mt-2 text-xs leading-5 text-rose-300"
                    >
                      {fieldErrors.file}
                    </p>
                  ) : null}
                </div>

                {mode === 'pdf' ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowFallback((value) => !value)}
                      className="text-[11px] font-medium text-brand-300 hover:underline"
                    >
                      {showFallback ? 'Hide manual page text' : 'No extractable text? Add page text manually'}
                    </button>
                    {showFallback ? (
                      <div className="mt-2">
                        <Field
                          label="Page text"
                          htmlFor="pdf-fallback"
                          hint={
                            fallbackPages.length
                              ? `${fallbackPages.length} page${fallbackPages.length === 1 ? '' : 's'} detected. Separate pages with a form-feed line (paste from the PDF) or a line such as “Page 2”.`
                              : 'Paste text copied from the PDF. This is not OCR; you are supplying the text yourself.'
                          }
                        >
                          <Textarea
                            id="pdf-fallback"
                            rows={7}
                            value={pdfFallback}
                            onChange={(event) => {
                              setPdfFallback(event.target.value);
                              if (event.target.value.trim()) clearFieldError('file');
                            }}
                            placeholder="Page 1 text…"
                          />
                        </Field>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {mode === 'image' ? (
                  <InfoCallout
                    tone={health.data?.integrations.ocr_configured ? 'neutral' : 'warning'}
                    title={
                      health.data?.integrations.ocr_configured
                        ? 'Text in the image is read locally with OCR'
                        : 'OCR is not available on this server'
                    }
                  >
                    {health.data?.integrations.ocr_configured
                      ? 'On submit, text in this image is extracted on the server and checked against your active brand rules and approved facts. Contrast, logo usage, layout, and other visual qualities still require a human reviewer. If the text cannot be read, the check records that limitation instead of inventing a result.'
                      : 'The image is stored and can be previewed with your role permissions, but automated text-in-image checks cannot run. The check will record a processing limitation instead of inventing a result.'}
                  </InfoCallout>
                ) : null}

                {mode === 'video' ? (
                  <div className="space-y-3">
                    {upload ? (
                      <p className="text-[11px] leading-5 text-slate-400">
                        No transcript is required. The stored video&apos;s audio is transcribed and sampled frames are
                        read for on-screen text on the server, then the existing rules and approved facts are applied.
                        Once analysis finishes, run the audit; findings keep their spoken or on-screen source and real
                        timestamps.
                      </p>
                    ) : (
                      <p className="text-[11px] leading-5 text-slate-400">
                        Upload a video above for automatic speech and on-screen text analysis, or use a transcript for
                        a transcript-only check without storing a video.
                      </p>
                    )}

                    {fieldErrors.transcript ? (
                      <p
                        id="video-transcript-error"
                        role="alert"
                        className="rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300"
                      >
                        {fieldErrors.transcript}
                      </p>
                    ) : null}

                    <div>
                      <button
                        type="button"
                        onClick={() => setTranscriptOpen((value) => !value)}
                        aria-expanded={transcriptOpen}
                        aria-controls="video-transcript-panel"
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-300 hover:underline"
                      >
                        {transcriptOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {upload ? 'Add a manual transcript (optional)' : 'Use a transcript instead of a video'}
                        {transcript.trim() ? ' · transcript attached' : ''}
                      </button>

                      {transcriptOpen ? (
                        <div id="video-transcript-panel" className="mt-2 space-y-3">
                          <Field
                            label="Manual transcript"
                            htmlFor="video-transcript"
                            hint="Paste plain text, [mm:ss] lines, SRT, or VTT. A manual transcript takes precedence over automatic speech-to-text for checks; explicit timestamps stay linked to findings."
                          >
                            <Textarea
                              id="video-transcript"
                              rows={10}
                              value={transcript}
                              onChange={(event) => {
                                setTranscript(event.target.value);
                                clearFieldError('transcript');
                              }}
                              placeholder={'[00:18] Welcome to the Q4 launch…\n[00:42] Our platform delivers 100% uptime…'}
                            />
                          </Field>
                          {segments.length > 0 ? (
                            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                              <p className="text-[11px] font-medium text-slate-300">
                                {segments.length} timestamped segment{segments.length === 1 ? '' : 's'} parsed
                              </p>
                              <div className="mt-1.5 max-h-28 space-y-1 overflow-y-auto pr-1">
                                {segments.slice(0, 6).map((segment, index) => (
                                  <p key={`${segment.timestamp_seconds}-${index}`} className="flex gap-2 text-[11px] text-slate-400">
                                    <span className="shrink-0 font-mono text-slate-400">{formatSeconds(segment.timestamp_seconds)}</span>
                                    <span className="min-w-0 truncate">{segment.text}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : transcript.trim() ? (
                            <InfoCallout tone="neutral">
                              No timestamps detected. Checks will treat this as plain transcript text; findings will not
                              have timestamp or playback links.
                            </InfoCallout>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {upload?.video && videoBusy ? (
                      <p className="text-[11px] text-slate-400">Updating the video job…</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={saveDraft}
                  onChange={(event) => setSaveDraft(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/15 text-brand-300 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-xs font-medium text-slate-200">Save as draft without a check</span>
                  <span className="block text-[11px] leading-5 text-slate-400">
                    The content is stored, but no audit runs until you check it from the content page.
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => navigate('/content')} disabled={submitting}>
                  Cancel
                </Button>
                {saveDraft ? (
                  <Button onClick={() => void submit(true)} loading={submitting} disabled={uploading}>
                    Save draft
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => void submit(false)}
                    loading={submitting}
                    disabled={uploading || videoProcessing}
                    className={mode === 'video' ? 'px-5' : undefined}
                  >
                    {uploading ? 'Uploading file…' : videoProcessing ? 'Analysis running…' : runLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {videoProcessing ? (
              <p className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2 text-[11px] leading-5 text-sky-100">
                Automatic video analysis is still running. This button enables when the server reports both stages
                finished, so the audit never reports a complete result for unfinished stages.
              </p>
            ) : null}
            {error ? (
              <p
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                {error}
              </p>
            ) : null}
            {!can('content.submit.all') && !can('content.submit.own') ? (
              <p className="mt-3 text-[11px] text-slate-400">
                Your role can create and check content. A creator submits it for review after checking.
              </p>
            ) : null}
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="p-4">
            <p className="text-xs font-semibold text-slate-100">What runs on save</p>
            <ul className="mt-3 space-y-2.5 text-[11px] leading-5 text-slate-400">
              {[
                'Deterministic rules from the active policy library',
                'Contradictions against active approved facts',
                'Ambiguous or unsupported quantitative claims',
                'Citation of the rule or fact behind every finding',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-white/[0.07] pt-3 text-[11px] leading-5 text-slate-400">
              {mode === 'video' ? (
                transcriptionConfigured ? (
                  <>
                    Automatic speech-to-text calls the transcription provider configured on the server; the API key is
                    never exposed to this browser. On-screen text is read locally with OCR. If a stage cannot run, the
                    audit records that limitation instead of reporting complete coverage.
                  </>
                ) : (
                  <>
                    No speech-to-text provider is configured on this server, so spoken content is checked only when you
                    supply a manual transcript. On-screen text is still read locally with OCR when available. A failed
                    stage is reported as a limitation, never as complete coverage.
                  </>
                )
              ) : (
                <>
                  No external AI service is called for this check. Image and scanned-PDF text is read locally on the
                  server with OCR; if a page or format cannot be inspected, the check says so rather than returning
                  invented findings.
                </>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold text-slate-100">File handling</p>
            <ul className="mt-2.5 space-y-2 text-[11px] leading-5 text-slate-400">
              <li>Files are stored under a server-owned directory with generated names.</li>
              <li>Downloads use your signed-in session and are isolated to this workspace; there are no public file URLs.</li>
              <li>PDFs must pass a signature check and the server page limit.</li>
              {mode === 'video' ? (
                <>
                  <li>Video containers are checked before storage; unsupported or corrupt files are rejected.</li>
                  <li>Extracted audio is temporary and deleted after transcription. Sampled frames are stored with the upload for evidence previews.</li>
                  <li>
                    Frames are sampled at a server-configured interval with a hard cap; long videos above the limit are
                    refused rather than partially guessed.
                  </li>
                </>
              ) : null}
              <li>
                {limits
                  ? `General uploads up to ${limits.max_upload_mb} MB; video up to ${limits.max_video_upload_mb} MB; PDFs up to ${limits.max_pdf_pages} pages.`
                  : 'Upload limits are enforced by the server.'}
              </li>
            </ul>
          </Card>

          {session?.workspace.is_demo ? (
            <InfoCallout tone="neutral" title="Demo workspace">
              This workspace, its rules, and its facts are fictional demo records for Acme Cloud Technologies. Do
              not paste real confidential material into a public demo.
            </InfoCallout>
          ) : (
            <InfoCallout tone="neutral" title="Shared demo access">
              {session?.workspace.name || 'This workspace'} is stored on this demo deployment. Roles are shared
              demo identities, so do not paste confidential material.
            </InfoCallout>
          )}
        </aside>
      </div>
    </div>
  );
}
