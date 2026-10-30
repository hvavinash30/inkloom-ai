import { useEffect, useMemo, useState } from 'react';
import {
  Database,
  FileText,
  Info,
  Layers,
  LockKeyhole,
  Palette,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useAsync } from '../lib/router';
import { useSession } from '../context/SessionContext';
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
  PageHeader,
  SectionHeading,
  Textarea,
  cn,
} from '../components/ui';
import { formatDate, titleCase } from '../lib/format';

function DurabilityBadge({
  durable,
  durableLabel = 'Durable',
  nonDurableLabel = 'Ephemeral',
}: {
  durable: boolean;
  durableLabel?: string;
  nonDurableLabel?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        durable ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', durable ? 'bg-emerald-500' : 'bg-amber-500')} />
      {durable ? durableLabel : nonDurableLabel}
    </span>
  );
}

export function SettingsPage() {
  const { toast } = useToast();
  const { reload: reloadSession } = useSession();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.getOrgOverview(), api.getIntegrations(), api.getHealth()]),
    []
  );
  const overview = data?.[0] || null;
  const integrations = data?.[1] || null;
  const health = data?.[2] || null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!overview) return;
    setName(overview.workspace.name);
    setDescription(overview.workspace.description || '');
  }, [overview]);

  const stats = useMemo(() => {
    if (!overview) return [];
    return [
      { label: 'Members', value: overview.stats.members, icon: Users },
      { label: 'Documents', value: overview.stats.documents, icon: FileText },
      { label: 'Active rules', value: overview.stats.active_rules, icon: ShieldCheck },
      { label: 'Active facts', value: overview.stats.active_facts, icon: Database },
      { label: 'Campaigns', value: overview.stats.campaigns, icon: Layers },
      { label: 'Brand assets', value: overview.stats.brand_assets, icon: Palette },
    ];
  }, [overview]);

  if (loading) {
    return (
      <div>
        <div className="mb-6 h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        <LoadingBlock rows={4} />
      </div>
    );
  }

  if (error || !overview || !integrations) {
    return (
      <div>
        <PageHeader eyebrow="Organization workspace" title="Organization settings" />
        <ErrorState message={error || 'Organization settings could not be loaded.'} retry={reload} />
      </div>
    );
  }

  const saveWorkspace = async () => {
    if (!name.trim() || name.trim().length < 2) {
      setSaveError('Enter a workspace name of at least two characters.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.updateWorkspace({ name: name.trim(), description: description.trim() });
      toast('Workspace details saved.', 'success');
      setSavedAt(new Date().toISOString());
      reload();
      reloadSession();
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.detail : 'The workspace could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Organization workspace"
        title="Organization settings"
        description="Workspace identity, server-side integrations, upload limits, and the security boundaries of this demo."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-ink-500">{stat.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-ink-950">{stat.value}</p>
                </div>
                <Icon className="h-4 w-4 shrink-0 text-ink-700" />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <SectionHeading
              title="Workspace identity"
              description="Visible in the sidebar and session records."
              action={
                overview.workspace.is_demo ? (
                  <Badge className="border-amber-200 bg-amber-50 text-amber-800">Fictional demo</Badge>
                ) : null
              }
            />
            <div className="mt-4 space-y-4">
              <Field label="Workspace name" htmlFor="workspace-name" required>
                <Input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Description" htmlFor="workspace-description" hint="Internal context stored with the workspace.">
                <Textarea
                  id="workspace-description"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <p className="text-[11px] text-ink-500">
                  Slug <span className="font-mono text-ink-500">{overview.workspace.slug}</span> · Created{' '}
                  {formatDate(overview.workspace.created_at)}
                  {savedAt ? ` · Saved ${new Date(savedAt).toLocaleTimeString()}` : ''}
                </p>
                <Button onClick={saveWorkspace} loading={saving}>
                  <Save className="h-4 w-4" />
                  Save changes
                </Button>
              </div>
              {saveError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{saveError}</p>
              ) : null}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Server integrations</h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  Availability only. The browser never receives API keys or service-role credentials.
                </p>
              </div>
              <Badge className="border-slate-200 bg-slate-50 text-ink-500">{integrations.integrations.length}</Badge>
            </div>
            <div className="divide-y divide-slate-200">
              {integrations.integrations.map((integration) => (
                <div key={integration.key} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-ink-800">{integration.name}</h3>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            integration.configured
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50 text-ink-500'
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', integration.configured ? 'bg-emerald-500' : 'bg-slate-200')} />
                          {integration.configured ? 'Configured' : 'Not configured'}
                        </span>
                        {integration.used_for_audits ? (
                          <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-blue-700">
                            Used for audits
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-ink-500">{integration.status}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">Server env</span>
                    {integration.env_vars.map((variable) => (
                      <span key={variable} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-[10px] leading-4 text-ink-500">
              {integrations.security_note}
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="p-4">
            <SectionHeading
              title={
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-ink-500" />
                  Server limits
                </span>
              }
              description="Enforced by the API, not only by the interface."
            />
            <dl className="mt-3 divide-y divide-slate-200">
              <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
                <dt className="text-[11px] text-ink-500">File upload</dt>
                <dd className="text-xs font-medium text-ink-700">{integrations.limits.max_upload_mb} MB</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-[11px] text-ink-500">Video upload</dt>
                <dd className="text-xs font-medium text-ink-700">{integrations.limits.max_video_upload_mb} MB</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-[11px] text-ink-500">PDF pages</dt>
                <dd className="text-xs font-medium text-ink-700">{integrations.limits.max_pdf_pages}</dd>
              </div>
              <div className="py-2">
                <dt className="text-[11px] text-ink-500">Accepted files</dt>
                <dd className="mt-0.5 text-xs leading-5 text-ink-700">{integrations.limits.allowed_files}</dd>
              </div>
            </dl>
          </Card>

          {health ? (
            <Card className="p-4">
              <SectionHeading
                title={
                  <span className="inline-flex items-center gap-2">
                    <Database className="h-4 w-4 text-ink-500" />
                    Storage durability
                  </span>
                }
                description="What actually persists across a restart or redeploy."
              />
              <dl className="mt-3 divide-y divide-slate-200">
                <div className="py-2 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[11px] text-ink-500">Database</dt>
                    <dd className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-ink-700">
                        {health.storage?.database.label || health.database}
                      </span>
                      <DurabilityBadge durable={Boolean(health.storage?.database.durable)} />
                    </dd>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-ink-500">
                    {health.storage?.database.note}
                  </p>
                </div>
                <div className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[11px] text-ink-500">Uploaded files</dt>
                    <dd className="flex items-center gap-2">
                      <span className="text-[10px] text-ink-700">
                        {health.storage?.uploads.writable ? 'Writable' : 'Not writable'}
                      </span>
                      <DurabilityBadge durable={Boolean(health.storage?.uploads.durable)} />
                    </dd>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-ink-500">
                    {health.storage?.uploads.note}
                  </p>
                </div>
                <div className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[11px] text-ink-500">AI assistant</dt>
                    <dd className="flex items-center gap-2">
                      <span className="text-[10px] text-ink-700">
                        {health.ai?.configured ? health.ai.provider : 'Not configured'}
                      </span>
                      <DurabilityBadge
                        durable={Boolean(health.ai?.configured)}
                        durableLabel="Active"
                        nonDurableLabel="Not configured"
                      />
                    </dd>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-ink-500">{health.ai?.reason}</p>
                </div>
              </dl>
            </Card>
          ) : null}

          <Card className="p-4">
            <SectionHeading
              title={
                <span className="inline-flex items-center gap-2">
                  <Server className="h-4 w-4 text-ink-500" />
                  Stored records
                </span>
              }
            />
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(integrations.counts).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <dt className="text-[9px] uppercase tracking-wide text-ink-500">{titleCase(key)}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-800">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
              <div>
                <p className="text-xs font-semibold text-ink-800">Security boundaries</p>
                <ul className="mt-1.5 space-y-1.5 text-[11px] leading-4 text-ink-500">
                  <li>• Sessions are issued by the server; roles and capabilities are enforced server-side.</li>
                  <li>• File downloads are authenticated; there are no public URLs.</li>
                  <li>• Files are isolated to the active workspace.</li>
                  <li>• Optional integrations fail honestly when absent.</li>
                  <li>• Demo sign-in must be replaced by a production identity provider before launch.</li>
                </ul>
              </div>
            </div>
          </Card>

          <InfoCallout tone="warning" title="Demo limitations">
            {overview.demo_notice}
          </InfoCallout>

          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-ink-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Environment variables are documented in the README and .env.example files. No secret values are displayed
            here.
          </div>
        </aside>
      </div>
    </div>
  );
}
