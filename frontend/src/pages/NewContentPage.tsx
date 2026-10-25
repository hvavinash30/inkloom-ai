import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileImage,
  FileText,
  Film,
  Loader2,
  UploadCloud,
  X,
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
import type { ContentType, UploadRecord } from '../types';

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
    description: 'Store and preview; visual checks stay manual.',
    icon: FileImage,
  },
  {
    id: 'video',
    label: 'Video',
    description: 'Paste a transcript for checks; attach video for playback.',
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
    setShowFallback(false);
  };

  const accept = mode === 'text' ? undefined : ACCEPT_BY_MODE[mode];

  const handleFile = async (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setUpload(null);
    setUploadError(null);
    clearFieldError('file');
    setUploading(true);
    if (!title.trim()) {
      setTitle(selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120));
    }
    try {
      const kind = mode === 'text' ? undefined : mode;
      const record = await api.uploadFile(selected, kind);
      setUpload(record);
      if (record.extraction_status === 'processed') {
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
    if (fileInput.current) fileInput.current.value = '';
  };

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
      errors.transcript = 'Upload a video, paste a transcript, or both. A video without either cannot be checked.';
    } else if (!saveDraft && mode === 'video' && !transcript.trim()) {
      errors.transcript =
        'Add a transcript before running a check. Without one, the check can only record a processing limitation.';
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
      focusFirstInvalid(validation);
      return;
    }
    setFieldErrors({});
    if (uploading) return;
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
              className="font-medium text-amber-900 underline underline-offset-2"
            >
              Retry
            </button>
          </InfoCallout>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-4">
            <p className="text-xs font-semibold text-slate-900">1. Choose a content format</p>
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
                        ? 'border-brand-300 bg-brand-50/70'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg',
                        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="mt-2 block text-xs font-semibold text-slate-800">{item.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <p className="text-xs font-semibold text-slate-900">2. Describe the content</p>
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
                    <span role="alert" className="text-amber-700">
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
            <p className="text-xs font-semibold text-slate-900">3. Add the content</p>

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
                          'flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50/60 px-5 py-9 text-center transition-colors hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                          fieldErrors.file
                            ? 'border-rose-300 hover:border-rose-400'
                            : 'border-slate-300 hover:border-brand-300'
                        )}
                      >
                        <UploadCloud className="h-6 w-6 text-slate-400" />
                        <span className="mt-2 text-sm font-medium text-slate-700">
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
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 shadow-subtle">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {formatFileSize(file.size)}
                              {upload ? ` · stored as ${upload.kind}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={clearFile}
                            disabled={uploading}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
                            aria-label="Remove selected file"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {upload ? (
                          <div className="mt-2.5 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-5 text-slate-600">
                            <p className="flex items-center gap-1.5 font-medium text-slate-700">
                              {upload.extraction_status === 'processed' ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                              )}
                              Extraction status: {upload.extraction_status.replace(/_/g, ' ')}
                              {upload.page_count ? ` · ${upload.page_count} pages` : ''}
                            </p>
                            <p className="mt-1 text-slate-500">{upload.extraction_message}</p>
                          </div>
                        ) : null}

                      </div>
                    )}
                  </div>
                  {uploadError ? (
                    <p
                      id="content-upload-error"
                      role="alert"
                      className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700"
                    >
                      {uploadError}
                    </p>
                  ) : null}
                  {fieldErrors.file ? (
                    <p
                      id="content-file-error"
                      role="alert"
                      className="mt-2 text-xs leading-5 text-rose-600"
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
                      className="text-[11px] font-medium text-brand-700 hover:underline"
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
                  <InfoCallout tone="warning" title="Image checks are a manual-review boundary in this deployment">
                    No OCR or vision service is configured. The image is stored and can be previewed with your role
                    permissions, but automated text-in-image, contrast, or logo checks did not run. The check will record
                    a processing limitation instead of inventing a result.
                  </InfoCallout>
                ) : null}

                {mode === 'video' ? (
                  <div className="space-y-3">
                    <Field
                      label="Transcript for checks"
                      htmlFor="video-transcript"
                      error={fieldErrors.transcript}
                      hint="Paste plain text, [mm:ss] lines, SRT, or VTT. Explicit timestamps stay linked to findings; plain text is checked without timestamps."
                      required={!saveDraft}
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
                        aria-required={saveDraft ? undefined : 'true'}
                        aria-invalid={Boolean(fieldErrors.transcript)}
                        aria-describedby={fieldErrors.transcript ? 'video-transcript-error' : undefined}
                      />
                    </Field>
                    {segments.length > 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                        <p className="text-[11px] font-medium text-slate-700">
                          {segments.length} timestamped segment{segments.length === 1 ? '' : 's'} parsed
                        </p>
                        <div className="mt-1.5 max-h-28 space-y-1 overflow-y-auto pr-1">
                          {segments.slice(0, 6).map((segment, index) => (
                            <p key={`${segment.timestamp_seconds}-${index}`} className="flex gap-2 text-[11px] text-slate-500">
                              <span className="shrink-0 font-mono text-slate-400">{formatSeconds(segment.timestamp_seconds)}</span>
                              <span className="min-w-0 truncate">{segment.text}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : transcript.trim() ? (
                      <InfoCallout tone="neutral">
                        No timestamps detected. Checks will treat this as plain transcript text; findings will not have
                        timestamp or playback links.
                      </InfoCallout>
                    ) : (
                      <InfoCallout tone="warning" title="No transcription service is configured">
                        Upload a video for playback and paste its transcript for checks. If you create the item without a
                        transcript, the check will honestly report that spoken content could not be inspected.
                      </InfoCallout>
                    )}
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
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-xs font-medium text-slate-800">Save as draft without a check</span>
                  <span className="block text-[11px] leading-5 text-slate-500">
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
                  <Button onClick={() => void submit(false)} loading={submitting} disabled={uploading}>
                    {uploading ? 'Uploading file…' : 'Run check'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            {error ? (
              <p
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
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
            <p className="text-xs font-semibold text-slate-900">What runs on save</p>
            <ul className="mt-3 space-y-2.5 text-[11px] leading-5 text-slate-500">
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
            <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
              No external AI, OCR, or transcription service is called. If a format cannot be inspected, the check says
              so rather than returning invented findings.
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold text-slate-900">File handling</p>
            <ul className="mt-2.5 space-y-2 text-[11px] leading-5 text-slate-500">
              <li>Files are stored under a server-owned directory with generated names.</li>
              <li>Downloads require your role header; there are no public file URLs.</li>
              <li>PDFs must pass a signature check and the server page limit.</li>
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
