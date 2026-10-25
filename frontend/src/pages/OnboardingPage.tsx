import { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  Field,
  InfoCallout,
  Input,
  Textarea,
  cn,
} from '../components/ui';
import { navigate } from '../lib/router';
import { api, ApiError } from '../services/api';

interface ProfileForm {
  name: string;
  owner_name: string;
  description: string;
  industry: string;
  audience: string;
  voice: string;
  guidelines: string;
}

interface ClaimRow {
  claim: string;
  value: string;
  category: string;
}

interface TermRow {
  preferred: string;
  avoid: string;
}

type FormErrors = Record<string, string>;

const EMPTY_PROFILE: ProfileForm = {
  name: '',
  owner_name: '',
  description: '',
  industry: '',
  audience: '',
  voice: '',
  guidelines: '',
};

const EMPTY_CLAIM: ClaimRow = { claim: '', value: '', category: '' };
const EMPTY_TERM: TermRow = { preferred: '', avoid: '' };

function SectionCard({
  step,
  title,
  description,
  icon: Icon,
  children,
}: {
  step: number;
  title: string;
  description: string;
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Step {step}
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </Card>
  );
}

export function OnboardingPage() {
  const { selectWorkspace, setRole } = useSession();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [claims, setClaims] = useState<ClaimRow[]>([{ ...EMPTY_CLAIM }]);
  const [restricted, setRestricted] = useState<string[]>(['']);
  const [terms, setTerms] = useState<TermRow[]>([{ ...EMPTY_TERM }]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const setField = (key: keyof ProfileForm, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setErrors((current) => clearKey(current, key));
  };

  const firstError = Object.values(errors)[0];

  const focusField = (key: string) => {
    const element = document.getElementById(`setup-${key}`);
    if (element instanceof HTMLElement) element.focus();
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (profile.name.trim().length < 2) {
      next.name = 'Enter the brand or company name (at least 2 characters).';
    }
    if (profile.owner_name.trim().length < 2) {
      next.owner_name = 'Enter the workspace owner name.';
    }
    claims.forEach((row, index) => {
      const claim = row.claim.trim();
      const value = row.value.trim();
      if (!claim && !value) return;
      if (claim.length < 2) next[`claim-${index}-claim`] = 'Describe the claim in at least 2 characters.';
      if (!value) next[`claim-${index}-value`] = 'Add the approved value or wording.';
    });
    restricted.forEach((row, index) => {
      const phrase = row.trim();
      if (phrase && phrase.length < 2) {
        next[`restricted-${index}`] = 'Use at least 2 characters for a restricted claim.';
      }
    });
    terms.forEach((row, index) => {
      const preferred = row.preferred.trim();
      const avoid = row.avoid.trim();
      if (!preferred && !avoid) return;
      if (!preferred) next[`term-${index}-preferred`] = 'Add the preferred term.';
      if (!avoid) next[`term-${index}-avoid`] = 'Add the term to avoid.';
      if (preferred && avoid && preferred.toLowerCase() === avoid.toLowerCase()) {
        next[`term-${index}-avoid`] = 'The preferred and avoided terms must be different.';
      }
    });
    return next;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      window.requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createWorkspace({
        name: profile.name.trim(),
        owner_name: profile.owner_name.trim(),
        description: profile.description.trim() || undefined,
        industry: profile.industry.trim() || undefined,
        audience: profile.audience.trim() || undefined,
        voice: profile.voice.trim() || undefined,
        guidelines: profile.guidelines.trim() || undefined,
        approved_claims: claims
          .filter((row) => row.claim.trim() && row.value.trim())
          .map((row) => ({
            claim: row.claim.trim(),
            value: row.value.trim(),
            category: row.category.trim() || 'Approved claim',
          })),
        restricted_claims: restricted.map((row) => row.trim()).filter(Boolean),
        terminology: terms
          .filter((row) => row.preferred.trim() && row.avoid.trim())
          .map((row) => ({ preferred: row.preferred.trim(), avoid: row.avoid.trim() })),
      });
      selectWorkspace(created.id);
      setRole('admin');
      toast(`“${created.name}” is ready. You are viewing it as Organization Admin.`, 'success');
      navigate('/');
    } catch (caught) {
      setSubmitError(
        caught instanceof ApiError
          ? caught.detail
          : 'The workspace could not be created. Check the API connection and try again.'
      );
      setSubmitting(false);
    }
  };

  const configuredFacts = claims.filter((row) => row.claim.trim() && row.value.trim()).length;
  const configuredRestrictions = restricted.filter((row) => row.trim()).length;
  const configuredTerms = terms.filter((row) => row.preferred.trim() && row.avoid.trim()).length;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Overview
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
            <Users className="h-3 w-3 text-slate-400" aria-hidden />
            Demo identities · no sign-up
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
            New brand workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Create your own brand
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Everything below becomes the evidence Inkloom audits against. Only what you enter is used —
            the demo workspace's rules and facts are never inherited.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div
              ref={summaryRef}
              tabIndex={-1}
              role={firstError ? 'alert' : undefined}
              className={cn(
                'rounded-xl border px-4 py-3',
                firstError
                  ? 'border-rose-200 bg-rose-50'
                  : 'hidden'
              )}
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-rose-900">
                    {firstError
                      ? `${Object.keys(errors).length} field${Object.keys(errors).length === 1 ? '' : 's'} need attention`
                      : ''}
                  </p>
                  <ul className="mt-1 space-y-1 text-xs leading-5 text-rose-700">
                    {Object.entries(errors).map(([key, message]) => (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => focusField(key)}
                          className="text-left underline decoration-rose-300 underline-offset-2 hover:text-rose-900"
                        >
                          {message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <SectionCard
              step={1}
              title="Company profile"
              description="Who the workspace belongs to and who is accountable for its brand rules."
              icon={Building2}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company or brand name" htmlFor="setup-name" required error={errors.name}>
                  <Input
                    id="setup-name"
                    value={profile.name}
                    onChange={(event) => setField('name', event.target.value)}
                    maxLength={120}
                    autoComplete="organization"
                    placeholder="Northwind Analytics"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'setup-name-error' : undefined}
                  />
                </Field>
                <Field
                  label="Workspace owner"
                  htmlFor="setup-owner_name"
                  required
                  error={errors.owner_name}
                  hint="Becomes the demo admin identity for this workspace."
                >
                  <Input
                    id="setup-owner_name"
                    value={profile.owner_name}
                    onChange={(event) => setField('owner_name', event.target.value)}
                    maxLength={120}
                    autoComplete="name"
                    placeholder="Priya Sharma"
                    aria-invalid={Boolean(errors.owner_name)}
                    aria-describedby={errors.owner_name ? 'setup-owner_name-error' : undefined}
                  />
                </Field>
              </div>
              <Field
                label="Description"
                htmlFor="setup-description"
                hint="Optional. Shown on the workspace selector."
              >
                <Textarea
                  id="setup-description"
                  value={profile.description}
                  onChange={(event) => setField('description', event.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Data platform for finance teams."
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Industry" htmlFor="setup-industry" hint="Optional. Stored as a company profile fact.">
                  <Input
                    id="setup-industry"
                    value={profile.industry}
                    onChange={(event) => setField('industry', event.target.value)}
                    maxLength={120}
                    placeholder="B2B software"
                  />
                </Field>
                <Field label="Primary audience" htmlFor="setup-audience" hint="Optional. Stored as a company profile fact.">
                  <Input
                    id="setup-audience"
                    value={profile.audience}
                    onChange={(event) => setField('audience', event.target.value)}
                    maxLength={300}
                    placeholder="Finance leaders at mid-market companies"
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              step={2}
              title="Voice, tone, and writing guidance"
              description="Stored as brand facts so reviewers can cite them. Add enforceable rules in the brand library after creation."
              icon={Sparkles}
            >
              <Field
                label="Brand voice and tone"
                htmlFor="setup-voice"
                hint="Example: confident, plain-spoken, no hype, avoid exclamation marks."
              >
                <Textarea
                  id="setup-voice"
                  value={profile.voice}
                  onChange={(event) => setField('voice', event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Confident and plain-spoken. Explain the benefit before the feature. Never use hype or urgency."
                />
              </Field>
              <Field
                label="Additional guidelines"
                htmlFor="setup-guidelines"
                hint="Optional. Stored as a guidance note for reviewers; it is not turned into an automatic check."
              >
                <Textarea
                  id="setup-guidelines"
                  value={profile.guidelines}
                  onChange={(event) => setField('guidelines', event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Always include the security contact. Do not compare against named competitors."
                />
              </Field>
              <InfoCallout tone="info" title="Guideline documents">
                Upload brand guideline PDFs or text files from the brand library after the workspace is
                created. Stored files are kept as source references and are not automatically converted into
                enforced rules.
              </InfoCallout>
            </SectionCard>

            <SectionCard
              step={3}
              title="Approved facts"
              description="Statements reviewers can rely on. Audits flag content that contradicts these values."
              icon={FileText}
            >
              <div className="space-y-3">
                {claims.map((row, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Approved fact {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setClaims((current) => current.filter((_, position) => position !== index));
                          setErrors((current) => clearGroup(current, `claim-${index}-`));
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label={`Remove approved fact ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                    <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Claim"
                        htmlFor={`setup-claim-${index}-claim`}
                        error={errors[`claim-${index}-claim`]}
                      >
                        <Input
                          id={`setup-claim-${index}-claim`}
                          value={row.claim}
                          onChange={(event) => {
                            const value = event.target.value;
                            setClaims((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, claim: value } : item
                              )
                            );
                            setErrors((current) => clearKey(current, `claim-${index}-claim`));
                          }}
                          maxLength={300}
                          placeholder="Enterprise list price"
                          aria-invalid={Boolean(errors[`claim-${index}-claim`])}
                          aria-describedby={
                            errors[`claim-${index}-claim`] ? `setup-claim-${index}-claim-error` : undefined
                          }
                        />
                      </Field>
                      <Field
                        label="Approved value"
                        htmlFor={`setup-claim-${index}-value`}
                        error={errors[`claim-${index}-value`]}
                      >
                        <Input
                          id={`setup-claim-${index}-value`}
                          value={row.value}
                          onChange={(event) => {
                            const value = event.target.value;
                            setClaims((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, value } : item
                              )
                            );
                            setErrors((current) => clearKey(current, `claim-${index}-value`));
                          }}
                          maxLength={500}
                          placeholder="USD 49 per user per month"
                          aria-invalid={Boolean(errors[`claim-${index}-value`])}
                          aria-describedby={
                            errors[`claim-${index}-value`] ? `setup-claim-${index}-value-error` : undefined
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3">
                      <Field
                        label="Category"
                        htmlFor={`setup-claim-${index}-category`}
                        hint="Optional. Defaults to “Approved claim”."
                      >
                        <Input
                          id={`setup-claim-${index}-category`}
                          value={row.category}
                          onChange={(event) => {
                            const value = event.target.value;
                            setClaims((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, category: value } : item
                              )
                            );
                          }}
                          maxLength={100}
                          placeholder="Pricing"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
              {claims.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs leading-5 text-slate-500">
                  No approved facts yet. Audits can still check restricted claims and terminology, but product
                  claims cannot be verified against a stored fact.
                </p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setClaims((current) => [...current, { ...EMPTY_CLAIM }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add approved fact
              </Button>
            </SectionCard>

            <SectionCard
              step={4}
              title="Restricted claims"
              description="Phrases that must not appear in published content. Each one becomes an active high-severity prohibited-phrase rule."
              icon={ShieldCheck}
            >
              <div className="space-y-2.5">
                {restricted.map((row, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Field
                      className="min-w-0 flex-1"
                      label={index === 0 ? 'Restricted phrase' : undefined}
                      htmlFor={`setup-restricted-${index}`}
                      error={errors[`restricted-${index}`]}
                    >
                      <Input
                        id={`setup-restricted-${index}`}
                        value={row}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRestricted((current) =>
                            current.map((item, position) => (position === index ? value : item))
                          );
                          setErrors((current) => clearKey(current, `restricted-${index}`));
                        }}
                        maxLength={200}
                        placeholder="guaranteed results"
                        aria-invalid={Boolean(errors[`restricted-${index}`])}
                        aria-describedby={
                          errors[`restricted-${index}`] ? `setup-restricted-${index}-error` : undefined
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => {
                        setRestricted((current) => current.filter((_, position) => position !== index));
                        setErrors((current) => clearGroup(current, `restricted-${index}`));
                      }}
                      className={cn(
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                        index === 0 ? 'mt-5' : ''
                      )}
                      aria-label={`Remove restricted phrase ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              {restricted.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs leading-5 text-slate-500">
                  No restricted claims yet. You can add prohibited phrases later in the brand library.
                </p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRestricted((current) => [...current, ''])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add restricted phrase
              </Button>
            </SectionCard>

            <SectionCard
              step={5}
              title="Preferred terminology"
              description="Each pair becomes a product-naming rule that flags the avoided term and suggests the preferred one."
              icon={CheckCircle2}
            >
              <div className="space-y-3">
                {terms.map((row, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Terminology {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setTerms((current) => current.filter((_, position) => position !== index));
                          setErrors((current) => clearGroup(current, `term-${index}-`));
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-white hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        aria-label={`Remove terminology pair ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                    <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Use this"
                        htmlFor={`setup-term-${index}-preferred`}
                        error={errors[`term-${index}-preferred`]}
                      >
                        <Input
                          id={`setup-term-${index}-preferred`}
                          value={row.preferred}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTerms((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, preferred: value } : item
                              )
                            );
                            setErrors((current) => clearKey(current, `term-${index}-preferred`));
                          }}
                          maxLength={120}
                          placeholder="Northwind Cloud"
                          aria-invalid={Boolean(errors[`term-${index}-preferred`])}
                          aria-describedby={
                            errors[`term-${index}-preferred`]
                              ? `setup-term-${index}-preferred-error`
                              : undefined
                          }
                        />
                      </Field>
                      <Field
                        label="Instead of"
                        htmlFor={`setup-term-${index}-avoid`}
                        error={errors[`term-${index}-avoid`]}
                      >
                        <Input
                          id={`setup-term-${index}-avoid`}
                          value={row.avoid}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTerms((current) =>
                              current.map((item, position) =>
                                position === index ? { ...item, avoid: value } : item
                              )
                            );
                            setErrors((current) => clearKey(current, `term-${index}-avoid`));
                          }}
                          maxLength={120}
                          placeholder="NorthwindCloud"
                          aria-invalid={Boolean(errors[`term-${index}-avoid`])}
                          aria-describedby={
                            errors[`term-${index}-avoid`]
                              ? `setup-term-${index}-avoid-error`
                              : undefined
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
              {terms.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs leading-5 text-slate-500">
                  No terminology pairs yet. Brand naming checks will not run until a pair is added.
                </p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTerms((current) => [...current, { ...EMPTY_TERM }])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add terminology pair
              </Button>
            </SectionCard>

            {submitError ? (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
                <p className="font-medium">The workspace was not created.</p>
                <p className="mt-0.5">{submitError}</p>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Setup summary</h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Approved facts</dt>
                  <dd className="font-medium tabular-nums text-slate-800">{configuredFacts}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Restricted claims</dt>
                  <dd className="font-medium tabular-nums text-slate-800">{configuredRestrictions}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Terminology pairs</dt>
                  <dd className="font-medium tabular-nums text-slate-800">{configuredTerms}</dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
                These counts are recorded with the workspace when you save.
              </p>
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">What happens next</h2>
              <ol className="mt-3 space-y-2.5 text-[11px] leading-5 text-slate-600">
                <li className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">
                    1
                  </span>
                  The workspace is created with admin, reviewer, and creator demo identities.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">
                    2
                  </span>
                  You are switched into it as Organization Admin, on an empty dashboard.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">
                    3
                  </span>
                  Upload content, run an audit, and review findings against the rules above.
                </li>
              </ol>
              <div className="mt-4">
                <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                  <ShieldCheck className="h-3 w-3" aria-hidden />
                  Saved on the server, not in the browser
                </Badge>
              </div>
            </Card>

            <InfoCallout tone="warning" title="Shared demo access">
              Roles are demo identities, not customer accounts. Anyone with this deployment can open any
              workspace, so do not enter confidential information. Production deployments need an
              authentication provider and server-enforced membership.
            </InfoCallout>

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              Create brand workspace
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <p className="text-[11px] leading-5 text-slate-500">
              Facts are recorded as self-declared during setup, not independently verified. You can remove or
              edit them later in the brand library.
            </p>
          </aside>
        </form>
      </main>
    </div>
  );
}

function clearKey(errors: FormErrors, key: string): FormErrors {
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

function clearGroup(errors: FormErrors, prefix: string): FormErrors {
  const next = { ...errors };
  Object.keys(next).forEach((key) => {
    if (key.startsWith(prefix)) delete next[key];
  });
  return next;
}
