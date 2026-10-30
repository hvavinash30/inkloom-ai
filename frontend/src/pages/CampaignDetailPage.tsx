import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  FileImage,
  FileText,
  Film,
  Layers,
  Link2,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  Swords,
  UserRoundCheck,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate, useAsync } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  InfoCallout,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  ScoreMeter,
  SectionHeading,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  cn,
} from '../components/ui';
import { ASSET_TYPE_LABEL, CONTENT_TYPE_LABEL, formatDate, formatDateTime, relativeTime, titleCase } from '../lib/format';
import type {
  AssetType,
  CampaignConflict,
  CampaignGraph,
  ContentDocument,
  ReadinessCheck,
} from '../types';

function AssetGlyph({ type }: { type: AssetType }) {
  const Icon = type === 'pdf' ? FileText : type === 'image' ? FileImage : type === 'video' ? Film : FileText;
  return <Icon className="h-4 w-4" />;
}

const READINESS_STYLE: Record<string, { wrap: string; label: string }> = {
  ready: { wrap: 'border-emerald-400/25 bg-emerald-400/10', label: 'text-emerald-200' },
  blocked: { wrap: 'border-rose-400/25 bg-rose-500/10', label: 'text-rose-200' },
  needs_attention: { wrap: 'border-amber-400/25 bg-amber-400/10', label: 'text-amber-200' },
  no_assets: { wrap: 'border-white/10 bg-white/[0.035]', label: 'text-slate-100' },
};

function CheckStatusIcon({ status }: { status: ReadinessCheck['status'] }) {
  if (status === 'passed') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />;
  if (status === 'needs_attention') return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />;
  if (status === 'manual') return <UserRoundCheck className="h-4 w-4 shrink-0 text-slate-400" />;
  return <CircleDot className="h-4 w-4 shrink-0 text-slate-300" />;
}

function readinessLabel(result?: string | null) {
  if (result === 'ready') return 'Ready';
  if (result === 'blocked') return 'Blocked';
  if (result === 'needs_attention') return 'Needs attention';
  if (result === 'no_assets') return 'No assets yet';
  return 'Not assessed';
}

export function CampaignDetailPage({ id }: { id: string }) {
  const { can } = useSession();
  const { toast } = useToast();
  const { data: campaign, loading, error, reload, setData } = useAsync(() => api.getCampaign(id), [id]);
  const { data: allDocuments } = useAsync(() => api.listDocuments({ limit: 200 }), []);

  const [tab, setTab] = useState('assets');
  const [detecting, setDetecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAudience, setEditAudience] = useState('');
  const [editLaunch, setEditLaunch] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachId, setAttachId] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [conflictTarget, setConflictTarget] = useState<CampaignConflict | null>(null);
  const [resolvedValue, setResolvedValue] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [graph, setGraph] = useState<CampaignGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const openEdit = () => {
    if (!campaign) return;
    setEditName(campaign.name);
    setEditDescription(campaign.description || '');
    setEditAudience(campaign.target_audience || '');
    setEditLaunch(campaign.launch_target ? new Date(campaign.launch_target).toISOString().slice(0, 10) : '');
    setEditStatus(campaign.status);
    setEditError(null);
    setEditOpen(true);
  };

  const openResolve = (conflict: CampaignConflict) => {
    setConflictTarget(conflict);
    setResolvedValue(conflict.approved_value || conflict.asset_a_value);
    setResolutionNotes('');
    setResolveError(null);
  };

  const attachedIds = useMemo(() => new Set((campaign?.assets || []).map((asset) => asset.id)), [campaign]);
  const attachable = useMemo(
    () => (allDocuments || []).filter((doc: ContentDocument) => !attachedIds.has(doc.id)),
    [allDocuments, attachedIds]
  );

  useEffect(() => {
    if (tab !== 'map' || graph || !campaign) return;
    let cancelled = false;
    setGraphLoading(true);
    setGraphError(null);
    api
      .getCampaignGraph(id)
      .then((payload) => {
        if (!cancelled) setGraph(payload);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setGraphError(caught instanceof ApiError ? caught.detail : 'The claim map could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setGraphLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, graph, campaign, id]);

  if (loading) {
    return (
      <div>
        <div className="mb-6 h-24 animate-pulse rounded-xl border border-white/[0.07] bg-white/[0.04]" />
        <LoadingBlock rows={4} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div>
        <PageHeader backTo="/campaigns" backLabel="Campaigns" title="Campaign" />
        <ErrorState message={error || 'This campaign could not be found.'} retry={reload} />
      </div>
    );
  }

  const unresolved = campaign.conflicts.filter((conflict) => conflict.status === 'unresolved');
  const readiness = campaign.readiness;
  const readinessTone = READINESS_STYLE[readiness?.result || 'no_assets'] || READINESS_STYLE.no_assets;
  const approvedAssets = campaign.assets.filter((asset) => asset.status === 'approved').length;

  const detect = async () => {
    setDetecting(true);
    setActionError(null);
    try {
      const updated = await api.detectConflicts(id);
      setData(updated);
      setGraph(null);
      const open = updated.conflicts.filter((conflict) => conflict.status === 'unresolved').length;
      toast(
        open === 0
          ? 'Cross-asset check completed. No unresolved conflicts were found.'
          : `Cross-asset check completed. ${open} unresolved conflict${open === 1 ? '' : 's'} found.`,
        open === 0 ? 'success' : 'info'
      );
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.detail : 'The conflict check could not be completed.');
    } finally {
      setDetecting(false);
    }
  };

  const saveEdit = async () => {
    if (!editName.trim()) {
      setEditError('Enter a campaign name.');
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await api.updateCampaign(id, {
        name: editName.trim(),
        description: editDescription.trim(),
        target_audience: editAudience.trim(),
        launch_target: editLaunch ? new Date(`${editLaunch}T00:00:00Z`).toISOString() : null,
        status: editStatus,
      });
      setData(updated);
      setEditOpen(false);
      toast('Campaign details updated.', 'success');
    } catch (caught) {
      setEditError(caught instanceof ApiError ? caught.detail : 'The campaign could not be updated.');
    } finally {
      setEditBusy(false);
    }
  };

  const attach = async () => {
    if (!attachId) {
      setAttachError('Select a content item to attach.');
      return;
    }
    setAttachBusy(true);
    setAttachError(null);
    try {
      const updated = await api.attachAsset(id, attachId);
      setData(updated);
      setAttachOpen(false);
      setAttachId('');
      setGraph(null);
      toast('Content attached to the campaign. Run the cross-asset check next.', 'success');
    } catch (caught) {
      setAttachError(caught instanceof ApiError ? caught.detail : 'The content could not be attached.');
    } finally {
      setAttachBusy(false);
    }
  };

  const resolve = async () => {
    if (!conflictTarget) return;
    if (!resolvedValue.trim()) {
      setResolveError('Enter the agreed value.');
      return;
    }
    if (resolutionNotes.trim().length < 3) {
      setResolveError('Add a short note explaining the decision.');
      return;
    }
    setResolveBusy(true);
    setResolveError(null);
    try {
      await api.resolveConflict(conflictTarget.id, {
        resolved_value: resolvedValue.trim(),
        resolution_notes: resolutionNotes.trim(),
      });
      setConflictTarget(null);
      setGraph(null);
      toast('Conflict resolution recorded. Update the affected asset text separately, then re-check.', 'success');
      reload();
    } catch (caught) {
      setResolveError(caught instanceof ApiError ? caught.detail : 'The conflict could not be resolved.');
    } finally {
      setResolveBusy(false);
    }
  };

  const statusClass =
    campaign.status === 'active'
      ? 'border-blue-400/25 bg-blue-500/10 text-blue-200'
      : campaign.status === 'completed'
        ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
        : 'border-white/10 bg-white/[0.035] text-slate-300';

  return (
    <div>
      <PageHeader
        backTo="/campaigns"
        backLabel="All campaigns"
        eyebrow="Campaign governance"
        title={campaign.name}
        description={campaign.description || 'No campaign brief has been recorded yet.'}
        actions={
          <>
            {can('campaign.manage') ? (
              <Button variant="secondary" onClick={openEdit}>
                <PencilLine className="h-4 w-4" />
                Edit campaign
              </Button>
            ) : null}
            {can('campaign.create') ? (
              <Button variant="secondary" onClick={() => setAttachOpen(true)}>
                <Plus className="h-4 w-4" />
                Attach content
              </Button>
            ) : null}
            {can('campaign.resolve') ? (
              <Button onClick={detect} loading={detecting}>
                <RefreshCw className="h-4 w-4" />
                Check cross-asset claims
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className={cn('rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', statusClass)}>
          {titleCase(campaign.status)}
        </span>
        {campaign.is_demo ? <Badge className="border-amber-400/25 bg-amber-400/10 text-amber-200">Demo campaign</Badge> : null}
        <span>Owned by {campaign.created_by_name || 'the workspace'}</span>
        <span>·</span>
        <span>{campaign.assets_count} asset{campaign.assets_count === 1 ? '' : 's'}</span>
        <span>·</span>
        <span>Updated {relativeTime(campaign.updated_at)}</span>
      </div>

      {actionError ? (
        <div className="mt-4">
          <InfoCallout tone="danger" title="Action could not be completed">
            {actionError}
          </InfoCallout>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <div className={cn('rounded-2xl border p-5', readinessTone.wrap)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={cn('text-sm font-semibold', readinessTone.label)}>
                  {readinessLabel(readiness?.result)}
                </p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                  {readiness?.summary || 'Attach assets and run a check to assess campaign readiness.'}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full bg-[#0b1224]/70 px-2.5 py-1 text-[11px] font-medium',
                  readiness?.result === 'ready'
                    ? 'text-emerald-300'
                    : readiness?.result === 'blocked'
                      ? 'text-rose-300'
                      : readiness?.result === 'needs_attention'
                        ? 'text-amber-300'
                        : 'text-slate-300'
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Launch readiness
              </span>
            </div>
            {readiness?.checks?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {readiness.checks.map((check) => (
                  <div key={check.key} className="flex items-start gap-2.5 rounded-lg border border-white/20 bg-[#0b1224]/70 p-3">
                    <CheckStatusIcon status={check.status} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200">{check.label}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {readiness?.disclaimer ? (
              <p className="mt-3 text-[10px] leading-4 text-slate-400">{readiness.disclaimer}</p>
            ) : null}
          </div>

          <Card className="overflow-hidden">
            <Tabs
              tabs={[
                { id: 'assets', label: 'Assets', count: campaign.assets.length },
                { id: 'conflicts', label: 'Conflicts', count: campaign.conflicts.length },
                { id: 'map', label: 'Claim map' },
              ]}
              active={tab}
              onChange={setTab}
              idBase="campaign-tabs"
              label="Campaign detail"
              className="px-3 pt-1"
            />

            <div
              id="campaign-tabs-panel"
              role="tabpanel"
              aria-labelledby={`campaign-tabs-tab-${tab}`}
              tabIndex={0}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
            >
            {tab === 'assets' ? (
              campaign.assets.length === 0 ? (
                <div className="p-5">
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.035] px-6 py-10 text-center">
                    <Layers className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-200">No assets attached</p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-400">
                      Attach content so Inkloom can compare its stored claims with other campaign assets and the
                      approved brand facts.
                    </p>
                    {can('campaign.create') ? (
                      <Button size="sm" className="mt-4" onClick={() => setAttachOpen(true)}>
                        <Plus className="h-4 w-4" />
                        Attach content
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.08]">
                  {campaign.assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_130px_120px_110px] md:items-center"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/content/${asset.id}`)}
                        className="group flex min-w-0 items-start gap-2.5 text-left"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-slate-400">
                          <AssetGlyph type={asset.asset_type} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-200 group-hover:text-brand-200">
                            {asset.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                            <span>{ASSET_TYPE_LABEL[asset.asset_type]}</span>
                            <span>·</span>
                            <span>v{asset.current_version_number}</span>
                            {asset.approval_stale ? (
                              <>
                                <span>·</span>
                                <span className="font-medium text-amber-300">Approval stale</span>
                              </>
                            ) : null}
                            {asset.created_by_name ? (
                              <>
                                <span>·</span>
                                <span>{asset.created_by_name}</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center justify-between gap-2 md:block">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Status</span>
                        <StatusBadge status={asset.status} />
                      </div>
                      <div className="flex items-center justify-between gap-2 md:block">
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Score</span>
                        <ScoreMeter score={asset.latest_score} />
                      </div>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/content/${asset.id}`)}>
                          Open
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {tab === 'conflicts' ? (
              campaign.conflicts.length === 0 ? (
                <div className="p-5">
                  <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-6 py-10 text-center">
                    <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-300" />
                    <p className="mt-3 text-sm font-semibold text-emerald-100">No conflicts recorded</p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-emerald-200/80">
                      {can('campaign.resolve')
                        ? 'Run a cross-asset check to compare stored prices, SLA figures, and other approved claims.'
                        : 'A reviewer or admin can run a cross-asset check when assets are attached.'}
                    </p>
                    {can('campaign.resolve') ? (
                      <Button size="sm" variant="secondary" className="mt-4" onClick={detect} loading={detecting}>
                        <RefreshCw className="h-4 w-4" />
                        Run cross-asset check
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {campaign.conflicts.map((conflict) => {
                    const open = conflict.status === 'unresolved';
                    return (
                      <div
                        key={conflict.id}
                        className={cn(
                          'rounded-2xl border p-4',
                          open ? 'border-rose-400/25 bg-rose-500/10' : 'border-white/10 bg-white/[0.035]'
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                                open
                                  ? 'border-rose-400/25 bg-rose-500/15 text-rose-200'
                                  : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                              )}
                            >
                              {open ? <Swords className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                              {open ? 'Unresolved' : 'Resolved'}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-slate-400">
                              {titleCase(conflict.claim_type)}
                            </span>
                          </div>
                          {!open && conflict.resolved_by ? (
                            <span className="text-[10px] text-slate-400">
                              Resolved by {conflict.resolved_by}
                              {conflict.resolved_at ? ` · ${formatDateTime(conflict.resolved_at)}` : ''}
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-slate-100">{conflict.topic}</h3>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5">
                            <p className="text-[10px] font-medium text-slate-400">{conflict.asset_a_title}</p>
                            <p className="mt-0.5 break-words text-sm font-medium text-slate-200">{conflict.asset_a_value}</p>
                            {conflict.asset_a_location ? (
                              <p className="mt-0.5 text-[10px] text-slate-400">{conflict.asset_a_location}</p>
                            ) : null}
                          </div>
                          <div className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5">
                            <p className="text-[10px] font-medium text-slate-400">{conflict.asset_b_title}</p>
                            <p className="mt-0.5 break-words text-sm font-medium text-slate-200">{conflict.asset_b_value}</p>
                            {conflict.asset_b_location ? (
                              <p className="mt-0.5 text-[10px] text-slate-400">{conflict.asset_b_location}</p>
                            ) : null}
                          </div>
                        </div>
                        {conflict.approved_value ? (
                          <div className="mt-2 rounded-lg border border-brand-400/15 bg-brand-500/10 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-300">
                              Approved source value
                            </p>
                            <p className="mt-0.5 break-words text-xs leading-5 text-slate-300">{conflict.approved_value}</p>
                            {conflict.source_reference ? (
                              <p className="mt-0.5 text-[10px] text-slate-400">Source: {conflict.source_reference}</p>
                            ) : null}
                          </div>
                        ) : null}
                        {conflict.evidence_note ? (
                          <p className="mt-2 text-[11px] leading-5 text-slate-400">{conflict.evidence_note}</p>
                        ) : null}
                        {!open && conflict.resolution_notes ? (
                          <p className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[11px] leading-5 text-slate-300">
                            <span className="font-medium text-slate-300">Resolution record: </span>
                            {conflict.resolution_notes}
                          </p>
                        ) : null}
                        {open && can('campaign.resolve') ? (
                          <div className="mt-3 flex justify-end">
                            <Button size="sm" variant="secondary" onClick={() => openResolve(conflict)}>
                              Record resolution
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  <p className="px-1 text-[10px] leading-4 text-slate-400">
                    Resolving a conflict records the agreed value and a human decision. It does not edit the assets
                    automatically; update each asset's text, then run a new check.
                  </p>
                </div>
              )
            ) : null}

            {tab === 'map' ? (
              <div className="p-4">
                {graphLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-300" />
                    Building the claim map from stored records…
                  </div>
                ) : graphError ? (
                  <ErrorState message={graphError} retry={() => setGraph(null)} />
                ) : graph ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(
                        graph.nodes.reduce<Record<string, number>>((counts, node) => {
                          counts[node.type] = (counts[node.type] || 0) + 1;
                          return counts;
                        }, {})
                      ).map(([type, count]) => (
                        <span
                          key={type}
                          className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-medium text-slate-300"
                        >
                          {titleCase(type.replace('_', ' '))} · {count}
                        </span>
                      ))}
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-slate-400">
                        {graph.links.length} relationships
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Campaign nodes</p>
                        <div className="space-y-2">
                          {graph.nodes
                            .filter((node) => node.type === 'campaign' || node.type === 'asset')
                            .map((node) => (
                              <div key={node.id} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="min-w-0 truncate text-xs font-medium text-slate-200">{node.label}</p>
                                  <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-400">
                                    {node.type}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  {node.status ? titleCase(node.status) : titleCase(String(node.metadata.asset_type || ''))}
                                  {node.type === 'asset' ? ' asset' : ''}
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Facts and conflicts
                        </p>
                        <div className="space-y-2">
                          {graph.nodes.filter((node) => node.type === 'approved_fact' || node.type === 'conflict').length === 0 ? (
                            <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-slate-400">
                              No approved facts or conflicts are linked yet.
                            </p>
                          ) : (
                            graph.nodes
                              .filter((node) => node.type === 'approved_fact' || node.type === 'conflict')
                              .map((node) => (
                                <div key={node.id} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="min-w-0 truncate text-xs font-medium text-slate-200">{node.label}</p>
                                    <span
                                      className={cn(
                                        'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                                        node.type === 'conflict'
                                          ? 'bg-rose-500/10 text-rose-300'
                                          : 'bg-brand-500/10 text-brand-300'
                                      )}
                                    >
                                      {node.type === 'conflict' ? 'Conflict' : 'Approved fact'}
                                    </span>
                                  </div>
                                  {node.status ? (
                                    <p className="mt-0.5 text-[10px] text-slate-400">{titleCase(node.status)}</p>
                                  ) : null}
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Relationships</p>
                      <ul className="mt-1.5 space-y-1">
                        {graph.links.map((link, index) => {
                          const source = graph.nodes.find((node) => node.id === link.source)?.label || link.source;
                          const target = graph.nodes.find((node) => node.id === link.target)?.label || link.target;
                          return (
                            <li key={`${link.source}-${link.target}-${index}`} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                              <span className="font-medium text-slate-300">{source}</span>
                              <Link2 className="h-3 w-3 text-slate-400" />
                              <span>{titleCase(link.relationship)}</span>
                              <ArrowRight className="h-3 w-3 text-slate-300" />
                              <span className="font-medium text-slate-300">{target}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <p className="text-[10px] leading-4 text-slate-400">
                      This map is generated from stored campaign, asset, and approved-fact records. It is not a
                      semantic AI inference.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="p-4">
            <SectionHeading title="Campaign details" />
            <dl className="mt-3 divide-y divide-white/[0.08]">
              <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <dt className="text-[11px] text-slate-400">Audience</dt>
                <dd className="min-w-0 text-right text-xs font-medium text-slate-300">
                  {campaign.target_audience || 'Not set'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <dt className="text-[11px] text-slate-400">Launch target</dt>
                <dd className="text-right text-xs font-medium text-slate-300">{formatDate(campaign.launch_target)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <dt className="text-[11px] text-slate-400">Owner</dt>
                <dd className="text-right text-xs font-medium text-slate-300">{campaign.created_by_name || '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <dt className="text-[11px] text-slate-400">Created</dt>
                <dd className="text-right text-xs font-medium text-slate-300">{formatDate(campaign.created_at)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <dt className="text-[11px] text-slate-400">Approved assets</dt>
                <dd className="text-right text-xs font-medium text-slate-300">
                  {approvedAssets} of {campaign.assets_count}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <dt className="text-[11px] text-slate-400">Open conflicts</dt>
                <dd className={cn('text-right text-xs font-semibold', unresolved.length ? 'text-rose-300' : 'text-emerald-300')}>
                  {unresolved.length}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-semibold text-slate-200">Assets in this campaign</p>
                <div className="mt-2 space-y-1.5">
                  {campaign.assets.length === 0 ? (
                    <p className="text-[11px] text-slate-400">None attached yet.</p>
                  ) : (
                    campaign.assets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => navigate(`/content/${asset.id}`)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-white/[0.06]"
                      >
                        <span className="min-w-0 truncate text-[11px] text-slate-300">{asset.title}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{ASSET_TYPE_LABEL[asset.asset_type]}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>

          <InfoCallout tone="neutral" title="Readiness, not a release gate">
            Checks cover stored internal records. Legal review, accessibility testing, and executive sign-off remain
            human decisions.
          </InfoCallout>
        </aside>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit campaign"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={editBusy}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={editBusy}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Campaign name" htmlFor="edit-campaign-name" required>
            <Input id="edit-campaign-name" value={editName} onChange={(event) => setEditName(event.target.value)} />
          </Field>
          <Field label="Brief / description" htmlFor="edit-campaign-description">
            <Textarea
              id="edit-campaign-description"
              rows={3}
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target audience" htmlFor="edit-campaign-audience">
              <Input
                id="edit-campaign-audience"
                value={editAudience}
                onChange={(event) => setEditAudience(event.target.value)}
              />
            </Field>
            <Field label="Launch target" htmlFor="edit-campaign-launch">
              <Input
                id="edit-campaign-launch"
                type="date"
                value={editLaunch}
                onChange={(event) => setEditLaunch(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Status" htmlFor="edit-campaign-status">
            <Select id="edit-campaign-status" value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          {editError ? (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{editError}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        title="Attach content to this campaign"
        description="Attached assets are compared for conflicting claims against each other and the approved facts."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAttachOpen(false)} disabled={attachBusy}>
              Cancel
            </Button>
            <Button onClick={attach} loading={attachBusy} disabled={!attachId}>
              Attach content
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Content item"
            htmlFor="attach-document"
            hint="Only content you can access in this workspace is listed."
          >
            <Select id="attach-document" value={attachId} onChange={(event) => setAttachId(event.target.value)}>
              <option value="">Select content…</option>
              {attachable.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title} · {ASSET_TYPE_LABEL[doc.asset_type]} · v{doc.current_version_number}
                </option>
              ))}
            </Select>
          </Field>
          {attachable.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-400">
              Every accessible content item is already in this campaign.
            </p>
          ) : null}
          {attachId ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5">
              {(() => {
                const doc = attachable.find((item) => item.id === attachId);
                if (!doc) return null;
                return (
                  <p className="text-xs text-slate-300">
                    <span className="font-medium text-slate-200">{doc.title}</span>
                    <br />
                    {CONTENT_TYPE_LABEL[doc.content_type as keyof typeof CONTENT_TYPE_LABEL] || titleCase(doc.content_type)} ·{' '}
                    {ASSET_TYPE_LABEL[doc.asset_type]} · v{doc.current_version_number}
                    {doc.campaign_id ? (
                      <>
                        <br />
                        <span className="text-amber-300">Currently attached to another campaign — attaching moves it here.</span>
                      </>
                    ) : null}
                  </p>
                );
              })()}
            </div>
          ) : null}
          {attachError ? (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{attachError}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(conflictTarget)}
        onClose={() => setConflictTarget(null)}
        title="Record a conflict resolution"
        description={conflictTarget ? `${conflictTarget.topic} · ${conflictTarget.asset_a_title} vs. ${conflictTarget.asset_b_title}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConflictTarget(null)} disabled={resolveBusy}>
              Cancel
            </Button>
            <Button onClick={resolve} loading={resolveBusy}>
              Record resolution
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Agreed value"
            htmlFor="resolved-value"
            required
            hint="The value the team agrees is correct. Prefer the approved source value where one exists."
          >
            <Input id="resolved-value" value={resolvedValue} onChange={(event) => setResolvedValue(event.target.value)} />
          </Field>
          <Field
            label="Resolution notes"
            htmlFor="resolution-notes"
            required
            hint="Required. Explain who agreed, and which asset text will be changed."
          >
            <Textarea
              id="resolution-notes"
              rows={3}
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              placeholder="e.g. Agreed to use the current approved price; email will be updated before launch."
            />
          </Field>
          {conflictTarget?.source_reference ? (
            <p className="rounded-lg border border-brand-400/15 bg-brand-500/10 px-3 py-2 text-[11px] leading-5 text-slate-300">
              Approved source: {conflictTarget.source_reference}
            </p>
          ) : null}
          {resolveError ? (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{resolveError}</p>
          ) : null}
          <InfoCallout tone="warning" title="This records a decision, not an edit">
            The underlying assets are not changed automatically. Update the affected text, re-run their checks, then
            check cross-asset claims again.
          </InfoCallout>
        </div>
      </Modal>
    </div>
  );
}
