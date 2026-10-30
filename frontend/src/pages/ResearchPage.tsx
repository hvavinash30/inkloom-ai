import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FlaskConical,
  Link2,
  PencilLine,
  Plus,
  X,
} from 'lucide-react';
import { useAsync } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import {
  Badge,
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
  StatCard,
  Textarea,
  cn,
} from '../components/ui';
import { relativeTime, titleCase } from '../lib/format';
import type { ResearchRecord, ResearchSource } from '../types';

const SECTION_ORDER = ['literature', 'survey', 'interviews', 'competitor', 'validation', 'traceability'];

const STATUS_CLASS: Record<string, string> = {
  planned: 'border-slate-200 bg-slate-50 text-ink-700',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  validated: 'border-emerald-200 bg-emerald-400/15 text-emerald-700',
};

type SourceDraft = { title: string; url: string; note: string };

type RecordForm = {
  section: string;
  title: string;
  status: string;
  summary: string;
  detailsText: string;
  sources: SourceDraft[];
};

const EMPTY_FORM: RecordForm = {
  section: 'literature',
  title: '',
  status: 'planned',
  summary: '',
  detailsText: '',
  sources: [{ title: '', url: '', note: '' }],
};

function detailsToText(details: Record<string, unknown>) {
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('\n');
}

function textToDetails(text: string) {
  const result: Record<string, unknown> = {};
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const index = line.indexOf(':');
      if (index > 0) {
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        if (!key || !value) return;
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      }
    });
  return result;
}

function DetailValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-ink-500">—</span>;
  }
  if (typeof value === 'boolean') {
    return <span>{value ? 'Yes' : 'No'}</span>;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return <span className="whitespace-pre-line">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-500">None recorded</span>;
    const allPrimitive = value.every((item) => item === null || typeof item !== 'object');
    if (allPrimitive) {
      return (
        <ul className="list-disc space-y-0.5 pl-4 marker:text-ink-700">
          {value.map((item, index) => (
            <li key={index}>
              <DetailValue value={item} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ol className="space-y-2">
        {value.map((item, index) => (
          <li
            key={index}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2"
          >
            <DetailValue value={item} />
          </li>
        ))}
      </ol>
    );
  }
  if (typeof value === 'object') {
    return (
      <dl className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([key, nested]) => (
          <div key={key} className="grid gap-0.5 sm:grid-cols-[124px_minmax(0,1fr)] sm:gap-2">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-500">
              {titleCase(key)}
            </dt>
            <dd className="min-w-0 break-words">
              <DetailValue value={nested} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span>{String(value)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        STATUS_CLASS[status] || STATUS_CLASS.planned
      )}
    >
      {titleCase(status)}
    </span>
  );
}

export function ResearchPage() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(() => api.listResearch(), []);
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [recordOpen, setRecordOpen] = useState(false);
  const [editing, setEditing] = useState<ResearchRecord | null>(null);
  const [form, setForm] = useState<RecordForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const records = data?.records || [];
  const sectionLabels = data?.section_labels || {};

  const stats = useMemo(() => {
    const completed = records.filter((record) => ['completed', 'validated'].includes(record.status)).length;
    const planned = records.filter((record) => ['planned', 'in_progress'].includes(record.status)).length;
    const sourced = records.filter((record) => record.sources.length > 0).length;
    return { completed, planned, sourced };
  }, [records]);

  const filtered = useMemo(
    () =>
      records
        .filter((record) => (sectionFilter ? record.section === sectionFilter : true))
        .filter((record) => (statusFilter ? record.status === statusFilter : true)),
    [records, sectionFilter, statusFilter]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, ResearchRecord[]>();
    SECTION_ORDER.forEach((section) => groups.set(section, []));
    filtered.forEach((record) => {
      if (!groups.has(record.section)) groups.set(record.section, []);
      groups.get(record.section)!.push(record);
    });
    return Array.from(groups.entries()).filter(([, items]) => items.length > 0);
  }, [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setRecordOpen(true);
  };

  const openEdit = (record: ResearchRecord) => {
    setEditing(record);
    setForm({
      section: record.section,
      title: record.title,
      status: record.status,
      summary: record.summary || '',
      detailsText: detailsToText(record.details),
      sources: record.sources.length
        ? record.sources.map((source: ResearchSource) => ({
            title: source.title || '',
            url: source.url || '',
            note: source.note || '',
          }))
        : [{ title: '', url: '', note: '' }],
    });
    setFormError(null);
    setRecordOpen(true);
  };

  const updateSource = (index: number, patch: Partial<SourceDraft>) => {
    setForm({
      ...form,
      sources: form.sources.map((source, position) => (position === index ? { ...source, ...patch } : source)),
    });
  };

  const save = async () => {
    if (!form.title.trim()) {
      setFormError('Enter a research title.');
      return;
    }
    const sources = form.sources
      .filter((source) => source.title.trim() || source.url.trim() || source.note.trim())
      .map((source) => ({
        title: source.title.trim(),
        url: source.url.trim() || undefined,
        note: source.note.trim() || undefined,
      }));
    if (sources.some((source) => !source.title)) {
      setFormError('Every source needs a title.');
      return;
    }
    if (sources.some((source) => source.url && !/^https?:\/\//i.test(source.url))) {
      setFormError('Source URLs must start with http:// or https://.');
      return;
    }
    if (['completed', 'validated'].includes(form.status) && sources.length === 0) {
      setFormError('Completed or validated research must include at least one source. If the work was not conducted, keep it planned or in progress.');
      return;
    }
    setBusy(true);
    setFormError(null);
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      status: form.status,
      summary: form.summary.trim() || null,
      details: textToDetails(form.detailsText),
      sources,
    };
    try {
      if (editing) {
        await api.updateResearch(editing.id, payload);
        toast('Research record updated.', 'success');
      } else {
        await api.createResearch({ ...payload, section: form.section });
        toast('Research record added.', 'success');
      }
      setRecordOpen(false);
      reload();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.detail : 'The research record could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="mb-6 h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        <LoadingBlock rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader eyebrow="Organization workspace" title="Research & validation" />
        <ErrorState message={error || 'Research records could not be loaded.'} retry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Organization workspace"
        title="Research & validation"
        description="A record of standards reviews, planned research, and validation work. Planned work is labelled as not conducted; sources are listed exactly as recorded."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add research record
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Records" value={records.length} hint="Across all research sections" icon={FlaskConical} tone="brand" />
        <StatCard
          label="Completed or validated"
          value={stats.completed}
          hint="With at least one recorded source"
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard label="Planned / in progress" value={stats.planned} hint="Not yet completed work" icon={ClipboardList} tone="warning" />
        <StatCard label="Records with sources" value={stats.sourced} hint="Links are not independently verified" icon={Link2} />
      </div>

      <div className="mt-5">
        <InfoCallout tone="warning" title="Research honesty rules">
          Entries marked <span className="font-medium">planned</span> or <span className="font-medium">in progress</span>{' '}
          were not completed. No survey responses, interview quotes, competitor benchmarks, or validation results are
          generated. Completed records require at least one source, and Inkloom does not verify external links.
        </InfoCallout>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)} aria-label="Filter by research section" className="sm:w-56">
            <option value="">All sections</option>
            {SECTION_ORDER.map((section) => (
              <option key={section} value={section}>
                {sectionLabels[section] || titleCase(section)}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by research status" className="sm:w-44">
            <option value="">All statuses</option>
            {['planned', 'in_progress', 'completed', 'validated'].map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-ink-500">
          {filtered.length} of {records.length} records
        </p>
      </div>

      {grouped.length === 0 ? (
        <Card className="mt-5 p-5">
          <EmptyState
            icon={FlaskConical}
            title="No research records match"
            description="Add a source-backed record, or adjust the section and status filters."
          />
        </Card>
      ) : (
        <div
          className={cn(
            'mt-5 grid items-start gap-x-5 gap-y-7',
            grouped.length > 1 ? 'lg:grid-cols-2' : 'grid-cols-1'
          )}
        >
          {grouped.map(([section, items]) => (
            <section key={section} className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-ink-900">{sectionLabels[section] || titleCase(section)}</h2>
                <Badge className="border-slate-200 bg-slate-50 text-ink-500">{items.length}</Badge>
              </div>
              <div className="space-y-4">
                {items.map((record) => (
                  <Card key={record.id} className="flex flex-col p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink-900">{record.title}</h3>
                        <StatusBadge status={record.status} />
                        {record.is_demo ? (
                          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-800">
                            Demo
                          </span>
                        ) : null}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(record)}>
                        <PencilLine className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                    {record.summary ? <p className="mt-1.5 text-xs leading-5 text-ink-500">{record.summary}</p> : null}

                    {Object.keys(record.details).length > 0 ? (
                      <dl className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                        {Object.entries(record.details).map(([key, value]) => (
                          <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                            <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-500 sm:w-28 sm:pt-0.5">
                              {titleCase(key)}
                            </dt>
                            <dd className="min-w-0 break-words text-[11px] leading-5 text-ink-700">
                              <DetailValue value={value} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                        Sources ({record.sources.length})
                      </p>
                      {record.sources.length === 0 ? (
                        <p className="mt-1 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-ink-500">
                          No sources recorded. This record cannot be marked completed or validated.
                        </p>
                      ) : (
                        <ul className="mt-1.5 space-y-1.5">
                          {record.sources.map((source, index) => (
                            <li key={`${source.title}-${index}`} className="flex items-start gap-2 text-[11px] leading-4">
                              <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-ink-700" />
                              <span className="min-w-0">
                                <span className="font-medium text-ink-700">{source.title}</span>
                                {source.url ? (
                                  <>
                                    {' '}
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-0.5 break-all font-medium text-brand-600 hover:underline"
                                    >
                                      Open source
                                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                    </a>
                                  </>
                                ) : null}
                                {source.note ? <span className="block text-ink-500">{source.note}</span> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                      <span className="text-[10px] text-ink-500">
                        Owner {record.owner_name || '—'} · Updated {relativeTime(record.updated_at)}
                      </span>
                      {record.status === 'validated' || record.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" />
                          {record.status === 'validated' ? 'Validated in records' : 'Completed in records'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-700">Work not completed</span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <InfoCallout tone="neutral" title="Scope of this module" className="mt-6">
        {data.note}
      </InfoCallout>

      <Modal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        title={editing ? 'Edit research record' : 'Add a research record'}
        description="Record what was actually done, and link the sources that support it."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecordOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              {editing ? 'Save changes' : 'Add record'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Section"
              htmlFor="research-section"
              hint={editing ? 'Section cannot be changed after creation.' : undefined}
            >
              <Select
                id="research-section"
                value={form.section}
                onChange={(event) => setForm({ ...form, section: event.target.value })}
                disabled={Boolean(editing)}
              >
                {SECTION_ORDER.map((section) => (
                  <option key={section} value={section}>
                    {sectionLabels[section] || titleCase(section)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="research-status">
              <Select
                id="research-status"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {['planned', 'in_progress', 'completed', 'validated'].map((status) => (
                  <option key={status} value={status}>
                    {titleCase(status)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Title" htmlFor="research-title" required>
            <Input
              id="research-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="e.g. WCAG 2.1 contrast standard review"
            />
          </Field>
          <Field label="Summary" htmlFor="research-summary" hint="What was reviewed or planned? Keep claims factual.">
            <Textarea
              id="research-summary"
              rows={2}
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
            />
          </Field>
          <Field
            label="Key details"
            htmlFor="research-details"
            hint="One “Label: value” pair per line. Lists or mappings can be entered as JSON."
          >
            <Textarea
              id="research-details"
              rows={3}
              value={form.detailsText}
              onChange={(event) => setForm({ ...form, detailsText: event.target.value })}
              placeholder={'Method: Standards review\nScope: Contrast and accessible naming'}
              className="font-mono text-xs"
            />
          </Field>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-ink-700">Sources</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setForm({ ...form, sources: [...form.sources, { title: '', url: '', note: '' }] })}
              >
                <Plus className="h-3.5 w-3.5" />
                Add source
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {form.sources.map((source, index) => (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Source {index + 1}</p>
                    {form.sources.length > 1 ? (
                      <button
                        type="button"
                        className="rounded p-1 text-ink-500 hover:bg-slate-100 hover:text-rose-600"
                        onClick={() => setForm({ ...form, sources: form.sources.filter((_, position) => position !== index) })}
                        aria-label={`Remove source ${index + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      value={source.title}
                      onChange={(event) => updateSource(index, { title: event.target.value })}
                      placeholder="Source title"
                      aria-label={`Source ${index + 1} title`}
                    />
                    <Input
                      value={source.url}
                      onChange={(event) => updateSource(index, { url: event.target.value })}
                      placeholder="https://… (optional)"
                      aria-label={`Source ${index + 1} URL`}
                    />
                  </div>
                  <Input
                    value={source.note}
                    onChange={(event) => updateSource(index, { note: event.target.value })}
                    placeholder="What this source supports (optional)"
                    aria-label={`Source ${index + 1} note`}
                    className="mt-2"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-ink-500">
              Links are displayed exactly as entered. Inkloom does not verify them independently.
            </p>
          </div>
          {['completed', 'validated'].includes(form.status) ? (
            <InfoCallout tone="info" title="Completion requires a source">
              At least one titled source is required before this record can be marked completed or validated.
            </InfoCallout>
          ) : (
            <InfoCallout tone="neutral" title="Work not completed">
              This record will be labelled {titleCase(form.status)}. Do not describe results that were not produced.
            </InfoCallout>
          )}
          {formError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{formError}</p>
          ) : null}
        </div>
      </Modal>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-500">
        <ArrowUpRight className="h-3 w-3" />
        Research records are maintained by the organization role and retained in the demo workspace.
      </p>
    </div>
  );
}
