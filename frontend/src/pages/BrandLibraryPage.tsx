import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileImage,
  FileText,
  Image as ImageIcon,
  Loader2,
  Palette,
  PencilLine,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Type,
  UploadCloud,
  X,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InfoCallout,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  SeverityBadge,
  Tabs,
  Textarea,
  cn,
} from '../components/ui';
import {
  FACT_STATUS_LABEL,
  RULE_STATUS_LABEL,
  RULE_TYPE_LABEL,
  SEVERITY_LABEL,
  formatDate,
  formatFileSize,
  parseApiDate,
  titleCase,
} from '../lib/format';
import type {
  ApprovedFact,
  BrandAsset,
  BrandRule,
  ContrastResult,
  ImpactAnalysis,
} from '../types';

type TabId = 'facts' | 'rules' | 'assets';

const FACT_STATUS_CLASS: Record<string, string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-800',
  expired: 'border-rose-200 bg-rose-50 text-rose-700',
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
};

const RULE_STATUS_CLASS: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  draft: 'border-amber-200 bg-amber-50 text-amber-800',
  archived: 'border-slate-200 bg-slate-50 text-slate-500',
};

const ASSET_TYPE_LABEL: Record<string, string> = {
  logo: 'Logo',
  color: 'Color',
  typography: 'Typography',
  image: 'Image',
  template: 'Template',
};

const ASSET_ICON: Record<string, typeof Palette> = {
  logo: ImageIcon,
  color: Palette,
  typography: Type,
  image: FileImage,
  template: FileText,
};

type FactForm = {
  category: string;
  claim_statement: string;
  approved_value: string;
  source_reference: string;
  source_url: string;
  product: string;
  status: string;
  next_review_at: string;
};

const EMPTY_FACT: FactForm = {
  category: '',
  claim_statement: '',
  approved_value: '',
  source_reference: '',
  source_url: '',
  product: '',
  status: 'verified',
  next_review_at: '',
};

const FACT_CATEGORIES = [
  'Product Naming',
  'Product Description',
  'Pricing',
  'Service Level & Availability',
  'Performance',
  'Cost & TCO',
  'Security & Compliance',
  'Legal',
  'Other',
];

type RuleForm = {
  name: string;
  rule_type: string;
  pattern_or_phrase: string;
  trigger_phrase: string;
  description: string;
  replacement_or_guidance: string;
  severity: string;
  status: string;
};

const EMPTY_RULE: RuleForm = {
  name: '',
  rule_type: 'prohibited_phrase',
  pattern_or_phrase: '',
  trigger_phrase: '',
  description: '',
  replacement_or_guidance: '',
  severity: 'medium',
  status: 'active',
};

type AssetForm = {
  name: string;
  asset_type: string;
  value: string;
  notes: string;
};

const EMPTY_ASSET: AssetForm = { name: '', asset_type: 'color', value: '', notes: '' };

function toDateInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function FactBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        FACT_STATUS_CLASS[status] || FACT_STATUS_CLASS.draft
      )}
    >
      {FACT_STATUS_LABEL[status as keyof typeof FACT_STATUS_LABEL] || titleCase(status)}
    </span>
  );
}

function RuleBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        RULE_STATUS_CLASS[status] || RULE_STATUS_CLASS.draft
      )}
    >
      {RULE_STATUS_LABEL[status as keyof typeof RULE_STATUS_LABEL] || titleCase(status)}
    </span>
  );
}

function AssetPreview({ asset }: { asset: BrandAsset }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!asset.file_id || !['logo', 'image', 'template'].includes(asset.asset_type)) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    api
      .getFile(asset.file_id)
      .then(({ blob, contentType }) => {
        if (cancelled) return;
        if (!contentType.startsWith('image/')) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.file_id, asset.asset_type]);

  if (asset.asset_type === 'color') {
    const color = /^#[0-9a-f]{6}$/i.test(asset.value || '') ? asset.value || '#e2e8f0' : '#e2e8f0';
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2">
        <span className="h-10 w-10 rounded-md border border-slate-200 shadow-inner" style={{ backgroundColor: color }} />
      </div>
    );
  }
  if (url) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <img src={url} alt={`Stored asset: ${asset.name}`} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  const Icon = ASSET_ICON[asset.asset_type] || Palette;
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
      {failed || asset.file_id === null ? <Icon className="h-5 w-5" /> : <Loader2 className="h-4 w-4 animate-spin" />}
    </div>
  );
}

export function BrandLibraryPage() {
  const { can } = useSession();
  const { toast } = useToast();
  const canManageFacts = can('brand.manage');
  const canManageRules = can('brand.manage');
  const canManageAssets = can('assets.manage');

  const { data, loading, error, reload } = useAsync(
    () =>
      Promise.all([
        api.listRules({ include_archived: canManageRules }),
        api.listFacts(),
        api.listAssets(),
      ]),
    [canManageRules]
  );

  const rules = data?.[0] || [];
  const facts = data?.[1] || [];
  const assets = data?.[2] || [];

  const [tab, setTab] = useState<TabId>('facts');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const deferred = useDeferredValue(query.trim().toLowerCase());

  const [factOpen, setFactOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<ApprovedFact | null>(null);
  const [factForm, setFactForm] = useState<FactForm>(EMPTY_FACT);
  const [factBusy, setFactBusy] = useState(false);
  const [factError, setFactError] = useState<string | null>(null);
  const [retireFact, setRetireFact] = useState<ApprovedFact | null>(null);
  const [retireBusy, setRetireBusy] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BrandRule | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [archiveRuleTarget, setArchiveRuleTarget] = useState<BrandRule | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<BrandAsset | null>(null);
  const [assetForm, setAssetForm] = useState<AssetForm>(EMPTY_ASSET);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  const [contrastOpen, setContrastOpen] = useState(false);
  const [foreground, setForeground] = useState('#0B1B33');
  const [background, setBackground] = useState('#FFFFFF');
  const [textSize, setTextSize] = useState<'normal' | 'large'>('normal');
  const [contrast, setContrast] = useState<ContrastResult | null>(null);
  const [contrastBusy, setContrastBusy] = useState(false);
  const [contrastError, setContrastError] = useState<string | null>(null);

  const filteredFacts = useMemo(
    () =>
      facts
        .filter((fact) => (statusFilter ? fact.status === statusFilter : true))
        .filter((fact) => {
          if (!deferred) return true;
          return [fact.category, fact.claim_statement, fact.approved_value, fact.source_reference, fact.product || '']
            .join(' ')
            .toLowerCase()
            .includes(deferred);
        }),
    [facts, statusFilter, deferred]
  );

  const filteredRules = useMemo(
    () =>
      rules
        .filter((rule) => (statusFilter ? rule.status === statusFilter : true))
        .filter((rule) => {
          if (!deferred) return true;
          return [rule.name, rule.pattern_or_phrase, rule.description || '', rule.rule_type]
            .join(' ')
            .toLowerCase()
            .includes(deferred);
        }),
    [rules, statusFilter, deferred]
  );

  const filteredAssets = useMemo(
    () =>
      assets
        .filter((asset) => (statusFilter ? asset.status === statusFilter : asset.status === 'active'))
        .filter((asset) => {
          if (!deferred) return true;
          return [asset.name, asset.value || '', asset.notes || '', asset.asset_type]
            .join(' ')
            .toLowerCase()
            .includes(deferred);
        }),
    [assets, statusFilter, deferred]
  );

  useEffect(() => {
    setStatusFilter('');
  }, [tab]);

  const openFactCreate = () => {
    setEditingFact(null);
    setFactForm(EMPTY_FACT);
    setFactError(null);
    setFactOpen(true);
  };

  const openFactEdit = (fact: ApprovedFact) => {
    setEditingFact(fact);
    setFactForm({
      category: fact.category,
      claim_statement: fact.claim_statement,
      approved_value: fact.approved_value,
      source_reference: fact.source_reference,
      source_url: fact.source_url || '',
      product: fact.product || '',
      status: fact.status,
      next_review_at: toDateInput(fact.next_review_at),
    });
    setFactError(null);
    setFactOpen(true);
  };

  const saveFact = async () => {
    if (!factForm.category.trim() || !factForm.claim_statement.trim() || !factForm.approved_value.trim() || !factForm.source_reference.trim()) {
      setFactError('Category, claim, approved value, and source reference are required.');
      return;
    }
    if (factForm.source_url && !/^https?:\/\//i.test(factForm.source_url)) {
      setFactError('Source URL must start with http:// or https://.');
      return;
    }
    setFactBusy(true);
    setFactError(null);
    const payload: Record<string, unknown> = {
      category: factForm.category.trim(),
      claim_statement: factForm.claim_statement.trim(),
      approved_value: factForm.approved_value.trim(),
      source_reference: factForm.source_reference.trim(),
      source_url: factForm.source_url.trim() || null,
      product: factForm.product.trim() || null,
      status: factForm.status,
      next_review_at: factForm.next_review_at ? new Date(`${factForm.next_review_at}T00:00:00Z`).toISOString() : null,
    };
    try {
      if (editingFact) {
        await api.updateFact(editingFact.id, payload);
        toast('Approved fact updated. New audits will use the revised value.', 'success');
      } else {
        await api.createFact({ ...payload, is_active: factForm.status !== 'expired' });
        toast('Approved fact added to the brand library.', 'success');
      }
      setFactOpen(false);
      reload();
    } catch (caught) {
      setFactError(caught instanceof ApiError ? caught.detail : 'The approved fact could not be saved.');
    } finally {
      setFactBusy(false);
    }
  };

  const confirmRetireFact = async () => {
    if (!retireFact) return;
    setRetireBusy(true);
    try {
      await api.retireFact(retireFact.id);
      toast('Approved fact retired. It will no longer be treated as current guidance.', 'success');
      setRetireFact(null);
      reload();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.detail : 'The fact could not be retired.', 'error');
    } finally {
      setRetireBusy(false);
    }
  };

  const openRuleCreate = () => {
    setEditingRule(null);
    setRuleForm(EMPTY_RULE);
    setRuleError(null);
    setRuleOpen(true);
  };

  const openRuleEdit = (rule: BrandRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      rule_type: rule.rule_type,
      pattern_or_phrase: rule.pattern_or_phrase,
      trigger_phrase: rule.trigger_phrase || '',
      description: rule.description || '',
      replacement_or_guidance: rule.replacement_or_guidance || '',
      severity: rule.severity,
      status: rule.status,
    });
    setRuleError(null);
    setRuleOpen(true);
  };

  const saveRule = async () => {
    if (!ruleForm.name.trim() || !ruleForm.pattern_or_phrase.trim()) {
      setRuleError('A rule name and pattern are required.');
      return;
    }
    setRuleBusy(true);
    setRuleError(null);
    const payload: Record<string, unknown> = {
      name: ruleForm.name.trim(),
      rule_type: ruleForm.rule_type,
      pattern_or_phrase: ruleForm.pattern_or_phrase.trim(),
      trigger_phrase: ruleForm.trigger_phrase.trim() || null,
      description: ruleForm.description.trim() || null,
      replacement_or_guidance: ruleForm.replacement_or_guidance.trim() || null,
      severity: ruleForm.severity,
      status: ruleForm.status,
    };
    try {
      if (editingRule) {
        await api.updateRule(editingRule.id, payload);
        toast('Brand rule updated. A new version number was recorded.', 'success');
      } else {
        await api.createRule(payload);
        toast('Brand rule created and active for future checks.', 'success');
      }
      setRuleOpen(false);
      reload();
    } catch (caught) {
      setRuleError(caught instanceof ApiError ? caught.detail : 'The rule could not be saved.');
    } finally {
      setRuleBusy(false);
    }
  };

  const confirmArchiveRule = async () => {
    if (!archiveRuleTarget) return;
    setArchiveBusy(true);
    try {
      await api.archiveRule(archiveRuleTarget.id);
      toast('Rule archived. Existing audit records are unchanged.', 'success');
      setArchiveRuleTarget(null);
      reload();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.detail : 'The rule could not be archived.', 'error');
    } finally {
      setArchiveBusy(false);
    }
  };

  const openAssetCreate = () => {
    setEditingAsset(null);
    setAssetForm(EMPTY_ASSET);
    setAssetFile(null);
    setAssetError(null);
    setAssetOpen(true);
  };

  const openAssetEdit = (asset: BrandAsset) => {
    setEditingAsset(asset);
    setAssetForm({
      name: asset.name,
      asset_type: asset.asset_type,
      value: asset.value || '',
      notes: asset.notes || '',
    });
    setAssetFile(null);
    setAssetError(null);
    setAssetOpen(true);
  };

  const saveAsset = async () => {
    if (!assetForm.name.trim()) {
      setAssetError('Enter an asset name.');
      return;
    }
    if (['color', 'typography'].includes(assetForm.asset_type) && !assetForm.value.trim()) {
      setAssetError(assetForm.asset_type === 'color' ? 'Enter the color value.' : 'Enter the typography stack.');
      return;
    }
    if (assetForm.asset_type === 'color' && !/^#[0-9a-f]{6}$/i.test(assetForm.value.trim())) {
      setAssetError('Enter a six-digit hex color, for example #0B1B33.');
      return;
    }
    if (!editingAsset && assetForm.asset_type === 'logo' && !assetFile) {
      setAssetError('Upload a logo file before saving a logo asset.');
      return;
    }
    setAssetBusy(true);
    setAssetError(null);
    try {
      if (editingAsset) {
        await api.updateAsset(editingAsset.id, {
          name: assetForm.name.trim(),
          value: assetForm.value.trim() || null,
          notes: assetForm.notes.trim() || null,
        });
        toast('Brand asset updated.', 'success');
      } else {
        let uploadId: string | undefined;
        if (assetFile) {
          const upload = await api.uploadFile(assetFile, 'image');
          uploadId = upload.id;
        }
        await api.createAsset({
          name: assetForm.name.trim(),
          asset_type: assetForm.asset_type,
          value: assetForm.value.trim() || null,
          notes: assetForm.notes.trim() || null,
          upload_id: uploadId || null,
        });
        toast('Brand asset added.', 'success');
      }
      setAssetOpen(false);
      reload();
    } catch (caught) {
      setAssetError(caught instanceof ApiError ? caught.detail : 'The brand asset could not be saved.');
    } finally {
      setAssetBusy(false);
    }
  };

  const openImpact = async (kind: 'fact' | 'rule', entity: ApprovedFact | BrandRule) => {
    setImpactOpen(true);
    setImpact(null);
    setImpactError(null);
    setImpactLoading(true);
    try {
      const result = kind === 'fact' ? await api.factImpact(entity.id) : await api.ruleImpact(entity.id);
      setImpact(result);
    } catch (caught) {
      setImpactError(caught instanceof ApiError ? caught.detail : 'The impact analysis could not be completed.');
    } finally {
      setImpactLoading(false);
    }
  };

  const runContrast = async () => {
    setContrastBusy(true);
    setContrastError(null);
    try {
      setContrast(await api.checkContrast({ foreground, background, text_size: textSize }));
    } catch (caught) {
      setContrastError(caught instanceof ApiError ? caught.detail : 'The contrast ratio could not be calculated.');
    } finally {
      setContrastBusy(false);
    }
  };

  const shownCount = tab === 'facts' ? filteredFacts.length : tab === 'rules' ? filteredRules.length : filteredAssets.length;
  const totalCount = tab === 'facts' ? facts.length : tab === 'rules' ? rules.length : assets.length;
  const statusOptions =
    tab === 'facts'
      ? ['verified', 'needs_review', 'expired', 'draft']
      : tab === 'rules'
        ? ['active', 'draft', 'archived']
        : ['active', 'archived'];

  return (
    <div>
      <PageHeader
        eyebrow="Brand governance"
        title="Brand library"
        description="The approved facts, deterministic rules, and visual assets behind every check. Facts are versioned guidance with a named source — not marketing assumptions."
        actions={
          <>
            {tab === 'facts' && canManageFacts ? (
              <Button onClick={openFactCreate}>
                <Plus className="h-4 w-4" />
                Add approved fact
              </Button>
            ) : null}
            {tab === 'rules' && canManageRules ? (
              <Button onClick={openRuleCreate}>
                <Plus className="h-4 w-4" />
                Add rule
              </Button>
            ) : null}
            {tab === 'assets' ? (
              <>
                <Button variant="secondary" onClick={() => setContrastOpen(true)}>
                  <Sparkles className="h-4 w-4" />
                  Contrast checker
                </Button>
                {canManageAssets ? (
                  <Button onClick={openAssetCreate}>
                    <Plus className="h-4 w-4" />
                    Add asset
                  </Button>
                ) : null}
              </>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Approved facts</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-950">{facts.length}</p>
          <p className="mt-1 text-xs text-slate-500">{facts.filter((fact) => fact.status === 'verified').length} verified and active</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Brand rules</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-950">
            {rules.filter((rule) => rule.status === 'active').length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Deterministic rules in force</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Brand assets</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-950">
            {assets.filter((asset) => asset.status === 'active').length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Logos, colors, type, templates</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Review attention</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-amber-700">
            {facts.filter((fact) => {
              const reviewDue = parseApiDate(fact.next_review_at);
              return fact.status === 'needs_review' || Boolean(reviewDue && reviewDue.getTime() < Date.now());
            }).length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Facts flagged or past review date</p>
        </Card>
      </div>

      <div className="mt-5">
        <InfoCallout tone="neutral" title="What the audit engine reads">
          Checks match stored rules and approved facts against extracted text. The engine does not browse the web or
          verify a fact's real-world accuracy; a fact is only as current as the source your team records and reviews.
        </InfoCallout>
      </div>

      <Card className="mt-5 overflow-hidden">
        <Tabs
          tabs={[
            { id: 'facts', label: 'Approved facts', count: facts.length },
            { id: 'rules', label: 'Rules', count: rules.length },
            { id: 'assets', label: 'Assets', count: assets.length },
          ]}
          active={tab}
          onChange={(next) => setTab(next as TabId)}
          idBase="brand-library-tabs"
          label="Brand library sections"
          className="px-3 pt-1"
        />
        <div
          id="brand-library-tabs-panel"
          role="tabpanel"
          aria-labelledby={`brand-library-tabs-tab-${tab}`}
          tabIndex={0}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
        >
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === 'facts' ? 'Search facts and sources' : tab === 'rules' ? 'Search rules and patterns' : 'Search assets'}
                aria-label="Search brand library"
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
              className="sm:w-44"
            >
              <option value="">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </Select>
          </div>
          <span className="text-xs tabular-nums text-slate-500">
            {shownCount} of {totalCount}
          </span>
        </div>

        {loading ? (
          <div className="p-4">
            <LoadingBlock rows={5} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} retry={reload} />
          </div>
        ) : tab === 'facts' ? (
          filteredFacts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={BookOpenCheck}
                title="No approved facts match"
                description="Facts with a named source make unsupported claims detectable. Add one or clear the filters."
                action={
                  canManageFacts && !query && !statusFilter ? (
                    <Button size="sm" onClick={openFactCreate}>
                      <Plus className="h-4 w-4" />
                      Add approved fact
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredFacts.map((fact) => {
                const dueAt = parseApiDate(fact.next_review_at)?.getTime() ?? Infinity;
                const isOverdue = dueAt < Date.now();
                return (
                  <div key={fact.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                            {fact.category}
                          </span>
                          <FactBadge status={fact.status} />
                          {isOverdue && fact.status === 'verified' ? (
                            <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                              <CalendarClock className="h-2.5 w-2.5" />
                              Review due
                            </span>
                          ) : null}
                          <span className="text-[10px] text-slate-400">v{fact.version}</span>
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-slate-900">{fact.approved_value}</p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">{fact.claim_statement}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                          <span>Source: {fact.source_reference}</span>
                          {fact.source_url ? (
                            <a
                              href={fact.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                            >
                              Open source
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                          {fact.product ? <span>Product: {fact.product}</span> : null}
                          <span>Owner: {fact.owner_name || '—'}</span>
                          <span>Next review: {formatDate(fact.next_review_at)}</span>
                        </div>
                      </div>
                      {canManageFacts ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openImpact('fact', fact)}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Impact
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openFactEdit(fact)}>
                            <PencilLine className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          {fact.status !== 'expired' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-500 hover:text-rose-700"
                              onClick={() => setRetireFact(fact)}
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Retire
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : tab === 'rules' ? (
          filteredRules.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={ShieldCheck}
                title="No rules match"
                description="Rules make brand and compliance requirements deterministic. Add one or clear the filters."
                action={
                  canManageRules && !query && !statusFilter ? (
                    <Button size="sm" onClick={openRuleCreate}>
                      <Plus className="h-4 w-4" />
                      Add rule
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRules.map((rule) => (
                <div key={rule.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{rule.name}</h3>
                        <RuleBadge status={rule.status} />
                        <SeverityBadge severity={rule.severity} />
                        <span className="text-[10px] text-slate-400">v{rule.version}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700">
                          {rule.pattern_or_phrase}
                        </span>
                        {rule.trigger_phrase ? (
                          <span className="text-[10px] text-slate-400">triggered by “{rule.trigger_phrase}”</span>
                        ) : null}
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          {RULE_TYPE_LABEL[rule.rule_type as keyof typeof RULE_TYPE_LABEL] || titleCase(rule.rule_type)}
                        </span>
                      </div>
                      {rule.description ? <p className="mt-1.5 text-xs leading-5 text-slate-500">{rule.description}</p> : null}
                      {rule.replacement_or_guidance ? (
                        <p className="mt-1 text-[11px] text-emerald-800">
                          <span className="font-medium">Guidance:</span> {rule.replacement_or_guidance}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        Owner {rule.owner_name || '—'} · Last reviewed {formatDate(rule.last_reviewed_at)}
                      </p>
                    </div>
                    {canManageRules ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openImpact('rule', rule)}>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Impact
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openRuleEdit(rule)}>
                          <PencilLine className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        {rule.status !== 'archived' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-rose-700"
                            onClick={() => setArchiveRuleTarget(rule)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredAssets.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Palette}
              title="No brand assets match"
              description="Store approved logos, colors, typography, and templates for reference."
              action={
                canManageAssets && !query && !statusFilter ? (
                  <Button size="sm" onClick={openAssetCreate}>
                    <Plus className="h-4 w-4" />
                    Add asset
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <AssetPreview asset={asset} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold text-slate-900">{asset.name}</h3>
                      {asset.status === 'archived' ? (
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      {ASSET_TYPE_LABEL[asset.asset_type] || titleCase(asset.asset_type)}
                    </p>
                    {asset.value ? (
                      <p className="mt-1 break-words font-mono text-[11px] text-slate-600">{asset.value}</p>
                    ) : null}
                    {asset.file_id ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Source file stored
                      </p>
                    ) : null}
                  </div>
                </div>
                {asset.notes ? <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">{asset.notes}</p> : null}
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[10px] text-slate-400">Owner {asset.owner_name || '—'}</span>
                  {canManageAssets ? (
                    <Button variant="ghost" size="sm" onClick={() => openAssetEdit(asset)}>
                      <PencilLine className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </Card>

      {!canManageFacts ? (
        <p className="mt-4 text-xs text-slate-500">
          You are viewing current approved facts and active rules. Only an organization admin can edit the brand library.
        </p>
      ) : null}

      <Modal
        open={factOpen}
        onClose={() => setFactOpen(false)}
        title={editingFact ? 'Edit approved fact' : 'Add an approved fact'}
        description="Facts are source-backed guidance used to detect unsupported or contradictory claims."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFactOpen(false)} disabled={factBusy}>
              Cancel
            </Button>
            <Button onClick={saveFact} loading={factBusy}>
              {editingFact ? 'Save changes' : 'Add fact'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="fact-category" required>
              <Input
                id="fact-category"
                list="fact-categories"
                value={factForm.category}
                onChange={(event) => setFactForm({ ...factForm, category: event.target.value })}
                placeholder="e.g. Pricing"
              />
              <datalist id="fact-categories">
                {FACT_CATEGORIES.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </Field>
            <Field label="Product" htmlFor="fact-product">
              <Input
                id="fact-product"
                value={factForm.product}
                onChange={(event) => setFactForm({ ...factForm, product: event.target.value })}
                placeholder="e.g. Acme Cloud Enterprise"
              />
            </Field>
          </div>
          <Field label="Claim statement" htmlFor="fact-claim" required hint="What question does this fact answer?">
            <Input
              id="fact-claim"
              value={factForm.claim_statement}
              onChange={(event) => setFactForm({ ...factForm, claim_statement: event.target.value })}
              placeholder="e.g. Current enterprise plan list price"
            />
          </Field>
          <Field label="Approved value" htmlFor="fact-value" required hint="The exact wording or figure content may use.">
            <Textarea
              id="fact-value"
              rows={2}
              value={factForm.approved_value}
              onChange={(event) => setFactForm({ ...factForm, approved_value: event.target.value })}
              placeholder="e.g. INR 12,999 per month per organization"
            />
          </Field>
          <Field label="Source reference" htmlFor="fact-source" required hint="A named, checkable source — never “assumed”.">
            <Input
              id="fact-source"
              value={factForm.source_reference}
              onChange={(event) => setFactForm({ ...factForm, source_reference: event.target.value })}
              placeholder="e.g. FY26 Commercial Rate Card, row 3"
            />
          </Field>
          <Field label="Source URL" htmlFor="fact-url" hint="Optional. Must start with http:// or https://.">
            <Input
              id="fact-url"
              type="url"
              value={factForm.source_url}
              onChange={(event) => setFactForm({ ...factForm, source_url: event.target.value })}
              placeholder="https://…"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="fact-status">
              <Select
                id="fact-status"
                value={factForm.status}
                onChange={(event) => setFactForm({ ...factForm, status: event.target.value })}
              >
                {Object.entries(FACT_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Next review date" htmlFor="fact-review">
              <Input
                id="fact-review"
                type="date"
                value={factForm.next_review_at}
                onChange={(event) => setFactForm({ ...factForm, next_review_at: event.target.value })}
              />
            </Field>
          </div>
          {factForm.status === 'expired' ? (
            <InfoCallout tone="warning" title="Expired facts are not used as current guidance">
              Expired facts remain in the library for historical context but are excluded from active checks.
            </InfoCallout>
          ) : null}
          {factError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{factError}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title={editingRule ? 'Edit brand rule' : 'Add a brand rule'}
        description="Rules are evaluated deterministically against extracted content. They do not call a language model."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRuleOpen(false)} disabled={ruleBusy}>
              Cancel
            </Button>
            <Button onClick={saveRule} loading={ruleBusy}>
              {editingRule ? 'Save changes' : 'Add rule'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Rule name" htmlFor="rule-name" required>
            <Input
              id="rule-name"
              value={ruleForm.name}
              onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })}
              placeholder="e.g. No absolute uptime promises"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rule type" htmlFor="rule-type">
              <Select
                id="rule-type"
                value={ruleForm.rule_type}
                onChange={(event) => setRuleForm({ ...ruleForm, rule_type: event.target.value })}
              >
                {Object.entries(RULE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Severity" htmlFor="rule-severity">
              <Select
                id="rule-severity"
                value={ruleForm.severity}
                onChange={(event) => setRuleForm({ ...ruleForm, severity: event.target.value })}
              >
                {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Pattern or phrase" htmlFor="rule-pattern" required hint="Matched case-insensitively against extracted text.">
            <Input
              id="rule-pattern"
              value={ruleForm.pattern_or_phrase}
              onChange={(event) => setRuleForm({ ...ruleForm, pattern_or_phrase: event.target.value })}
              placeholder="e.g. 100% uptime"
              className="font-mono"
            />
          </Field>
          <Field
            label="Trigger phrase"
            htmlFor="rule-trigger"
            hint="Optional. Use for required-terminology rules that apply only when another phrase appears."
          >
            <Input
              id="rule-trigger"
              value={ruleForm.trigger_phrase}
              onChange={(event) => setRuleForm({ ...ruleForm, trigger_phrase: event.target.value })}
              placeholder="e.g. INR"
              className="font-mono"
            />
          </Field>
          <Field label="Description" htmlFor="rule-description" hint="Explain the brand or compliance reason in plain language.">
            <Textarea
              id="rule-description"
              rows={2}
              value={ruleForm.description}
              onChange={(event) => setRuleForm({ ...ruleForm, description: event.target.value })}
            />
          </Field>
          <Field label="Replacement or guidance" htmlFor="rule-guidance" hint="What should the writer do instead?">
            <Textarea
              id="rule-guidance"
              rows={2}
              value={ruleForm.replacement_or_guidance}
              onChange={(event) => setRuleForm({ ...ruleForm, replacement_or_guidance: event.target.value })}
            />
          </Field>
          <Field label="Status" htmlFor="rule-status">
            <Select
              id="rule-status"
              value={ruleForm.status}
              onChange={(event) => setRuleForm({ ...ruleForm, status: event.target.value })}
            >
              {Object.entries(RULE_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {ruleError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{ruleError}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={assetOpen}
        onClose={() => setAssetOpen(false)}
        title={editingAsset ? 'Edit brand asset' : 'Add a brand asset'}
        description="Assets are reference records for the team. Uploaded logos and images are stored on the server."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssetOpen(false)} disabled={assetBusy}>
              Cancel
            </Button>
            <Button onClick={saveAsset} loading={assetBusy}>
              {editingAsset ? 'Save changes' : 'Add asset'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Asset name" htmlFor="asset-name" required>
            <Input
              id="asset-name"
              value={assetForm.name}
              onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })}
              placeholder="e.g. Primary blue"
            />
          </Field>
          <Field label="Asset type" htmlFor="asset-type">
            <Select
              id="asset-type"
              value={assetForm.asset_type}
              onChange={(event) => setAssetForm({ ...assetForm, asset_type: event.target.value })}
              disabled={Boolean(editingAsset)}
            >
              {Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {!editingAsset && ['logo', 'image', 'template'].includes(assetForm.asset_type) ? (
            <Field
              label={assetForm.asset_type === 'logo' ? 'Logo file' : 'Asset file'}
              htmlFor="asset-file"
              required={assetForm.asset_type === 'logo'}
              hint="PNG, JPEG, WebP, or PDF up to the workspace upload limit."
            >
              <label
                htmlFor="asset-file"
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-3 text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <UploadCloud className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{assetFile ? assetFile.name : 'Choose a file'}</span>
                  {assetFile ? <span className="shrink-0 text-slate-400">{formatFileSize(assetFile.size)}</span> : null}
                </span>
                {assetFile ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setAssetFile(null);
                    }}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                    aria-label="Remove selected file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <input
                  id="asset-file"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  className="sr-only"
                  onChange={(event) => setAssetFile(event.target.files?.[0] || null)}
                />
              </label>
            </Field>
          ) : null}
          {['color', 'typography'].includes(assetForm.asset_type) || editingAsset ? (
            <Field
              label={assetForm.asset_type === 'color' ? 'Hex color' : 'Value'}
              htmlFor="asset-value"
              required={assetForm.asset_type === 'color'}
              hint={assetForm.asset_type === 'color' ? 'Six-digit hex, for example #0B1B33.' : 'Font stack, usage note, or asset value.'}
            >
              <Input
                id="asset-value"
                value={assetForm.value}
                onChange={(event) => setAssetForm({ ...assetForm, value: event.target.value })}
                placeholder={assetForm.asset_type === 'color' ? '#0B1B33' : 'e.g. Inter, system-ui, sans-serif'}
                className={assetForm.asset_type === 'color' ? 'font-mono' : ''}
              />
            </Field>
          ) : null}
          <Field label="Notes" htmlFor="asset-notes" hint="Usage guidance or restrictions.">
            <Textarea
              id="asset-notes"
              rows={2}
              value={assetForm.notes}
              onChange={(event) => setAssetForm({ ...assetForm, notes: event.target.value })}
            />
          </Field>
          {editingAsset ? (
            <p className="text-[11px] leading-5 text-slate-500">
              Files cannot be replaced in this build; archive the asset and create a new one to change its file.
            </p>
          ) : null}
          {assetError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{assetError}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={impactOpen}
        onClose={() => setImpactOpen(false)}
        title="Change impact analysis"
        description="A stored-text scan of current documents, shown before you change guidance."
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setImpactOpen(false)}>
            Close
          </Button>
        }
      >
        {impactLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
            Scanning stored content…
          </div>
        ) : impactError ? (
          <ErrorState message={impactError} />
        ) : impact ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-sm font-medium text-slate-900">{impact.entity_name}</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">{impact.entity_summary}</p>
              <p className="mt-1.5 text-[10px] text-slate-400">
                Scanned {impact.scanned_documents} current document{impact.scanned_documents === 1 ? '' : 's'}.
              </p>
            </div>
            {impact.items.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-6 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" />
                <p className="mt-2 text-sm font-medium text-emerald-950">No current document matches</p>
                <p className="mt-1 text-xs text-emerald-800/80">This change does not affect stored text in the current workspace.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {impact.items.map((item) => (
                  <div key={item.document_id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-800">
                        {item.title} <span className="font-normal text-slate-400">· v{item.version_number}</span>
                      </p>
                      <span className="text-[10px] text-slate-400">{item.match_count} match{item.match_count === 1 ? '' : 'es'}</span>
                    </div>
                    <p className="mt-1 break-words font-mono text-[11px] leading-4 text-slate-600">{item.snippet}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{item.reason}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] leading-4 text-slate-400">{impact.note}</p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={contrastOpen}
        onClose={() => setContrastOpen(false)}
        title="WCAG contrast checker"
        description="Calculated locally by the server from two hex colors. It checks contrast only, not overall accessibility."
        footer={
          <>
            <Button variant="secondary" onClick={() => setContrastOpen(false)}>
              Close
            </Button>
            <Button onClick={runContrast} loading={contrastBusy}>
              Calculate contrast
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Foreground" htmlFor="contrast-fg">
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick foreground color"
                  value={/^#[0-9a-f]{6}$/i.test(foreground) ? foreground : '#000000'}
                  onChange={(event) => setForeground(event.target.value.toUpperCase())}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                />
                <Input
                  id="contrast-fg"
                  value={foreground}
                  onChange={(event) => setForeground(event.target.value)}
                  className="font-mono uppercase"
                />
              </div>
            </Field>
            <Field label="Background" htmlFor="contrast-bg">
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick background color"
                  value={/^#[0-9a-f]{6}$/i.test(background) ? background : '#ffffff'}
                  onChange={(event) => setBackground(event.target.value.toUpperCase())}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                />
                <Input
                  id="contrast-bg"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                  className="font-mono uppercase"
                />
              </div>
            </Field>
          </div>
          <Field label="Text size" htmlFor="contrast-size">
            <Select
              id="contrast-size"
              value={textSize}
              onChange={(event) => setTextSize(event.target.value as 'normal' | 'large')}
            >
              <option value="normal">Normal text (requires 4.5:1)</option>
              <option value="large">Large text (requires 3:1)</option>
            </Select>
          </Field>
          {contrast ? (
            <div
              className={cn(
                'rounded-lg border p-4',
                contrast.passes_selected_requirement
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-rose-200 bg-rose-50/60'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className={cn('text-sm font-semibold', contrast.passes_selected_requirement ? 'text-emerald-900' : 'text-rose-900')}>
                  {contrast.ratio}:1 — {contrast.passes_selected_requirement ? 'Passes' : 'Fails'}
                </p>
                <span className="text-[10px] text-slate-500">Required {contrast.required_ratio}:1</span>
              </div>
              <div
                className="mt-3 rounded-lg border border-slate-200 p-3 text-sm"
                style={{ color: contrast.foreground, backgroundColor: contrast.background }}
              >
                The quick brown fox jumps over the lazy dog.
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-600">{contrast.note}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                Normal text {contrast.normal_text_passes ? 'passes' : 'fails'} · Large text{' '}
                {contrast.large_text_passes ? 'passes' : 'fails'}
              </p>
            </div>
          ) : null}
          {contrastError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{contrastError}</p>
          ) : null}
          <InfoCallout tone="neutral" title="A measured result, not a brand approval">
            Passing contrast does not approve a color pairing for the brand. Design review still applies.
          </InfoCallout>
        </div>
      </Modal>

      <Modal
        open={Boolean(retireFact)}
        onClose={() => setRetireFact(null)}
        title="Retire this approved fact?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRetireFact(null)} disabled={retireBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRetireFact} loading={retireBusy}>
              Retire fact
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          “{retireFact?.approved_value}” will be marked expired and excluded from current guidance. Existing audit
          findings keep their recorded history. This does not delete the record.
        </p>
      </Modal>

      <Modal
        open={Boolean(archiveRuleTarget)}
        onClose={() => setArchiveRuleTarget(null)}
        title="Archive this rule?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveRuleTarget(null)} disabled={archiveBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmArchiveRule} loading={archiveBusy}>
              Archive rule
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          “{archiveRuleTarget?.name}” will stop applying to future audits. Existing audit runs and findings are not
          rewritten, so their history remains intact.
        </p>
      </Modal>
    </div>
  );
}
