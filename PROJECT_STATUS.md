# Inkloom AI — Project Status

## Product state

Inkloom AI is a working, evidence-first brand-governance demo for the fictional **Acme Cloud Technologies** workspace. It runs locally with SQLite and no external services. Every finding comes from a deterministic rule match or a source-backed approved fact; images and scanned PDF pages are read by a local OCR engine whose output is stored and inspected, never simulated.

**Last verified:** 2026-10-28 (Round 3, local). The live sites still serve the previous build; see [Deployment](#deployment).

---

## What is built

### Content and checks — completed
- Text, PDF, image, video, and transcript submissions with server-side type, size, and page checks.
- Deterministic rule scanning (prohibited phrases, claim restrictions, tone, naming, required terminology).
- Approved-fact contradiction detection, unsupported quantitative claims, and human-review fallbacks.
- Findings store exact text, page number or timestamp, source reference, verification status, confidence, and explanation.
- Scores expose their deduction factors and are labelled as workflow aids, not legal/scientific risk ratings.

### Multimodal auditing (OCR) — completed
- Local RapidOCR reads PNG/JPEG/WebP images and scanned PDF pages; PyMuPDF renders pages. No external OCR service or API key.
- Mixed PDFs keep native and scanned pages separate, with true page numbers (`Page 1`, `Page 2`, …).
- Per-line OCR text, confidence, normalized bounding boxes, and page number are stored (`ocr_lines`).
- Findings link to exact extracted spans (`start_index`/`end_index`), with `Image text` location labels for images.
- Extraction statuses (`processed`, `no_text`, `needs_ocr`, `error`) are shown in the UI with OCR line counts and mean confidence; failures are recorded as processing limitations, never as fake text.
- Visual qualities (contrast, logo usage, layout) remain human-review items.

### PDF intelligence — completed
- Real text extraction with `pypdf`, one stored text block per page.
- Page-linked findings and page preservation in the evidence view.
- Authenticated streaming endpoint and a real in-app PDF viewer.
- Explicit errors for encrypted, empty, over-limit, missing-text, and invalid PDFs.
- Manual page-text fallback that preserves page boundaries and attaches no fake source file.

### Video truth scanner — completed
- MP4/WebM/MOV storage and playback through a real `<video>` element.
- Timestamped transcript parsing (`[MM:SS] text`) and timestamp-linked findings.
- Transcript-only records show “No source file attached”; no placeholder player is rendered.
- No transcription. When a transcript is missing, the check states that boundary and requests one.

### Secure collaborative approvals — completed
- Server-issued demo sessions; only a SHA-256 token hash is stored. Role and workspace are resolved server-side; client-declared role/workspace headers are ignored.
- Sessions expire (default 12 h); logout revokes only the current session; cross-workspace records and file downloads are isolated.
- Reviewer claim/assignment bound to the latest submitted version; idempotent claim, admin-only reassignment, superseded assignments recorded.
- Decisions bound to an exact version; duplicate and stale decisions rejected. Approving with open high-severity findings requires a written override reason.
- Immutable decision, assignment, dismissal, and override history with reviewer names and reasons.

### Review and versioning — completed
- Immutable version saves with change summaries.
- Version comparison using a line-based text diff.
- Review queue with search, priority filters, findings, evidence, and risk counts.
- Comments, approve/reject/request-changes decisions bound to an exact version.
- Required feedback for non-approval decisions; required override reason for high-risk approvals.
- Stale-approval detection when content changes after approval.

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
- Insights computed only from stored records, now including governance-risk signals: recurring violations (findings vs documents vs audit runs), frequently overridden rules with reasons/rate/review flag, approved facts needing verification, and unclear guideline signals. Every metric declares its method, sample size, and reporting window; empty states stay honest.
- Deterministic assistant that grounds replies in workspace records, declares `rule_based` mode, and exposes its evidence and limitations.

### Roles and workspace — completed
- Three demo roles with distinct server-enforced capabilities: Creator, Reviewer, Organization Admin.
- Workspace isolation checks on protected records and uploads, including file downloads.
- Team page with a role capability matrix.
- Settings for workspace identity, integration boundaries, and upload limits (including OCR availability).
- Fictional demo labelling throughout the shell and seeded records.

### UI and accessibility — completed
- Responsive shell with a desktop sidebar and a mobile drawer.
- White/soft-neutral surfaces, deep navy navigation, restrained blue accent, and status colors.
- Loading, empty, error, and access-denied states.
- Keyboard-focus styles, labelled controls, keyboard-operable tabs with tabpanel relationships, accessible field validation, and focus-trapped mobile navigation.
- Exact PDF-page, image-text, and transcript evidence highlights, with explicit unavailable-evidence states and no approximate matching.
- Long workspace names, evidence text, and research details wrap instead of clipping.

### Deployment configuration — completed
- Backend `Dockerfile` and `Procfile`.
- Frontend `vercel.json` SPA rewrite.
- SQLite zero-setup default with an optional Supabase Postgres connection.
- Starter Supabase migrations for the early core tables (not full runtime parity; no auth sessions, assignments, overrides, or OCR lines).
- Documented environment variables in both `.env.example` files.

---

## Verification summary

| Check | Result |
| --- | --- |
| Backend pytest suite | **84 passed**, 0 failed, 1 third-party deprecation warning, 43.23 s |
| Frontend helper tests | **27 passed** |
| TypeScript check | **0 errors** (`npx tsc --noEmit`) |
| Vite production build | 1,624 modules; JS 617.26 kB (gzip 157.62 kB), CSS 53.20 kB (gzip 9.48 kB); one chunk-size advisory |
| OCR browser journey | Image OCR, mixed PDF with page-linked findings, exact highlights, no horizontal overflow at 390 px |
| Review browser journey | Claim → assigned; approval blocked without override reason; reason recorded in decision history; no overflow |
| Insights browser journeys | All four governance-risk sections, drill-down, methods, empty states; 1440/768/390 px with no horizontal overflow |
| Regression browser journey | Dashboard, content list, Create Your Own Brand, 390 px mobile drawer/navigation |

Exact commands, outputs, and journey details are in [VERIFICATION.md](docs/VERIFICATION.md).

### Deployment

| Component | Status | URL |
| --- | --- | --- |
| Frontend (Vercel, Vite) | Live — **previous build** (pre-Round-3) | <https://inkloom-ai-rho.vercel.app> |
| API (Render, FastAPI) | Live — **previous backend** (pre-Round-3) | <https://inkloom-api.onrender.com> |
| GitHub source | Public | <https://github.com/hvavinash30/inkloom-ai> |

Round 3 is **not committed, pushed, or deployed**. Live probes on 2026-10-28: the Vercel bundle contains none of the Round 3 UI strings, and the Render API returns `404` for `/api/v1/auth/demo/session` and omits the `ocr_provider`/`ocr_reason` health fields the local build reports. See [Deployment state](README.md#deployment-state) and [ROADMAP.md](docs/ROADMAP.md) for the deploy checklist.

The Render service runs on the free plan. It sleeps after inactivity (cold start can take about a minute) and its filesystem is ephemeral, so uploaded files and stored changes reset on restart or redeploy. The startup seed recreates the fictional demo workspace. Durable deployment requires a paid instance with a disk, or Postgres plus object storage.

---

## Deliberate boundaries and deferred work

These are explicit product boundaries, not hidden gaps:

- **Demo identity, real sessions.** Tokens are server-issued, hashed, expiring, and workspace-scoped, but accounts are fictional and there is no external identity provider. Replace with Supabase Auth before real use.
- **Local OCR, bounded.** Clean printed Latin-script text reads well; handwriting, low-resolution scans, and complex layouts may fail and are reported honestly. OCR adds latency and is synchronous.
- **No LLM in any product path.** The assistant is deterministic and grounded in stored records.
- **No speech-to-text or frame/overlay analysis.** Video checks use supplied transcripts only. OCR boxes are stored but not drawn over images yet.
- **No external research or benchmarking.** Research records are internal documentation; evaluation is a five-case synthetic regression fixture.
- **No background jobs, notifications, or scheduled re-reviews.** All actions are user-triggered.
- **Single-node storage.** SQLite and local uploads are suitable for the demo; production needs Postgres, object storage, and real migrations (Alembic).
- **Supabase RLS is not the demo’s runtime boundary.** The migrations provide policy definitions for a production Postgres deployment; the local API uses a trusted SQLAlchemy connection.

---

## Recommended next steps (not implemented)

1. Deploy Round 3 (commit/push, Render redeploy) and verify the live OCR/auth/override journeys.
2. Replace demo sign-in with Supabase Auth and map verified identities to workspace roles.
3. Add Alembic migrations and bring the Supabase starter schema to parity.
4. Add object storage with signed URLs and retention policies.
5. Draw stored OCR bounding boxes over the source image/PDF.
6. Add assignment notifications and fact-review reminders.
7. Commit an end-to-end test suite and run it in CI.

Full details: [ROADMAP.md](docs/ROADMAP.md).
