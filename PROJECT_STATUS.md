# Inkloom AI — Project Status

## Product state

Inkloom AI is a working, evidence-first brand-governance demo for the fictional **Acme Cloud Technologies** workspace. It runs locally with SQLite and no external services. Every finding comes from a deterministic rule match or a source-backed approved fact; no LLM, OCR, or speech-to-text output is simulated.

**Last verified:** 2026-10-24

---

## What is built

### Content and checks — completed
- Text, PDF, image, video, and transcript submissions with server-side type, size, and page checks.
- Deterministic rule scanning (prohibited phrases, claim restrictions, tone, naming, required terminology).
- Approved-fact contradiction detection, unsupported quantitative claims, and human-review fallbacks.
- Findings store exact text, page number or timestamp, source reference, verification status, confidence, and explanation.
- Scores expose their deduction factors and are labelled as workflow aids, not legal/scientific risk ratings.

### PDF intelligence — completed
- Real text extraction with `pypdf`, one stored text block per page.
- Page-linked findings and page preservation in the evidence view.
- Authenticated streaming endpoint and a real in-app PDF viewer.
- Explicit errors for encrypted, empty, over-limit, missing-text, and invalid PDFs.
- Manual page-text fallback that preserves page boundaries and attaches no fake source file.
- No OCR. Image-only/scanned documents are labelled as requiring human review.

### Video truth scanner — completed
- MP4/WebM/MOV storage and playback through a real `<video>` element.
- Timestamped transcript parsing (`[MM:SS] text`) and timestamp-linked findings.
- Transcript-only records show “No source file attached”; no placeholder player is rendered.
- No transcription. When a transcript is missing, the check states that boundary and requests one.

### Review and versioning — completed
- Immutable version saves with change summaries.
- Version comparison using a line-based text diff.
- Review queue with search, priority filters, findings, evidence, and risk counts.
- Comments, approve/reject/request-changes decisions bound to an exact version.
- Required feedback for non-approval decisions.
- Stale-approval detection when content changes after approval.
- Immutable decision and activity history.

### Campaigns and brand memory — completed
- Campaign briefs, asset attachment, readiness, and cross-asset checks.
- Stored conflicts for pricing and other approved claims, with approved-value evidence.
- Conflict resolution records (agreed value + note) that do not silently rewrite content.
- Approved facts and rules with versioning, sources, status, review dates, archive/retire flows, and impact analysis.
- Rule conflict detection, recurring uncovered issues, rule simulation over stored text, and draft-rule creation.
- Visual assets and a server-calculated WCAG contrast check.

### Research, evaluation, insights, assistant — completed
- Research records with sections, status, structured details, and named sources.
- Completion/validation is refused without at least one titled source; planned work is visibly marked as not conducted.
- Five deterministic evaluation cases executed against the real engine, with stored outcomes.
- Insights computed only from stored audits and findings.
- Deterministic assistant that grounds replies in workspace records, declares `rule_based` mode, and exposes its evidence and limitations.

### Roles and workspace — completed
- Three demo roles with distinct server-enforced capabilities: Creator, Reviewer, Organization Admin.
- Workspace isolation checks on protected records.
- Team page with a role capability matrix.
- Settings for workspace identity, integration boundaries, and upload limits.
- Fictional demo labelling throughout the shell and seeded records.

### UI and accessibility — completed
- Responsive shell with a desktop sidebar and a mobile drawer.
- White/soft-neutral surfaces, deep navy navigation, restrained blue accent, and status colors.
- Loading, empty, error, and access-denied states.
- Keyboard-focus styles, labelled controls, `aria-pressed` tabs, and dialog semantics.
- Long workspace names, evidence text, and research details wrap instead of clipping.

### Deployment configuration — completed
- Backend `Dockerfile` and `Procfile`.
- Frontend `vercel.json` SPA rewrite.
- SQLite zero-setup default with an optional Supabase Postgres connection.
- Starter Supabase migrations for the early core tables, RLS policies, and a smaller demo seed. These are not full runtime parity (campaigns, assets, uploads, research, and evaluation are created by SQLAlchemy) and are not used by the local demo.
- Documented environment variables in both `.env.example` files.

---

## Verification summary

| Check | Result |
| --- | --- |
| Backend pytest suite | 17 passed, 0 failed (1 third-party deprecation warning) |
| TypeScript check + Vite production build | 0 errors; 1,619 modules; JS 519.92 kB (gzip 135.00 kB), CSS 45.60 kB (gzip 8.15 kB); one chunk-size advisory |
| Responsive sweep (1440 / 834 / 325 px) | 63 page loads; 0 console errors, 0 overflow, 0 HTTP ≥ 400, 0 invalid object rendering |
| Creator + reviewer browser workflow | 9/9 checks passed, including fix → version → review → stale approval → compare, PDF, and transcript-only video |
| Admin browser workflow | 10/10 checks passed, including brand-library CRUD, contrast, simulation, draft rule, conflict resolution, research edit, 5/5 evaluation cases, settings, team, mobile drawer |

The browser workflows ran against an isolated copy of the demo database and uploads. The delivered workspace remains as seeded.

### Deployment

| Component | Status | URL |
| --- | --- | --- |
| Frontend (Vercel, Vite) | Live | <https://inkloom-ai-rho.vercel.app> |
| API (Render, FastAPI) | Live | <https://inkloom-api.onrender.com> |
| GitHub source | Public | <https://github.com/hvavinash30/inkloom-ai> |

The live smoke check loaded the Creator and Organization Admin dashboards from the Render API with no console errors. The Vercel build has `VITE_API_BASE_URL` set to the Render API; only that public URL is stored in Vercel.

The Render service runs on the free plan. It sleeps after inactivity (cold start can take about a minute) and its filesystem is ephemeral, so uploaded files and stored changes reset on restart or redeploy. The startup seed recreates the fictional demo workspace. Durable deployment requires a paid instance with a disk, or Postgres plus object storage, as noted in `render.yaml`.

---

## Deliberate boundaries and deferred work

These are explicit product boundaries, not hidden gaps:

- **No production authentication.** The role switcher is demo-only. Server capability checks are real, but identity is not verified.
- **No LLM in any product path.** The optional LLM environment variables are reported as a configuration flag only.
- **No OCR or image text extraction.** Images and scanned PDFs require human review; manual page text is an honest fallback.
- **No speech-to-text or frame/overlay analysis.** Video checks use supplied transcripts only.
- **No external research or benchmarking.** Research records are internal documentation; evaluation is a five-case synthetic regression fixture.
- **No background jobs, notifications, or scheduled re-reviews.** All actions are user-triggered.
- **Single-node storage.** SQLite and local uploads are suitable for the demo; production needs Postgres, object storage, and a real auth provider.
- **Supabase RLS is not the demo’s runtime boundary.** The migrations provide policy definitions for a production Postgres deployment; the local API uses a trusted SQLAlchemy connection.

---

## Recommended next steps (not implemented)

1. Replace the demo role header with Supabase Auth and map verified identities to workspace roles.
2. Add object storage with signed URLs and per-workspace retention policies.
3. Add an opt-in OCR provider with confidence reporting and a clear human-review fallback.
4. Add an opt-in transcription provider that preserves real word timestamps and labels low-confidence segments.
5. Expand evaluation beyond synthetic fixtures only when real, consented test data exists.
6. Add background re-review reminders for facts approaching their next review date.
