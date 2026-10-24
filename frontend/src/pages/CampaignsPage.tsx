import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Layers,
  Plus,
  ShieldCheck,
  Swords,
  Target,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate, useAsync } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  InfoCallout,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  StatCard,
  Textarea,
  cn,
} from '../components/ui';
import { formatDate, relativeTime, titleCase } from '../lib/format';
import type { Campaign } from '../types';

const STATUS_STYLE: Record<string, string> = {
  active: 'border-blue-200 bg-blue-50 text-blue-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  archived: 'border-slate-200 bg-slate-50 text-slate-600',
};

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const unresolved = campaign.conflicts.filter((conflict) => conflict.status === 'unresolved').length;
  const readiness = campaign.readiness?.result;
  return (
    <button
      type="button"
      onClick={() => navigate(`/campaigns/${campaign.id}`)}
      className="group flex h-full w-full flex-col rounded-xl border border-slate-200/80 bg-white p-5 text-left shadow-subtle transition-colors hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-800">{campaign.name}</h3>
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                STATUS_STYLE[campaign.status] || STATUS_STYLE.active
              )}
            >
              {titleCase(campaign.status)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {campaign.description || 'No campaign brief recorded.'}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Layers className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Target className="h-3 w-3 text-slate-400" />
          {campaign.target_audience || 'Audience not set'}
        </span>
        <span className="inline-flex items-center gap-1">
          <CircleDashed className="h-3 w-3 text-slate-400" />
          {campaign.assets_count} linked asset{campaign.assets_count === 1 ? '' : 's'}
        </span>
        {campaign.launch_target ? <span>Launch {formatDate(campaign.launch_target)}</span> : null}
      </div>

      <div className="mt-4 flex flex-1 flex-wrap items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {unresolved > 0 ? (
            <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
              <Swords className="h-3 w-3" />
              {unresolved} open conflict{unresolved === 1 ? '' : 's'}
            </span>
          ) : campaign.assets_count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              No open conflicts
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              No assets attached
            </span>
          )}
          {readiness ? (
            <span
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium',
                readiness === 'ready'
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                  : readiness === 'not_ready'
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
                    : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
              )}
            >
              {titleCase(readiness)}
            </span>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 group-hover:text-brand-700">
          Open campaign
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Updated {relativeTime(campaign.updated_at)}</p>
    </button>
  );
}

export function CampaignsPage() {
  const { can } = useSession();
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(() => api.listCampaigns(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('');
  const [launchTarget, setLaunchTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const campaigns = data || [];
  const stats = useMemo(() => {
    const assets = campaigns.reduce((count, campaign) => count + campaign.assets_count, 0);
    const conflicts = campaigns.reduce(
      (count, campaign) => count + campaign.conflicts.filter((conflict) => conflict.status === 'unresolved').length,
      0
    );
    const ready = campaigns.filter((campaign) => campaign.readiness?.result === 'ready').length;
    return { assets, conflicts, ready };
  }, [campaigns]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setAudience('');
    setLaunchTarget('');
    setFormError(null);
  };

  const createCampaign = async () => {
    if (!name.trim()) {
      setFormError('Enter a campaign name.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const campaign = await api.createCampaign({
        name: name.trim(),
        description: description.trim() || undefined,
        target_audience: audience.trim() || undefined,
        launch_target: launchTarget || null,
        status: 'active',
      });
      toast('Campaign created. Attach content next.', 'success');
      setCreateOpen(false);
      resetForm();
      navigate(`/campaigns/${campaign.id}`);
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.detail : 'The campaign could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Cross-asset governance"
        title="Campaigns"
        description="Check whether approved claims, prices, and positioning stay consistent across every asset in a launch. Conflicts are computed from stored content, not guessed."
        actions={
          can('campaign.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New campaign
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Campaigns" value={campaigns.length} hint="Active and completed briefs" icon={Layers} tone="brand" />
        <StatCard label="Linked assets" value={stats.assets} hint="Content items across campaigns" icon={Target} />
        <StatCard
          label="Open conflicts"
          value={stats.conflicts}
          hint="Unresolved cross-asset disagreements"
          icon={Swords}
          tone={stats.conflicts > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Ready campaigns"
          value={stats.ready}
          hint="Readiness checks currently pass"
          icon={ShieldCheck}
          tone="success"
        />
      </div>

      <div className="mt-5">
        <InfoCallout tone="neutral" title="How campaign checks work">
          The detector compares stored values in attached assets — for example a retired price in an email and the
          approved price in a brochure. Readiness is a workflow aid built from these checks; it is not a legal or
          regulatory certification.
        </InfoCallout>
      </div>

      {loading ? (
        <div className="mt-5">
          <LoadingBlock rows={4} />
        </div>
      ) : error ? (
        <div className="mt-5">
          <ErrorState message={error} retry={reload} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={Layers}
            title="No campaigns yet"
            description="Create a campaign brief, then attach content to compare claims across assets."
            action={
              can('campaign.create') ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Create campaign
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setFormError(null);
        }}
        title="Create a campaign"
        description="A campaign groups content assets so cross-asset claims can be compared."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={createCampaign} loading={busy}>
              Create campaign
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Campaign name" htmlFor="campaign-name" required>
            <Input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Q1 Enterprise Launch"
              autoFocus
            />
          </Field>
          <Field label="Brief / description" htmlFor="campaign-description" hint="What is this campaign promising, and to whom?">
            <Textarea
              id="campaign-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short internal brief for reviewers."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target audience" htmlFor="campaign-audience">
              <Input
                id="campaign-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                placeholder="e.g. Enterprise IT leaders"
              />
            </Field>
            <Field label="Launch target" htmlFor="campaign-launch">
              <Input
                id="campaign-launch"
                type="date"
                value={launchTarget}
                onChange={(event) => setLaunchTarget(event.target.value)}
              />
            </Field>
          </div>
          {formError ? (
            <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
