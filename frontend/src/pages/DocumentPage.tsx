import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Fingerprint,
  GitCompare,
  History,
  MapPin,
  MessageSquare,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, navigate } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import { EvidenceViewer } from '../components/EvidenceViewer';
import { HighlightedText, MissingEvidenceNote } from '../components/EvidenceText';
import { FindingCard } from '../components/FindingCard';
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  InfoCallout,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  RiskBadge,
  ScoreRing,
  SectionHeading,
  Select,
  SeverityBadge,
  StatusBadge,
  Tabs,
  Textarea,
  cn,
} from '../components/ui';
import {
  ASSET_TYPE_LABEL,
  CONTENT_TYPE_LABEL,
  ROLE_LABEL,
  SEVERITY_LABEL,
  formatDateTime,
  formatSeconds,
  parseTranscript,
  relativeTime,
  splitTranscriptText,
  titleCase,
} from '../lib/format';
import { analyzeExactEvidence } from '../lib/evidence';
import { groupFindings, replaceAffected } from '../lib/findings';
import type {
  ContentType,
  DecisionType,
  Finding,
  Severity,
  VerificationStatus,
} from '../types';

const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: 'Automated checks completed',
  partially_verified: 'Partially checked',
  unable_to_verify: 'Inspection limited',
};

const VERIFICATION_STYLE: Record<VerificationStatus, string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  partially_verified: 'border-amber-200 bg-amber-50 text-amber-800',
  unable_to_verify: 'border-slate-200 bg-slate-100 text-slate-700',
};

const DECISION_LABEL: Record<DecisionType, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
};

const DECISION_STYLE: Record<DecisionType, string> = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
  changes_requested: 'border-amber-200 bg-amber-50 text-amber-800',
};

function verificationBadge(status: VerificationStatus) {
  return (
    <span
      title="Audit coverage only. This is not an approval decision."
      className="inline-flex"
    >
      <Badge className={VERIFICATION_STYLE[status]}>
        {VERIFICATION_LABEL[status] || titleCase(status)}
      </Badge>
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="max-w-[70%] text-right text-xs leading-5 text-slate-700">{children}</dd>
    </div>
  );
}

function PageSelect({
  id,
  label,
  pageCount,
  value,
  onChange,
  findings,
}: {
  id: string;
  label: string;
  pageCount: number;
  value: number;
  onChange: (page: number) => void;
  findings: Finding[];
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <label htmlFor={id} className="text-[11px] font-medium text-slate-600">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="h-11 w-11 px-0 sm:h-9 sm:w-9"
          onClick={() => onChange(value - 1)}
          disabled={value <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Select
          id={id}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-11 min-w-0 flex-1 sm:h-9 sm:min-w-[226px] sm:flex-none"
        >
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => {
            const count = findings.filter((finding) => finding.page_number === page).length;
            return (
              <option key={page} value={page}>
                Page {page} of {pageCount}
                {count > 0 ? ` · ${count} finding${count === 1 ? '' : 's'}` : ' · no findings'}
              </option>
            );
          })}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          className="h-11 w-11 px-0 sm:h-9 sm:w-9"
          onClick={() => onChange(value + 1)}
          disabled={value >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function DocumentPage({ id }: { id: string }) {
  const { role, can, session, openAssistant } = useSession();
  const { toast } = useToast();
  const docState = useAsync(() => api.getDocument(id), [id, role]);
  const versionsState = useAsync(() => api.listVersions(id), [id, role]);
  const commentsState = useAsync(() => api.listComments(id), [id, role]);
  const decisionsState = useAsync(() => api.listDecisions(id), [id, role]);
  const eventsState = useAsync(() => api.listEvents(id), [id, role]);
  const provenanceState = useAsync(() => api.getProvenance(id), [id, role]);
  const summaryState = useAsync(() => api.getReviewSummary(id), [id, role]);
  const document = docState.data;
  const uploadState = useAsync(
    () => (document?.file_id ? api.getUpload(document.file_id) : Promise.resolve(null)),
    [document?.file_id, role]
  );
  const campaignState = useAsync(
    () => (document?.campaign_id ? api.getCampaign(document.campaign_id) : Promise.resolve(null)),
    [document?.campaign_id, role]
  );

  const version = document?.current_version || null;
  const run = document?.latest_audit || null;
  const findings = run?.findings || [];
  const versions = versionsState.data || [];
  const comments = commentsState.data || [];
  const decisions = decisionsState.data || [];
  const events = eventsState.data || [];

  const [tab, setTab] = useState('findings');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [findingsQuery, setFindingsQuery] = useState('');

  const [selectedPage, setSelectedPage] = useState(1);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const previousTabRef = useRef(tab);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [editorText, setEditorText] = useState('');
  const [editorPages, setEditorPages] = useState<string[]>([]);
  const [editorSummary, setEditorSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('Submitted for brand review.');
  const [actionError, setActionError] = useState<string | null>(null);

  const [commentText, setCommentText] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'shared' | 'internal'>('shared');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentFieldError, setCommentFieldError] = useState<string | null>(null);

  const [decisionOpen, setDecisionOpen] = useState<DecisionType | null>(null);
  const [decisionFeedback, setDecisionFeedback] = useState('');
  const [decisionVersionId, setDecisionVersionId] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionFeedbackError, setDecisionFeedbackError] = useState<string | null>(null);
  const seekTimeoutRef = useRef<number | null>(null);

  const [fromVersion, setFromVersion] = useState('');
  const [toVersion, setToVersion] = useState('');
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof api.compareVersions>> | null>(null);

  const canEdit = Boolean(
    document &&
      (can('content.edit.all') ||
        (can('content.edit.own') && document.created_by === session?.active_user.id))
  );
  const canSubmit = Boolean(
    document &&
      run &&
      document.status !== 'in_review' &&
      document.status !== 'approved' &&
      (can('content.submit.all') ||
        (can('content.submit.own') && document.created_by === session?.active_user.id))
  );
  const canDecide = can('review.decide');
  const openFindings = findings.filter((finding) => finding.status === 'open');
  const highOpen = openFindings.filter(
    (finding) => finding.severity === 'high' || finding.severity === 'critical'
  ).length;

  const filteredFindings = useMemo(() => {
    const needle = findingsQuery.trim().toLowerCase();
    return findings.filter((finding) => {
      if (severityFilter && finding.severity !== severityFilter) return false;
      if (statusFilter === 'open' && finding.status !== 'open') return false;
      if (statusFilter === 'resolved' && finding.status === 'open') return false;
      if (needle) {
        const haystack = `${finding.title} ${finding.explanation} ${finding.affected_text} ${finding.category}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [findings, severityFilter, statusFilter, findingsQuery]);

  const transcriptSplit = useMemo(
    () => splitTranscriptText(version?.content_text || ''),
    [version?.content_text]
  );

  useEffect(() => {
    if (!version) return;
    setEditorText(version.content_text || '');
    setEditorPages(version.page_texts?.length ? [...version.page_texts] : []);
    setSelectedPage(1);
    setEditorSummary('');
    setDecisionVersionId('');
    setActiveFindingId(null);
    // Reset the editor only when a different version becomes current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id]);

  useEffect(() => {
    if (tab !== 'content' || !activeFindingId) {
      previousTabRef.current = tab;
      return;
    }
    const switchedToContent = previousTabRef.current !== 'content';
    previousTabRef.current = tab;
    if (!switchedToContent) return;
    const frame = window.requestAnimationFrame(() => {
      const banner = window.document.getElementById('selected-evidence');
      banner?.scrollIntoView({ block: 'center' });
      banner?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, activeFindingId]);

  useEffect(
    () => () => {
      if (seekTimeoutRef.current !== null) window.clearTimeout(seekTimeoutRef.current);
    },
    [id]
  );

  useEffect(() => {
    if (!versions.length) return;
    const numbers = versions.map((item) => item.version_number);
    if (!numbers.includes(Number(fromVersion)) || !numbers.includes(Number(toVersion))) {
      const latest = numbers[numbers.length - 1];
      const previous = numbers.length > 1 ? numbers[numbers.length - 2] : latest;
      setFromVersion(String(previous));
      setToVersion(String(latest));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

  const refreshRelated = () => {
    setRerunning(false);
    docState.reload();
    versionsState.reload();
    commentsState.reload();
    decisionsState.reload();
    eventsState.reload();
    provenanceState.reload();
    summaryState.reload();
  };

  const rerun = async () => {
    setRerunning(true);
    setActionError(null);
    try {
      const updated = await api.rerunAudit(id);
      docState.setData(updated);
      toast('Compliance check re-ran on the current version.', 'success');
      refreshRelated();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.detail : 'The check could not be re-run.');
    } finally {
      setRerunning(false);
    }
  };

  const submitForReview = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await api.submitForReview(id, submitNotes.trim() || undefined);
      docState.setData(updated);
      setSubmitOpen(false);
      toast('Submitted for review. A reviewer can now decide on this version.', 'success');
      refreshRelated();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.detail : 'The content could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  const saveRevision = async () => {
    if (!version) return;
    setSaving(true);
    setActionError(null);
    try {
      const isPdf = document?.asset_type === 'pdf';
      const pages = isPdf
        ? editorPages.length > 0
          ? editorPages
          : editorText.trim()
            ? [editorText]
            : []
        : undefined;
      const contentText = isPdf
        ? pages?.join('\n\f\n') || editorText
        : editorText;
      const parsedSegments =
        document?.asset_type === 'video'
          ? parseTranscript(editorText).map((segment) => ({
              timestamp_seconds: segment.timestamp_seconds,
              text: segment.text,
            }))
          : undefined;
      const updated = await api.createVersion(id, {
        content_text: contentText,
        change_summary: editorSummary.trim() || `Revision after findings on version ${version.version_number}`,
        page_texts: pages,
        transcript_segments: document?.asset_type === 'video' ? parsedSegments || [] : undefined,
      });
      docState.setData(updated);
      toast('New version saved and checked. The previous approval does not carry forward.', 'success');
      setTab('findings');
      refreshRelated();
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.detail : 'The revision could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const applyCorrection = (finding: Finding, replacement?: string) => {
    const nextText = (replacement ?? finding.suggested_correction ?? '').trim();
    if (!nextText) return;
    if (document?.asset_type === 'pdf' && finding.page_number) {
      const index = finding.page_number - 1;
      const source = editorPages[index] ?? version?.page_texts?.[index] ?? '';
      const updated = replaceAffected(source, finding, nextText);
      if (updated === null) {
        toast('This finding’s exact text could not be located in the stored page. Edit the page manually.', 'error');
        setSelectedPage(finding.page_number);
        setTab('content');
        return;
      }
      const next = [...(editorPages.length ? editorPages : version?.page_texts || [])];
      next[index] = updated;
      setEditorPages(next);
      setSelectedPage(finding.page_number);
    } else {
      const source = editorText || version?.content_text || '';
      const updated = replaceAffected(source, finding, nextText);
      if (updated === null) {
        toast('The affected text could not be found in the editor. Update it manually.', 'error');
        setTab('content');
        return;
      }
      setEditorText(updated);
    }
    setTab('content');
    toast('Correction staged in the editor. Save a new version to re-check it.', 'info');
  };

  const addComment = async () => {
    if (commentText.trim().length < 2) {
      setCommentFieldError('Write at least two characters before posting.');
      window.requestAnimationFrame(() => {
        window.document.getElementById('review-comment')?.focus();
      });
      return;
    }
    setCommentBusy(true);
    setCommentError(null);
    setCommentFieldError(null);
    try {
      await api.addComment(id, {
        comment_text: commentText.trim(),
        visibility: commentVisibility,
      });
      setCommentText('');
      setCommentVisibility('shared');
      commentsState.reload();
      eventsState.reload();
      docState.reload();
      toast('Review comment added.', 'success');
    } catch (caught) {
      setCommentError(caught instanceof ApiError ? caught.detail : 'The comment could not be added.');
    } finally {
      setCommentBusy(false);
    }
  };

  const openDecision = (decision: DecisionType) => {
    if (!version) return;
    setDecisionOpen(decision);
    setDecisionFeedback('');
    setDecisionVersionId((current) => current || version.id);
    setDecisionError(null);
    setDecisionFeedbackError(null);
  };

  const recordDecision = async () => {
    if (!decisionOpen || !decisionVersionId) return;
    if (decisionOpen !== 'approved' && decisionFeedback.trim().length < 3) {
      setDecisionFeedbackError('Feedback of at least 3 characters is required when requesting changes or rejecting.');
      window.requestAnimationFrame(() => {
        const field = window.document.getElementById('decision-feedback') as HTMLTextAreaElement | null;
        field?.focus();
      });
      return;
    }
    setDecisionBusy(true);
    setDecisionError(null);
    setDecisionFeedbackError(null);
    try {
      await api.recordDecision(id, {
        decision: decisionOpen,
        version_id: decisionVersionId,
        feedback: decisionFeedback.trim() || undefined,
      });
      toast(`Decision recorded: ${DECISION_LABEL[decisionOpen]}.`, 'success');
      setDecisionOpen(null);
      setDecisionVersionId('');
      docState.reload();
      decisionsState.reload();
      eventsState.reload();
      commentsState.reload();
      versionsState.reload();
    } catch (caught) {
      setDecisionError(caught instanceof ApiError ? caught.detail : 'The decision could not be recorded.');
    } finally {
      setDecisionBusy(false);
    }
  };

  const compare = async () => {
    const from = Number(fromVersion);
    const to = Number(toVersion);
    if (!from || !to || from === to) return;
    setCompareBusy(true);
    setCompareError(null);
    try {
      setComparison(await api.compareVersions(id, from, to));
    } catch (caught) {
      setCompareError(caught instanceof ApiError ? caught.detail : 'The versions could not be compared.');
    } finally {
      setCompareBusy(false);
    }
  };

  const askAbout = (finding?: Finding) => {
    openAssistant({
      documentId: id,
      findingId: finding?.id,
      pageContext: `/content/${id}`,
      prompt: finding
        ? `Explain the evidence for the finding “${finding.title}” and what I should change.`
        : `What should I know before making a decision on “${document?.title}”?`,
    });
  };

  if (docState.loading && !document) {
    return (
      <div>
        <div className="mb-6 h-24 animate-pulse rounded-xl border border-slate-100 bg-white" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <LoadingBlock rows={4} />
          <LoadingBlock rows={2} />
        </div>
      </div>
    );
  }

  if (docState.error || !document) {
    return (
      <div>
        <PageHeader
          backTo="/content"
          backLabel="Content"
          title="Content unavailable"
          description="This item may not exist, or your current role may not have access to it."
        />
        <ErrorState message={docState.error || 'The content was not returned.'} retry={docState.reload} />
      </div>
    );
  }

  const isPdf = document.asset_type === 'pdf';
  const pageCount = Math.max(
    1,
    version?.page_texts?.length || 0,
    uploadState.data?.page_count || 0
  );
  const currentPage = Math.min(Math.max(1, selectedPage), pageCount);
  const selectedPageText = version?.page_texts?.[currentPage - 1] ?? '';
  const pageFindings = isPdf
    ? findings.filter((finding) => finding.page_number === currentPage)
    : [];
  const highlightedPageFindingIds = new Set(
    analyzeExactEvidence(selectedPageText, pageFindings).parts.flatMap((part) => part.findingIds)
  );
  const evidencePageEdited =
    isPdf &&
    canEdit &&
    editorPages.length > 0 &&
    (editorPages[currentPage - 1] ?? '') !== selectedPageText;
  const transcript = version?.transcript_segments || [];
  const untimestampedTranscript = transcriptSplit.untimestamped;
  const untimedFindings = findings.filter(
    (finding) =>
      (finding.timestamp_seconds === null || finding.timestamp_seconds === undefined) &&
      (finding.page_number === null || finding.page_number === undefined)
  );
  const activeFinding = activeFindingId
    ? findings.find((finding) => finding.id === activeFindingId) ?? null
    : null;
  const activeFindingLocation = activeFinding
    ? activeFinding.location_label ||
      (activeFinding.page_number
        ? `Page ${activeFinding.page_number}`
        : activeFinding.timestamp_seconds !== null && activeFinding.timestamp_seconds !== undefined
          ? `Timestamp ${formatSeconds(activeFinding.timestamp_seconds)}`
          : 'Whole document')
    : '';
  const focusEvidence = (finding: Finding) => {
    setActiveFindingId(finding.id);
    if (finding.page_number) setSelectedPage(finding.page_number);
    setTab('content');
  };
  const hasStoredVideo =
    document.asset_type === 'video' &&
    Boolean(document.file_id) &&
    uploadState.data?.kind !== 'transcript';
  const isTranscriptOnly = document.asset_type === 'video' && !hasStoredVideo;
  const currentDecision = document.latest_decision;
  const approvedVersion = versions.find((item) => item.id === document.approved_version_id);
  const decisionVersion = versions.find((item) => item.id === decisionVersionId);
  const decisionTitle =
    decisionOpen === 'approved'
      ? 'Approve this version'
      : decisionOpen === 'changes_requested'
        ? 'Request changes'
        : decisionOpen === 'rejected'
          ? 'Reject this version'
          : 'Record decision';
  const decisionRecordLabel =
    decisionOpen === 'approved'
      ? 'Record approval'
      : decisionOpen === 'changes_requested'
        ? 'Request changes'
        : decisionOpen === 'rejected'
          ? 'Record rejection'
          : 'Record decision';
  const canOpenDecision = Boolean(
    canDecide &&
      version &&
      (document.status === 'in_review' ||
        document.status === 'changes_requested' ||
        document.approval_stale)
  );
  const editorDirty = Boolean(
    version &&
      (isPdf
        ? editorPages.length !== version.page_texts.length ||
          editorPages.some((page, index) => page !== version.page_texts[index])
        : editorText !== version.content_text)
  );

  const seekTo = (seconds: number) => {
    if (!hasStoredVideo) return;
    setTab('content');
    if (seekTimeoutRef.current !== null) window.clearTimeout(seekTimeoutRef.current);
    let attempts = 0;
    const attempt = () => {
      const player = videoRef.current;
      if (player) {
        try {
          player.currentTime = seconds;
          void player.play().catch(() => undefined);
        } catch {
          toast('The video player could not seek to that timestamp.', 'error');
        }
        return;
      }
      attempts += 1;
      if (attempts > 30) {
        toast(
          'The video player is still loading. Try the timestamp again when the stored video appears.',
          'info'
        );
        return;
      }
      seekTimeoutRef.current = window.setTimeout(attempt, 100);
    };
    seekTimeoutRef.current = window.setTimeout(attempt, 50);
  };

  const renderFindings = () => {
    if (!run) {
      return (
        <EmptyState
          icon={ShieldCheck}
          title="No compliance check has run on this version"
          description={
            document.status === 'draft'
              ? 'This is a draft. Run a check to compare it with the active rules and approved facts.'
              : 'A check is required before the content can move into review.'
          }
          action={
            canEdit ? (
              <Button size="sm" loading={rerunning} onClick={() => void rerun()}>
                <RefreshCw className="h-4 w-4" />
                Run compliance check
              </Button>
            ) : undefined
          }
        />
      );
    }

    const groups = groupFindings(filteredFindings);

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={findingsQuery}
              onChange={(event) => setFindingsQuery(event.target.value)}
              placeholder="Search findings, affected text, or category…"
              className="pl-9"
              aria-label="Search findings"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter findings by status"
              className="w-auto min-w-[122px]"
            >
              <option value="open">Open only</option>
              <option value="all">All findings</option>
              <option value="resolved">Resolved only</option>
            </Select>
            <Select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              aria-label="Filter findings by severity"
              className="w-auto min-w-[122px]"
            >
              <option value="">All severities</option>
              {(Object.keys(SEVERITY_LABEL) as Severity[]).map((severity) => (
                <option key={severity} value={severity}>
                  {SEVERITY_LABEL[severity]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{filteredFindings.length} of {findings.length} finding(s)</span>
          <span aria-hidden>·</span>
          <span>{openFindings.length} open</span>
          <span aria-hidden>·</span>
          <span>{highOpen} high/critical open</span>
        </div>

        {filteredFindings.length === 0 ? (
          findings.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-emerald-950">No findings in this check</p>
                <p className="mt-0.5 text-xs leading-5 text-emerald-800/80">
                  The stored version matched the active rules and approved facts that were checked. This is not a legal
                  clearance or a guarantee.
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="No findings match those filters"
              description="Change the status, severity, or search term to see more."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setFindingsQuery('');
                    setSeverityFilter('');
                    setStatusFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`finding-group-${group.id}`}
                className="space-y-3"
              >
                <div className="px-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`finding-group-${group.id}`}
                      className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {group.title}
                    </h2>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
                      {group.findings.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{group.description}</p>
                </div>
                <div className="space-y-3">
                  {group.findings.map((finding) => {
                    const hasTimestamp =
                      finding.timestamp_seconds !== null && finding.timestamp_seconds !== undefined;
                    return (
                      <div key={finding.id}>
                        {hasTimestamp || finding.page_number || finding.affected_text ? (
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            {hasTimestamp ? (
                              hasStoredVideo ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="min-h-11 px-2 sm:min-h-8"
                                  onClick={() => {
                                    setActiveFindingId(finding.id);
                                    seekTo(finding.timestamp_seconds as number);
                                  }}
                                >
                                  <Play className="h-3 w-3" />
                                  Play at {formatSeconds(finding.timestamp_seconds as number)}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="min-h-11 px-2 text-[11px] text-slate-500 sm:min-h-8"
                                  onClick={() => focusEvidence(finding)}
                                >
                                  <Clock3 className="h-3 w-3" />
                                  View transcript timestamp {formatSeconds(finding.timestamp_seconds as number)} · no video
                                  attached
                                </Button>
                              )
                            ) : null}
                            {finding.page_number ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-11 px-2 sm:min-h-8"
                                onClick={() => focusEvidence(finding)}
                              >
                                <MapPin className="h-3 w-3" />
                                View page {finding.page_number} in evidence
                              </Button>
                            ) : null}
                            {!hasTimestamp && !finding.page_number && finding.affected_text ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-11 px-2 sm:min-h-8"
                                onClick={() => focusEvidence(finding)}
                              >
                                <Search className="h-3 w-3" />
                                View in checked text
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                        <FindingCard
                          finding={finding}
                          canEdit={canEdit}
                          canDismiss={can('findings.dismiss')}
                          onUpdated={refreshRelated}
                          onApplyCorrection={applyCorrection}
                          onAsk={(item) => askAbout(item)}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => (
    <div className="space-y-5">
      {run?.verification_status === 'unable_to_verify' || run?.extraction_notes ? (
        <InfoCallout
          tone={run?.verification_status === 'unable_to_verify' ? 'warning' : 'neutral'}
          title={
            run?.verification_status === 'unable_to_verify'
              ? 'Automatic inspection was limited'
              : isTranscriptOnly
                ? 'Transcript-only evidence'
                : 'Extraction note'
          }
        >
          {isTranscriptOnly
            ? 'No video file is stored for this item. The check used the supplied transcript, and timestamps are transcript references only. No player, speech-to-text, or visual analysis is available for this record.'
            : run?.extraction_notes ||
              'The stored format did not provide enough text for the deterministic checks. Findings below describe the processing limitation, not an assessed violation.'}
        </InfoCallout>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-3">
          <SectionHeading
            title="Stored evidence"
            description={
              isTranscriptOnly
                ? 'No video file is stored. The supplied transcript and its explicit timestamps are the stored evidence.'
                : document.file_id
                  ? 'The file is retrieved through an authenticated API request using your current role.'
                  : 'No media file was stored with this content.'
            }
            action={
              uploadState.data ? (
                <span className="text-[10px] text-slate-400">
                  {uploadState.data.original_name} · {uploadState.data.mime_type}
                </span>
              ) : undefined
            }
          />
          {uploadState.error ? (
            <InfoCallout tone="warning" title="Upload record could not be loaded">
              File metadata and extraction status may be unavailable. The stored file and findings are still checked by
              the server. {uploadState.error}{' '}
              <button
                type="button"
                onClick={uploadState.reload}
                className="font-medium text-amber-900 underline underline-offset-2"
              >
                Retry
              </button>
            </InfoCallout>
          ) : null}
          {isPdf ? (
            <PageSelect
              id="evidence-page"
              label="Evidence page"
              pageCount={pageCount}
              value={currentPage}
              onChange={setSelectedPage}
              findings={findings}
            />
          ) : null}
          <EvidenceViewer
            fileId={isTranscriptOnly ? null : document.file_id}
            assetType={document.asset_type}
            title={document.title}
            page={currentPage}
            videoRef={videoRef}
            emptyMessage={
              document.asset_type === 'video'
                ? 'No video file is stored for this item. This is a transcript-only check; the transcript and explicit timestamps below came from the supplied record. No player is shown.'
                : undefined
            }
          />
          {uploadState.data ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Fingerprint className="h-3 w-3 text-slate-400" />
                SHA-256 recorded at upload
              </span>
              <span>Extraction: {uploadState.data.extraction_status.replace(/_/g, ' ')}</span>
              {uploadState.data.page_count ? <span>{uploadState.data.page_count} pages</span> : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-3">
          {activeFinding ? (
            <div
              id="selected-evidence"
              tabIndex={-1}
              role="status"
              className="rounded-xl border border-orange-200 bg-orange-50/70 p-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-700">
                    Selected evidence
                  </p>
                  <p className="mt-0.5 text-sm font-medium leading-5 text-orange-950">{activeFinding.title}</p>
                  <p className="mt-0.5 text-[11px] text-orange-800/80">
                    {SEVERITY_LABEL[activeFinding.severity]} · {activeFindingLocation}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0 px-2 text-orange-800 hover:bg-orange-100 sm:min-h-8"
                  onClick={() => setActiveFindingId(null)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-orange-800/80">
                Verbatim affected text is highlighted below when it exists in the stored source. Findings without an
                exact match are listed explicitly instead of being approximated.
              </p>
            </div>
          ) : null}
          <SectionHeading
            title={
              document.asset_type === 'video'
                ? transcript.length > 0
                  ? 'Timestamped transcript'
                  : 'Transcript (no timestamps)'
                : document.asset_type === 'pdf'
                  ? `Page ${currentPage} text`
                  : document.asset_type === 'image'
                    ? 'Image review note'
                    : 'Checked text'
            }
            description={
              document.asset_type === 'video'
                ? transcript.length > 0
                  ? hasStoredVideo
                    ? 'Stored transcript segments used for the check. Select a timestamp to play that point in the stored video.'
                    : 'Stored transcript segments used for the check. No video file is attached; timestamps are transcript references only.'
                  : 'This transcript was checked as plain text. Findings have no timestamp or playback links.'
                : document.asset_type === 'pdf'
                  ? 'Extracted text preserved per page. Page order reflects text extraction, not visual layout. Highlights mark exact recorded wording only.'
                  : undefined
            }
          />
          {document.asset_type === 'image' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-800">Visual checks were not performed automatically.</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                No OCR or vision service is configured in this deployment. A human reviewer should inspect the stored
                image for contrast, logo usage, text in images, and layout. The findings tab records this limitation.
              </p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => askAbout()}>
                <Sparkles className="h-3.5 w-3.5" />
                Ask about the evidence
              </Button>
            </div>
          ) : document.asset_type === 'video' && transcript.length > 0 ? (
            <div className="max-h-[540px] overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {transcript.map((segment, index) => {
                const seconds = Number(segment.timestamp_seconds || 0);
                const segmentText = String(segment.text || '');
                const segmentFindings = findings.filter(
                  (finding) =>
                    finding.timestamp_seconds !== null &&
                    finding.timestamp_seconds !== undefined &&
                    Math.abs(Number(finding.timestamp_seconds) - seconds) < 0.5
                );
                return (
                  <div key={`${seconds}-${index}`} className="border-b border-slate-100 p-3 last:border-0">
                    <div className="flex items-start gap-2.5">
                      {hasStoredVideo ? (
                        <button
                          type="button"
                          onClick={() => seekTo(seconds)}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700 sm:min-h-0 sm:px-1.5 sm:py-0.5"
                          title="Play the stored video from this timestamp"
                        >
                          <Play className="h-2.5 w-2.5" />
                          {formatSeconds(seconds)}
                        </button>
                      ) : (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500"
                          title="Transcript timestamp; no video file is stored"
                        >
                          <Clock3 className="h-2.5 w-2.5" />
                          {formatSeconds(seconds)}
                        </span>
                      )}
                      <p className="min-w-0 flex-1 text-sm leading-6 text-slate-700">
                        <HighlightedText
                          source={segmentText}
                          findings={segmentFindings}
                          activeFindingId={activeFindingId}
                        />
                      </p>
                    </div>
                    {segmentFindings.length > 0 ? (
                      <div className="ml-0 mt-1.5 flex flex-wrap gap-1.5 sm:ml-12">
                        {segmentFindings.map((finding) => (
                          <button
                            key={finding.id}
                            type="button"
                            aria-pressed={activeFindingId === finding.id}
                            onClick={() => setActiveFindingId(finding.id)}
                            className={cn(
                              'inline-flex min-h-11 items-center gap-1 rounded border px-1.5 py-0.5 text-left text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 sm:min-h-0',
                              activeFindingId === finding.id
                                ? 'border-orange-400 bg-orange-200 text-orange-950'
                                : 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100'
                            )}
                          >
                            {SEVERITY_LABEL[finding.severity]} · {finding.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {segmentFindings.length > 0 ? (
                      <div className="mt-2">
                        <MissingEvidenceNote
                          source={segmentText}
                          findings={segmentFindings}
                          contextLabel={`transcript line at ${formatSeconds(seconds)}`}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {untimestampedTranscript ? (
                <div className="border-t border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Untimestamped transcript text
                  </p>
                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                    These stored lines have no explicit timestamps. They were checked as plain text without inventing
                    times.
                  </p>
                  <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
                    <HighlightedText
                      source={untimestampedTranscript}
                      findings={untimedFindings}
                      activeFindingId={activeFindingId}
                    />
                  </pre>
                  <div className="mt-2">
                    <MissingEvidenceNote
                      source={untimestampedTranscript}
                      findings={untimedFindings}
                      contextLabel="untimestamped transcript text"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : document.asset_type === 'video' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {version?.content_text ? (
                <>
                  <pre className="max-h-[440px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
                    <HighlightedText
                      source={version.content_text}
                      findings={untimedFindings}
                      activeFindingId={activeFindingId}
                    />
                  </pre>
                  <div className="mt-2">
                    <MissingEvidenceNote
                      source={version.content_text}
                      findings={untimedFindings}
                      contextLabel="plain transcript"
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">No transcript is stored for this version.</p>
              )}
              <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
                This transcript has no explicit timestamps. It was checked as plain text, so findings do not have
                timestamp or playback links.
                {isTranscriptOnly ? ' No video file is stored for this item.' : ''}
              </p>
            </div>
          ) : document.asset_type === 'pdf' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {selectedPageText ? (
                <>
                  <pre className="max-h-[440px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
                    <HighlightedText
                      source={selectedPageText}
                      findings={pageFindings}
                      activeFindingId={activeFindingId}
                    />
                  </pre>
                  <div className="mt-2">
                    <MissingEvidenceNote
                      source={selectedPageText}
                      findings={pageFindings}
                      contextLabel={`page ${currentPage} text`}
                    />
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-sm font-medium text-slate-700">No extractable text on page {currentPage}</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
                    The stored PDF can still be reviewed visually. Automated checks require extracted text or a manual
                    transcription of the page.
                  </p>
                </div>
              )}
              {evidencePageEdited ? (
                <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[10px] leading-4 text-amber-800">
                  This evidence panel shows the checked version. Your unsaved edits on this page remain in the revision
                  editor below and are not used for highlighting.
                </p>
              ) : null}
              {pageFindings.length > 0 ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Findings on this page</p>
                  <div className="mt-1.5 space-y-1">
                    {pageFindings.map((finding) => {
                      const exactMatch = highlightedPageFindingIds.has(finding.id);
                      return (
                        <button
                          key={finding.id}
                          type="button"
                          aria-pressed={activeFindingId === finding.id}
                          onClick={() => setActiveFindingId(finding.id)}
                          className={cn(
                            'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:min-h-0',
                            activeFindingId === finding.id
                              ? 'border-orange-300 bg-orange-50 text-orange-950'
                              : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          <SeverityBadge severity={finding.severity} />
                          <span className="min-w-0 flex-1">{finding.title}</span>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-medium',
                              exactMatch
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            )}
                          >
                            {exactMatch ? 'Highlighted' : 'Exact text unavailable'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {version?.content_text ? (
                <>
                  <pre className="max-h-[540px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
                    <HighlightedText
                      source={version.content_text}
                      findings={untimedFindings}
                      activeFindingId={activeFindingId}
                    />
                  </pre>
                  <div className="mt-2">
                    <MissingEvidenceNote
                      source={version.content_text}
                      findings={untimedFindings}
                      contextLabel="checked text"
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">No text stored for this version.</p>
              )}
            </div>
          )}

          {version?.change_summary ? (
            <p className="text-[11px] text-slate-400">Version {version.version_number}: {version.change_summary}</p>
          ) : null}
        </div>
      </div>

      {canEdit && document.asset_type !== 'image' ? (
        <Card className="p-4">
          <SectionHeading
            title="Revise and re-check"
            description="Saving a new version runs a fresh check and clears any submission. A previous approval remains a record of the older version and is marked stale."
            action={
              editorDirty ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              ) : undefined
            }
          />
          <div className="mt-3 space-y-3">
            {isPdf && editorPages.length > 0 ? (
              <>
                <PageSelect
                  id="editor-page"
                  label="Revision editor page"
                  pageCount={pageCount}
                  value={currentPage}
                  onChange={setSelectedPage}
                  findings={findings}
                />
                <Textarea
                  rows={10}
                  value={editorPages[currentPage - 1] ?? ''}
                  onChange={(event) => {
                    const next = [...editorPages];
                    next[currentPage - 1] = event.target.value;
                    setEditorPages(next);
                  }}
                  aria-label={`Page ${currentPage} text editor`}
                  className="font-mono text-[12px] leading-5"
                />
              </>
            ) : isPdf ? (
              <Field
                label="Page text for a new version"
                htmlFor="revision-text"
                hint="No page text was extracted. Paste the corrected page text to make it checkable."
              >
                <Textarea
                  id="revision-text"
                  rows={10}
                  value={editorText}
                  onChange={(event) => setEditorText(event.target.value)}
                  className="font-mono text-[12px] leading-5"
                />
              </Field>
            ) : (
              <Field
                label={document.asset_type === 'video' ? 'Transcript text' : 'Content text'}
                htmlFor="revision-text"
                hint={
                  document.asset_type === 'video'
                    ? 'Keep explicit timestamps (for example [01:05] or SRT/VTT cues) to preserve finding links. Plain text is checked without timestamps; no timestamps are invented.'
                    : undefined
                }
              >
                <Textarea
                  id="revision-text"
                  rows={10}
                  value={editorText}
                  onChange={(event) => setEditorText(event.target.value)}
                  className="font-mono text-[12px] leading-5"
                />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field label="Change summary" htmlFor="change-summary">
                <Input
                  id="change-summary"
                  value={editorSummary}
                  onChange={(event) => setEditorSummary(event.target.value)}
                  placeholder="What changed in this revision?"
                  maxLength={500}
                />
              </Field>
              <Button
                onClick={() => void saveRevision()}
                loading={saving}
                disabled={!editorDirty || (isPdf ? editorPages.every((page) => !page.trim()) && !editorText.trim() : !editorText.trim())}
              >
                <Save className="h-4 w-4" />
                Save version & re-check
              </Button>
            </div>
            {!editorDirty && version ? (
              <p className="text-[10px] text-slate-400">
                Edit the text or apply a correction to enable saving. Version {version.version_number} is current.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {document.asset_type === 'image' ? (
        <InfoCallout tone="neutral" title="Image revision and OCR limits">
          This deployment does not extract text from images or edit image pixels. To revise an image, create a new
          content item with the revised file. Automated checks record the inspection limit; they never invent OCR or
          visual results.
        </InfoCallout>
      ) : null}

      {!canEdit ? (
        <InfoCallout tone="neutral" title="Read-only for your role">
          You can inspect the evidence and record a review decision when permitted, but only the content owner or a role
          with edit access can change the text.
        </InfoCallout>
      ) : null}
    </div>
  );

  const renderVersions = () => (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <SectionHeading
            title="Version history"
            description="Each decision is bound to the exact version reviewed. A newer version makes an older approval stale."
          />
        </div>
        {versionsState.loading && !versions.length ? (
          <div className="p-4">
            <LoadingBlock rows={3} />
          </div>
        ) : versionsState.error ? (
          <div className="p-4">
            <ErrorState message={versionsState.error} retry={versionsState.reload} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...versions].reverse().map((item) => {
              const isCurrent = item.id === version?.id;
              const isApprovedVersion = item.id === document.approved_version_id;
              return (
                <div key={item.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                          isCurrent ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        v{item.version_number}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-800">Version {item.version_number}</p>
                          {isCurrent ? (
                            <Badge className="border-brand-200 bg-brand-50 text-brand-700">Current</Badge>
                          ) : null}
                          {isApprovedVersion ? (
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Approved version</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {item.created_by_name || 'Unknown author'} · {formatDateTime(item.created_at)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {item.change_summary || 'No change summary recorded.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.audit_summary ? (
                        <>
                          <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                            Score {item.audit_summary.overall_score}
                          </Badge>
                          <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                            {item.audit_summary.total_findings} finding{item.audit_summary.total_findings === 1 ? '' : 's'}
                          </Badge>
                          {item.audit_summary.verification_status === 'unable_to_verify' ? (
                            <Badge className="border-amber-200 bg-amber-50 text-amber-800">Inspection limited</Badge>
                          ) : null}
                        </>
                      ) : (
                        <Badge className="border-slate-200 bg-slate-50 text-slate-500">No check recorded</Badge>
                      )}
                      <span className="text-[10px] text-slate-400">
                        {item.page_texts.length ? `${item.page_texts.length} pages` : ''}
                        {item.transcript_segments.length ? ` · ${item.transcript_segments.length} transcript segments` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 pl-11">
                    <span className="truncate font-mono text-[10px] text-slate-400">
                      hash {item.content_hash ? `${item.content_hash.slice(0, 16)}…` : 'not recorded'}
                    </span>
                    {isCurrent ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          setFromVersion(String(item.version_number));
                          setToVersion(String(version?.version_number || item.version_number));
                          setComparison(null);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
                      >
                        <GitCompare className="h-3 w-3" />
                        Compare with current
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {versions.length >= 2 ? (
        <Card className="p-4">
          <SectionHeading
            title="Compare versions"
            description="A line-based text diff of the stored versions. PDF line order reflects extracted text, not visual layout."
          />
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="From" className="w-[120px]">
              <Select value={fromVersion} onChange={(event) => setFromVersion(event.target.value)}>
                {versions.map((item) => (
                  <option key={item.id} value={item.version_number}>
                    Version {item.version_number}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To" className="w-[120px]">
              <Select value={toVersion} onChange={(event) => setToVersion(event.target.value)}>
                {versions.map((item) => (
                  <option key={item.id} value={item.version_number}>
                    Version {item.version_number}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              onClick={() => void compare()}
              loading={compareBusy}
              disabled={!fromVersion || !toVersion || fromVersion === toVersion}
              className="mb-0.5"
            >
              <GitCompare className="h-4 w-4" />
              Compare
            </Button>
          </div>

          {compareError ? <p className="mt-3 text-xs text-rose-600">{compareError}</p> : null}

          {comparison ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Version {comparison.from_version.version_number}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-lg font-semibold tabular-nums text-slate-800">
                      {comparison.from_audit?.overall_score ?? '—'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {comparison.from_audit ? `${comparison.from_audit.total_findings} findings` : 'No check'}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Version {comparison.to_version.version_number}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-lg font-semibold tabular-nums text-slate-800">
                      {comparison.to_audit?.overall_score ?? '—'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {comparison.to_audit ? `${comparison.to_audit.total_findings} findings` : 'No check'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>{comparison.changed ? 'The stored text changed.' : 'The stored text is identical.'}</span>
                <span className="text-emerald-700">+{comparison.added_lines} added</span>
                <span className="text-rose-700">−{comparison.removed_lines} removed</span>
              </div>
              <pre className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-200">
                {comparison.diff.length === 0 ? (
                  <span className="text-slate-400">No line differences in the compared text.</span>
                ) : (
                  comparison.diff.map((line, index) => (
                    <span
                      key={`${index}-${line.slice(0, 12)}`}
                      className={cn(
                        'block whitespace-pre-wrap break-words px-1',
                        line.startsWith('+++') || line.startsWith('---')
                          ? 'text-slate-400'
                          : line.startsWith('+')
                            ? 'bg-emerald-950/60 text-emerald-300'
                            : line.startsWith('-')
                              ? 'bg-rose-950/50 text-rose-300'
                              : line.startsWith('@@')
                                ? 'text-blue-300'
                                : 'text-slate-300'
                      )}
                    >
                      {line || ' '}
                    </span>
                  ))
                )}
              </pre>
              {comparison.diff_truncated ? (
                <p className="text-[10px] text-slate-400">Only the first 300 diff lines are shown.</p>
              ) : null}
              <p className="text-[10px] leading-4 text-slate-400">{comparison.note}</p>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );

  const renderReview = () => (
    <div className="space-y-5">
      {summaryState.data ? (
        <Card className="p-4">
          <SectionHeading
            title={
              <span className="inline-flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-slate-400" />
                Review summary
              </span>
            }
            description="Computed only from this content's stored versions, findings, and decisions."
          />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Version', value: `v${summaryState.data.version.current_version_number}` },
              {
                label: 'Approval',
                value: summaryState.data.version.approval_stale
                  ? 'Stale'
                  : summaryState.data.status.replace('_', ' '),
              },
              { label: 'Unresolved high', value: summaryState.data.audit.unresolved_high_priority },
              { label: 'Awaiting verify', value: summaryState.data.audit.awaiting_verification },
              { label: 'Corrections', value: summaryState.data.audit.corrections_awaiting_review },
              { label: 'Evidence limits', value: summaryState.data.audit.evidence_limitations },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                <dt className="text-[9px] uppercase tracking-wide text-slate-400">{item.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">{item.value}</dd>
              </div>
            ))}
          </div>

          {summaryState.data.outstanding_actions.length ? (
            <ul className="mt-3 space-y-1.5">
              {summaryState.data.outstanding_actions.map((action) => (
                <li
                  key={action.id}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] leading-5"
                >
                  <span className="font-medium text-slate-800">{action.label}</span>
                  <span className="text-slate-500">{action.description}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3 text-[10px] leading-4 text-slate-400">
            {summaryState.data.audit.has_run
              ? `Readiness ${summaryState.data.audit.overall_score}/100 · ${summaryState.data.audit.open_findings} open of ${summaryState.data.audit.total_findings} finding(s).`
              : 'No compliance check has run on the current version.'}{' '}
            {summaryState.data.data_sources[0]}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="p-4">
          <SectionHeading
            title="Review conversation"
            description={`${comments.length} comment${comments.length === 1 ? '' : 's'} stored with this content. Internal notes are visible only to reviewer roles.`}
          />
          {commentsState.error ? (
            <div className="mt-3">
              <ErrorState
                message={`Comments could not be loaded. ${commentsState.error}`}
                retry={commentsState.reload}
              />
            </div>
          ) : commentsState.loading && !comments.length ? (
            <div className="mt-3">
              <LoadingBlock rows={2} />
            </div>
          ) : comments.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-5 text-center">
              <MessageSquare className="mx-auto h-5 w-5 text-slate-300" />
              <p className="mt-1 text-xs font-medium text-slate-600">No comments yet</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {can('review.comment') ? 'Leave a shared note or an internal reviewer note.' : 'Comments from reviewers will appear here.'}
              </p>
            </div>
          ) : (
            <ol className="mt-3 space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-800">{comment.author_name}</span>
                    {comment.author_role ? (
                      <Badge className="border-slate-200 bg-slate-50 text-slate-500">{ROLE_LABEL[comment.author_role as keyof typeof ROLE_LABEL] || comment.author_role}</Badge>
                    ) : null}
                    {comment.visibility === 'internal' ? (
                      <Badge className="border-amber-200 bg-amber-50 text-amber-800">Internal note</Badge>
                    ) : null}
                    <span className="ml-auto text-[10px] text-slate-400">{relativeTime(comment.created_at)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                    {comment.comment_text}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">Version {versions.find((item) => item.id === comment.version_id)?.version_number || '—'}</p>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <Field label="Add a comment" htmlFor="review-comment" error={commentFieldError}>
              <Textarea
                id="review-comment"
                rows={3}
                value={commentText}
                onChange={(event) => {
                  setCommentText(event.target.value);
                  if (commentFieldError) setCommentFieldError(null);
                }}
                placeholder="Reference the exact version and evidence…"
                maxLength={5000}
                aria-invalid={Boolean(commentFieldError || commentError)}
                aria-describedby={
                  [
                    commentFieldError ? 'review-comment-error' : null,
                    commentError ? 'review-comment-server-error' : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
            </Field>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {can('review.queue') ? (
                <Select
                  value={commentVisibility}
                  onChange={(event) => setCommentVisibility(event.target.value as 'shared' | 'internal')}
                  aria-label="Comment visibility"
                  className="w-auto"
                >
                  <option value="shared">Shared with creator</option>
                  <option value="internal">Internal reviewer note</option>
                </Select>
              ) : (
                <p className="text-[10px] text-slate-400">Your comment is shared with the creator and reviewers.</p>
              )}
              <Button
                size="sm"
                className="min-h-11 sm:min-h-8"
                onClick={() => void addComment()}
                loading={commentBusy}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Post comment
              </Button>
            </div>
            {commentError ? (
              <p id="review-comment-server-error" role="alert" className="mt-2 text-xs text-rose-600">
                {commentError}
              </p>
            ) : null}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-4">
            <SectionHeading
              title="Decision record"
              description="Decisions are attached to a specific version and remain in the audit history."
            />
            {decisionsState.error ? (
              <div className="mt-3">
                <ErrorState
                  message={`Decisions could not be loaded. ${decisionsState.error}`}
                  retry={decisionsState.reload}
                />
              </div>
            ) : decisionsState.loading && !decisions.length ? (
              <div className="mt-3">
                <LoadingBlock rows={2} />
              </div>
            ) : decisions.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No reviewer decision has been recorded yet.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {decisions.map((decision) => (
                  <li key={decision.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={DECISION_STYLE[decision.decision]}>{DECISION_LABEL[decision.decision]}</Badge>
                      <span className="text-xs font-medium text-slate-700">{decision.reviewer_name}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Version {decision.version_number ?? '—'} · {formatDateTime(decision.created_at)}
                    </p>
                    {decision.feedback ? (
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                        {decision.feedback}
                      </p>
                    ) : null}
                    {typeof decision.decision_metadata?.is_latest_version === 'boolean' &&
                    !decision.decision_metadata.is_latest_version ? (
                      <p className="mt-1 text-[10px] text-amber-700">This decision applies to a superseded version.</p>
                    ) : null}
                    {typeof decision.decision_metadata?.score_at_decision === 'number' ? (
                      <p className="mt-1 text-[10px] text-slate-400">
                        Score at decision: {decision.decision_metadata.score_at_decision}/100 ·{' '}
                        {String(decision.decision_metadata.findings_at_decision ?? '—')} findings
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="p-4">
            <SectionHeading title="Approval state" />
            <dl className="mt-2">
              <DetailRow label="Current status">
                <StatusBadge status={document.status} />
              </DetailRow>
              <DetailRow label="Approved version">
                {approvedVersion ? `Version ${approvedVersion.version_number}` : 'No approved version'}
              </DetailRow>
              <DetailRow label="Latest decision">
                {currentDecision
                  ? `${DECISION_LABEL[currentDecision.decision]} · v${currentDecision.version_number}`
                  : 'None'}
              </DetailRow>
              <DetailRow label="Submitted">
                {document.submitted_at ? `${formatDateTime(document.submitted_at)}` : 'Not submitted'}
              </DetailRow>
            </dl>
            {document.approval_stale ? (
              <InfoCallout tone="warning" className="mt-3" title="This approval is stale">
                Version {approvedVersion?.version_number ?? '—'} was approved, but version{' '}
                {document.current_version_number} is now current. The old approval remains in history but does not apply
                to the latest content.
              </InfoCallout>
            ) : approvedVersion ? (
              <InfoCallout tone="success" className="mt-3" title="Current version is approved">
                Version {approvedVersion.version_number} has an approval decision from a reviewer.
              </InfoCallout>
            ) : null}

            {canDecide ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {version ? (
                  <>
                    <Field
                      label="Version being decided"
                      htmlFor="review-decision-version"
                      hint="The decision is stored against this exact version. A newer version makes it stale."
                    >
                      <Select
                        id="review-decision-version"
                        value={decisionVersionId || version.id}
                        onChange={(event) => setDecisionVersionId(event.target.value)}
                      >
                        {versions.map((item) => (
                          <option key={item.id} value={item.id}>
                            Version {item.version_number}
                            {item.id === version.id ? ' · current' : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {decisionVersion && decisionVersion.id !== version.id ? (
                      <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-800">
                        You selected a superseded version. The decision will be recorded against it without changing the
                        document’s current status.
                      </p>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      <Button
                        className="min-h-11 w-full bg-emerald-600 hover:bg-emerald-700 sm:min-h-9"
                        onClick={() => openDecision('approved')}
                        disabled={!run}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve version {decisionVersion?.version_number || version.version_number}
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-11 w-full sm:min-h-9"
                        onClick={() => openDecision('changes_requested')}
                      >
                        <Undo2 className="h-4 w-4" />
                        Request changes
                      </Button>
                      <Button
                        variant="danger"
                        className="min-h-11 w-full sm:min-h-9"
                        onClick={() => openDecision('rejected')}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject version {decisionVersion?.version_number || version.version_number}
                      </Button>
                    </div>
                    {!run ? (
                      <p className="mt-2 text-[10px] leading-4 text-amber-700">
                        Run a check before approving this version.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-slate-500">There is no version to decide on.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-400">
                Decisions are recorded by reviewer and organization administrator roles.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );

  const renderActivity = () => (
    <Card className="p-4">
      <SectionHeading
        title="Audit history"
        description="Every stored event for this content: creation, checks, revisions, comments, submissions, and decisions."
      />
      {eventsState.loading && !events.length ? (
        <div className="mt-3">
          <LoadingBlock rows={4} />
        </div>
      ) : eventsState.error ? (
        <div className="mt-3">
          <ErrorState message={eventsState.error} retry={eventsState.reload} />
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={History} title="No history events" className="mt-3 border-0 bg-slate-50/50" />
      ) : (
        <ol className="mt-4 space-y-0">
          {[...events].reverse().map((event, index) => (
            <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < events.length - 1 ? (
                <span className="absolute left-[13px] top-6 h-full w-px bg-slate-200" aria-hidden />
              ) : null}
              <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
                {event.event_type.includes('decision') ? (
                  <BadgeCheck className="h-3.5 w-3.5" />
                ) : event.event_type.includes('comment') ? (
                  <MessageSquare className="h-3.5 w-3.5" />
                ) : event.event_type.includes('audit') ? (
                  <ShieldCheck className="h-3.5 w-3.5" />
                ) : event.event_type.includes('version') ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <History className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-medium text-slate-800">{titleCase(event.event_type)}</span>
                  {event.version_id ? (
                    <span className="text-[10px] text-slate-400">
                      v{versions.find((item) => item.id === event.version_id)?.version_number ?? '—'}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[10px] text-slate-400">{formatDateTime(event.created_at)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                  {event.description}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">{event.user_name}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );

  const renderProvenance = () => {
    if (provenanceState.loading && !provenanceState.data) {
      return <LoadingBlock rows={3} />;
    }
    if (provenanceState.error || !provenanceState.data) {
      return <ErrorState message={provenanceState.error || 'No provenance record was returned.'} retry={provenanceState.reload} />;
    }
    const provenance = provenanceState.data;
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-4">
          <SectionHeading
            title="Content provenance"
            description="Hashes are recomputed from the stored text and page content to detect changes to the version record."
          />
          <dl className="mt-2">
            <DetailRow label="Current version">v{provenance.current_version_number}</DetailRow>
            <DetailRow label="Verification status">{verificationBadge(provenance.verification_status)}</DetailRow>
            <DetailRow label="Approved by">{provenance.approved_by || 'No approval on this version'}</DetailRow>
            <DetailRow label="Approved at">{provenance.approved_at ? formatDateTime(provenance.approved_at) : '—'}</DetailRow>
          </dl>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recomputed SHA-256</p>
              <CopyButton value={provenance.file_hash} label="Copy hash" />
            </div>
            <p className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-600">{provenance.file_hash}</p>
            {provenance.previous_version_hash ? (
              <p className="mt-2 break-all font-mono text-[10px] leading-4 text-slate-400">
                Previous: {provenance.previous_version_hash}
              </p>
            ) : null}
          </div>
          {provenance.is_tampered_or_changed ? (
            <InfoCallout tone="danger" className="mt-3" title="Stored hash does not match">
              The version’s recorded hash differs from the recomputed text hash. This indicates the stored text was
              changed outside the version workflow, or the record is incomplete. Do not treat this version as verified.
            </InfoCallout>
          ) : (
            <InfoCallout tone="success" className="mt-3" title="Stored hash matches the current text">
              The recomputed hash matches the hash recorded with this version. This is an integrity check of the stored
              text, not proof of factual accuracy.
            </InfoCallout>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeading title="Provenance timeline" description="The stored event trail, oldest first." />
          {provenance.audit_history_timeline.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No timeline events are stored.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {provenance.audit_history_timeline.map((event) => (
                <li key={event.id} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-700">{titleCase(event.event_type)}</p>
                    <p className="text-[11px] leading-5 text-slate-500">{event.description}</p>
                    <p className="text-[10px] text-slate-400">
                      {event.actor} · {formatDateTime(event.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        backTo="/content"
        backLabel="Content"
        eyebrow={`${ASSET_TYPE_LABEL[document.asset_type]} · ${CONTENT_TYPE_LABEL[document.content_type as ContentType] || document.content_type}`}
        title={document.title}
        description={
          <>
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={document.status} />
              {run ? <RiskBadge risk={run.risk_level} /> : null}
              {run ? verificationBadge(run.verification_status) : null}
              <Badge className="border-slate-200 bg-white text-slate-600">Version {document.current_version_number}</Badge>
              {document.is_demo ? (
                <Badge className="border-amber-200 bg-amber-50 text-amber-800">Demo record</Badge>
              ) : null}
              {document.approval_stale ? (
                <Badge className="border-amber-200 bg-amber-50 text-amber-800">Approval stale</Badge>
              ) : null}
              {campaignState.data ? (
                <button
                  type="button"
                  onClick={() => navigate(`/campaigns/${campaignState.data?.id}`)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {campaignState.data.name}
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              ) : null}
            </span>
            <span className="mt-1.5 block text-xs text-slate-400">
              Created by {document.created_by_name || 'an unknown user'} · updated {relativeTime(document.updated_at)} ·{' '}
              {document.versions_count} version{document.versions_count === 1 ? '' : 's'}
            </span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => askAbout()}>
              <Sparkles className="h-4 w-4" />
              Ask about this
            </Button>
            {canEdit && version ? (
              <Button
                variant="secondary"
                onClick={() => void rerun()}
                loading={rerunning}
                disabled={saving}
              >
                <RefreshCw className="h-4 w-4" />
                Re-run check
              </Button>
            ) : null}
            {canOpenDecision ? (
              <Button
                variant="secondary"
                onClick={() => setTab('review')}
                className="min-h-11 sm:min-h-9"
              >
                <ClipboardCheck className="h-4 w-4" />
                Review decision
              </Button>
            ) : null}
            {canSubmit ? (
              <Button onClick={() => setSubmitOpen(true)} disabled={!run || submitting}>
                <Send className="h-4 w-4" />
                Submit for review
              </Button>
            ) : null}
          </>
        }
      />

      {actionError ? (
        <div className="mb-4" role="alert">
          <InfoCallout tone="danger" title="Action could not be completed">
            {actionError}
          </InfoCallout>
        </div>
      ) : null}

      {campaignState.error ? (
        <div className="mb-4">
          <InfoCallout tone="warning" title="Campaign details could not be loaded">
            The content is still available, but its campaign badge is missing. {campaignState.error}{' '}
            <button
              type="button"
              onClick={campaignState.reload}
              className="font-medium text-amber-900 underline underline-offset-2"
            >
              Retry
            </button>
          </InfoCallout>
        </div>
      ) : null}

      {document.status === 'changes_requested' && currentDecision?.feedback ? (
        <div className="mb-4">
          <InfoCallout tone="warning" title="A reviewer requested changes">
            {currentDecision.feedback}
            <span className="mt-1 block text-[11px] text-amber-800/80">
              Decision on version {currentDecision.version_number} by {currentDecision.reviewer_name}. Revise the content
              to create a new version before resubmitting.
            </span>
          </InfoCallout>
        </div>
      ) : null}

      {document.status === 'rejected' && currentDecision?.feedback ? (
        <div className="mb-4">
          <InfoCallout tone="danger" title="This content was rejected">
            {currentDecision.feedback}
            <span className="mt-1 block text-[11px] text-rose-800/80">
              Rejected on version {currentDecision.version_number} by {currentDecision.reviewer_name}.
            </span>
          </InfoCallout>
        </div>
      ) : null}

      {document.approval_stale ? (
        <div className="mb-4">
          <InfoCallout tone="warning" title="The approval does not cover the latest version">
            Version {approvedVersion?.version_number ?? '—'} was approved, but version {document.current_version_number} is
            current. Approve the latest version again if it is ready.
          </InfoCallout>
        </div>
      ) : null}

      {editorDirty && canEdit ? (
        <div className="mb-4">
          <InfoCallout tone="warning" title="Unsaved draft changes">
            Your edits to version {version?.version_number} are not saved. Return to the editor to review them, then save
            a new version to re-check the content.{' '}
            <button
              type="button"
              onClick={() => setTab('content')}
              className="font-medium text-amber-900 underline underline-offset-2"
            >
              Return to the editor
            </button>
          </InfoCallout>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Tabs
            tabs={[
              { id: 'findings', label: 'Findings', count: findings.length },
              { id: 'content', label: 'Content & evidence' },
              { id: 'versions', label: 'Versions', count: versions.length },
              { id: 'review', label: 'Review', count: comments.length },
              { id: 'activity', label: 'Activity' },
              { id: 'provenance', label: 'Record' },
            ]}
            active={tab}
            onChange={setTab}
            idBase="document-tabs"
            label="Content detail"
            className="rounded-t-xl bg-white"
          />
          <div
            id="document-tabs-panel"
            role="tabpanel"
            aria-labelledby={`document-tabs-tab-${tab}`}
            tabIndex={0}
            className="min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          >
            {tab === 'findings'
              ? renderFindings()
              : tab === 'content'
                ? renderContent()
                : tab === 'versions'
                  ? renderVersions()
                  : tab === 'review'
                    ? renderReview()
                    : tab === 'activity'
                      ? renderActivity()
                      : renderProvenance()}
          </div>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Latest check</p>
                {run ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(run.created_at)} · {run.execution_time_ms} ms
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-500">No check recorded</p>
                )}
              </div>
              {run ? <ScoreRing score={run.overall_score} label="of 100" /> : null}
            </div>

            {run ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2 border-y border-slate-100 py-2.5 text-center">
                  <div>
                    <p className="text-base font-semibold tabular-nums text-slate-900">{findings.length}</p>
                    <p className="text-[9px] uppercase tracking-wide text-slate-400">Findings</p>
                  </div>
                  <div>
                    <p className="text-base font-semibold tabular-nums text-slate-900">{openFindings.length}</p>
                    <p className="text-[9px] uppercase tracking-wide text-slate-400">Open</p>
                  </div>
                  <div>
                    <p className={cn('text-base font-semibold tabular-nums', highOpen ? 'text-rose-700' : 'text-slate-900')}>
                      {highOpen}
                    </p>
                    <p className="text-[9px] uppercase tracking-wide text-slate-400">High/critical</p>
                  </div>
                </div>

                {run.risk_factors.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Score breakdown</p>
                    {run.risk_factors.map((factor) => (
                      <div
                        key={`${factor.label}-${factor.severity}`}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="min-w-0 truncate text-slate-600">
                          {factor.label}
                          <span className="ml-1 text-slate-400">
                            · {factor.severity}
                            {factor.count > 1 ? ` × ${factor.count}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500">−{factor.deduction}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] leading-5 text-slate-500">
                    No point deductions were recorded for this check.
                  </p>
                )}

                <details className="mt-3 border-t border-slate-100 pt-2.5">
                  <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-500 hover:text-slate-800">
                    How this score is produced
                  </summary>
                  <div className="mt-1.5 space-y-1 text-[10px] leading-4 text-slate-500">
                    <p>{run.score_method || 'Each open finding deducts points from 100 based on category and severity.'}</p>
                    <p>Engine: {run.model_used}</p>
                    <p>Audit coverage: {VERIFICATION_LABEL[run.verification_status]}</p>
                    <p>Coverage describes what the automated checks could inspect. It is not an approval decision.</p>
                    <p>This is a workflow aid, not a legal risk rating or an external benchmark.</p>
                  </div>
                </details>
              </>
            ) : (
              <div className="mt-3">
                <p className="text-[11px] leading-5 text-slate-500">
                  Run a check to compare this version against the active workspace rules and approved facts.
                </p>
                {canEdit ? (
                  <Button size="sm" className="mt-2 w-full" onClick={() => void rerun()} loading={rerunning}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Run check
                  </Button>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionHeading title="Approval & submission" />
            <dl className="mt-2">
              <DetailRow label="Status">
                <StatusBadge status={document.status} />
              </DetailRow>
              <DetailRow label="Submitted">
                {document.submitted_at ? formatDateTime(document.submitted_at) : 'Not submitted'}
              </DetailRow>
              <DetailRow label="Approved version">
                {approvedVersion ? `v${approvedVersion.version_number}` : 'None'}
              </DetailRow>
              <DetailRow label="Reviewer">
                {currentDecision?.reviewer_name || '—'}
              </DetailRow>
            </dl>
            {canSubmit ? (
              <Button className="mt-3 w-full" size="sm" onClick={() => setSubmitOpen(true)} disabled={!run}>
                <Send className="h-3.5 w-3.5" />
                Submit version {document.current_version_number}
              </Button>
            ) : document.status === 'in_review' ? (
              <p className="mt-3 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] leading-4 text-blue-800">
                Version {document.current_version_number} is waiting for a reviewer decision.
              </p>
            ) : document.status === 'approved' && !document.approval_stale ? (
              <p className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-4 text-emerald-800">
                The current version is approved.
              </p>
            ) : canEdit && !run ? (
              <p className="mt-3 text-[11px] leading-4 text-slate-400">
                A check must run before this content can be submitted.
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <SectionHeading title="Details" />
            <dl className="mt-2">
              <DetailRow label="Owner">{document.created_by_name || '—'}</DetailRow>
              <DetailRow label="Format">{ASSET_TYPE_LABEL[document.asset_type]}</DetailRow>
              <DetailRow label="Content type">
                {CONTENT_TYPE_LABEL[document.content_type as ContentType] || titleCase(document.content_type)}
              </DetailRow>
              <DetailRow label="Versions">{document.versions_count}</DetailRow>
              <DetailRow label="Comments">{document.comments_count}</DetailRow>
              <DetailRow label="Created">{formatDateTime(document.created_at)}</DetailRow>
              {document.source_url ? (
                <DetailRow label="Source">
                  <a
                    href={document.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline"
                  >
                    Open link
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </DetailRow>
              ) : null}
              {version?.content_hash ? (
                <DetailRow label="Hash">
                  <span className="flex items-center justify-end gap-1">
                    <span className="font-mono text-[10px]">{version.content_hash.slice(0, 12)}…</span>
                    <CopyButton value={version.content_hash} label="" className="text-slate-400" />
                  </span>
                </DetailRow>
              ) : null}
            </dl>
            <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-400">
              Role: {ROLE_LABEL[role]}. Data access and edits are enforced by the API for this role.
            </p>
          </Card>

          {document.asset_type === 'video' && !document.file_id ? (
            <InfoCallout tone="neutral" title="Transcript-only record">
              No video file was stored. Findings are timestamp-linked to the supplied transcript; the player cannot be
              shown and no visual or audio analysis was performed.
            </InfoCallout>
          ) : null}

          {document.asset_type === 'pdf' && uploadState.data?.extraction_status === 'needs_ocr' ? (
            <InfoCallout tone="warning" title="This PDF needs OCR">
              <p>{uploadState.data.extraction_message}</p>
              <p className="mt-1">No OCR service is configured, so page-linked automated findings are unavailable.</p>
            </InfoCallout>
          ) : null}

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => askAbout()}
          >
            <Sparkles className="h-4 w-4" />
            Ask Inkloom about this content
          </Button>
        </aside>
      </div>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Submit for brand review"
        description={`Submit version ${document.current_version_number} with the current check attached?`}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              className="min-h-11 sm:min-h-9"
              onClick={() => setSubmitOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="min-h-11 sm:min-h-9"
              onClick={() => void submitForReview()}
              loading={submitting}
            >
              <Send className="h-4 w-4" />
              Submit for review
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Note for the reviewer" htmlFor="submit-notes">
            <Textarea
              id="submit-notes"
              rows={3}
              value={submitNotes}
              onChange={(event) => setSubmitNotes(event.target.value)}
              maxLength={2000}
            />
          </Field>
          <p className="text-[11px] leading-5 text-slate-500">
            The reviewer sees the findings and the stored evidence for version {document.current_version_number}. If you
            create another version after submitting, this submission no longer applies to the latest content.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(decisionOpen)}
        onClose={() => setDecisionOpen(null)}
        title={decisionTitle}
        description={
          decisionVersion
            ? `Version ${decisionVersion.version_number} · ${decisionVersion.id === version?.id ? 'current version' : 'superseded version'}`
            : undefined
        }
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              className="min-h-11 sm:min-h-9"
              onClick={() => setDecisionOpen(null)}
              disabled={decisionBusy}
            >
              Cancel
            </Button>
            <Button
              variant={decisionOpen === 'rejected' ? 'danger' : 'primary'}
              className="min-h-11 sm:min-h-9"
              onClick={() => void recordDecision()}
              loading={decisionBusy}
            >
              {decisionRecordLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span className="text-xs text-slate-500">Version being decided</span>
            <span className="text-xs font-medium text-slate-800">
              Version {decisionVersion?.version_number ?? '—'}
              {decisionVersion?.id === version?.id ? ' · current' : ' · superseded'}
            </span>
          </div>
          {decisionVersion && decisionVersion.id !== version?.id ? (
            <InfoCallout tone="warning">
              This is not the current version. The decision will be stored against version {decisionVersion.version_number}{' '}
              but will not change the document’s current status.
            </InfoCallout>
          ) : null}
          <Field
            label={decisionOpen === 'approved' ? 'Feedback (optional)' : 'Feedback'}
            htmlFor="decision-feedback"
            required={decisionOpen !== 'approved'}
            hint={
              decisionOpen === 'changes_requested' ? (
                <span id="decision-feedback-hint">
                  Tell the creator exactly what to revise before resubmitting.
                </span>
              ) : decisionOpen === 'rejected' ? (
                <span id="decision-feedback-hint">Explain why this version cannot be approved.</span>
              ) : undefined
            }
          >
            <Textarea
              id="decision-feedback"
              rows={4}
              value={decisionFeedback}
              onChange={(event) => {
                setDecisionFeedback(event.target.value);
                if (decisionFeedbackError) setDecisionFeedbackError(null);
              }}
              placeholder={
                decisionOpen === 'approved'
                  ? 'Approved as checked…'
                  : 'Reference the finding, evidence, and required change…'
              }
              maxLength={5000}
              autoFocus={decisionOpen !== 'approved'}
              aria-invalid={Boolean(decisionFeedbackError)}
              aria-describedby={
                [
                  decisionOpen !== 'approved' ? 'decision-feedback-hint' : null,
                  decisionFeedbackError ? 'decision-feedback-error' : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
          </Field>
          {decisionFeedbackError ? (
            <p id="decision-feedback-error" role="alert" className="text-xs text-rose-600">
              {decisionFeedbackError}
            </p>
          ) : null}
          <p className="text-[10px] leading-4 text-slate-400">
            This decision is recorded under {session?.active_user.full_name || ROLE_LABEL[role]} and stays in the audit
            history. It does not alter the findings themselves.
          </p>
          {decisionError ? (
            <p role="alert" className="text-xs text-rose-600">
              {decisionError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
