# Inkloom AI — Project Status

## Product state

Inkloom AI is a working, evidence-first brand-governance demo for the fictional **Acme Cloud Technologies** workspace. It runs locally with SQLite and no external services. Every finding comes from a deterministic rule match or a source-backed approved fact; images and scanned PDF pages are read by a local OCR engine whose output is stored and inspected, never simulated.

**Last verified:** 2026-10-30. Automatic video auditing (speech-to-text plus on-screen OCR) was implemented and verified locally on 2026-10-30 with **102 backend tests**, a clean production build, and a real video upload/audit flow; it is **not committed, pushed, or deployed**. The dark 3D-glass frontend redesign remains deployed on Vercel as `e59bb17`, and the backend still runs `ccf799b` with OCR disabled. See [Deployment](#deployment).

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

### Automatic video auditing — completed locally
- MP4/WebM/MOV storage and playback through a real `<video>` element; upload validation covers extension, MIME, container signature, and the 120 MiB limit.
- On upload, FFmpeg extracts audio and the configured `openai_whisper`-compatible provider transcribes it with provider timestamps; FFmpeg also samples bounded frames and local RapidOCR reads visible text.
- Speech and visual stages are independent. Unconfigured, failed, audio-less, or OCR-unavailable stages preserve the other stage's results, report the exact reason, and add a `processing_issue` finding; verification is downgraded instead of claiming complete coverage.
- On-screen findings carry `On-screen mm:ss`, an authenticated frame reference/JPEG, and OCR limitations; spoken findings carry `Spoken mm:ss` (automatic) or `Timestamp mm:ss` (manual).
- Persisted extraction state, stage-level UI, polling, retry without re-upload, explicit re-transcription, cancel, duplicate-submission guard, and startup recovery for interrupted jobs.
- Manual transcripts remain optional and take precedence; transcript-only assets still show “No source file attached” and no fake player.
- Workspace isolation applies to uploads, frame files, retry, cancel, and audit submission.
- Provider keys stay server-side; health and upload state report configuration names/states, never secret values.

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
- Responsive dark shell with a desktop sidebar, sticky translucent header, mobile drawer, and shared layered glass surfaces.
- One 3D-glass design system across every route, dialog, drawer, menu, and empty/loading/error state: canvas `#070B18`, raised surfaces, illuminated borders, and restrained blue/violet/cyan glows. Content, forms, and tables remain flat and upright.
- Controls 8–12 px radius, cards 14–20 px, panels 18–24 px; Inter typography; 150–250 ms motion with `prefers-reduced-motion` support.
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
| Backend pytest suite | **102 passed**, 0 failed, 1 third-party deprecation warning, 35.78 s |
| Video pipeline tests | **18 passed**, 0 failed, 20.47 s |
| Frontend helper tests | **27 passed**, 0 failed (711.62 ms) |
| TypeScript check | **0 errors** (`npx tsc --noEmit`) |
| Vite production build | 1,625 modules; JS 640.03 kB (gzip 162.91 kB), CSS 58.74 kB (gzip 11.02 kB); one chunk-size advisory |
| Automatic video flow (2026-10-30, local) | Uploaded a 4 s MP4 with no transcript; both stages completed; audit produced **2 critical findings** (`On-screen 00:00`, `Spoken 00:02`), score **40**, verification `verified`; authenticated frame preview, timestamp seek, and refresh recovery passed; 0 console errors. Speech used a local OpenAI-compatible mock; FFmpeg, RapidOCR, storage, and audit engine were real |
| Unconfigured speech-to-text (2026-10-30, local) | Second stack with `TRANSCRIPTION_PROVIDER=none`: panel showed `Partial results` (speech `Unavailable`, OCR `Complete`); the audit stored `partially_verified`, kept the on-screen contradiction, added one `Inspection limit` for unanalyzed speech, score **62**, and created no spoken findings or timestamps |
| End-to-end browser journeys (2026-10-30, prior redesign build) | **22 of 22 passed**: direct open, workspace switch, create/audit/correct/re-audit, submission, claim, comment, request changes, revision 3, approval, 14-event audit trail, image OCR, mixed PDF, insights, empty workspace, unauthorized actions, workspace isolation, refresh persistence. Console errors: 0 |
| Responsive sweep (prior redesign build) | **56 checks** (14 routes × 390/768/1024/1440 px), **0 horizontal overflow**; clipped-text flags were only `sr-only` spans |
| Overlay checks (prior redesign build) | Drawer, menus, and dialogs settled opaque and on-screen at 1440/1024/768/390 px with no horizontal overflow |
| Live deployment smoke (2026-10-29) | Historical: commit `ccf799b` on Vercel and Render; Round 3 dashboard, content, insights, onboarding, and 390 px drawer passed; session **201**, role-only header **401**, insights **200**; production OCR disabled |
| Live redesign smoke (2026-10-30) | Deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57` READY and aliased; dark canvas `rgb(7, 11, 24)`, 14 glass surfaces, sidebar/header rendered, **0 JS errors**, no horizontal overflow at 1440 and 390 px, workspace menu opaque at 390 px |

Exact commands, outputs, and journey details are in [VERIFICATION.md](docs/VERIFICATION.md); the video pipeline details and scenario matrix are in [VIDEO_AUDITING.md](docs/VIDEO_AUDITING.md).

### Deployment

| Component | Status | URL |
| --- | --- | --- |
| Frontend (Vercel, Vite) | Live — 3D-glass redesign, commit `e59bb17` | <https://inkloom-ai-rho.vercel.app> |
| API (Render, FastAPI) | Live — commit `ccf799b` | <https://inkloom-api.onrender.com> |
| GitHub source | Public | <https://github.com/hvavinash30/inkloom-ai> |

The 2026-10-30 dark 3D-glass redesign was committed as `e59bb17` and pushed to GitHub `main`, and Vercel built deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57` to READY, aliased to the production URL. The live frontend serves `assets/index-C1W67hZu.js` (624,811 bytes) and `assets/index-CjC3LMnu.css` (58,064 bytes); the local build emits a different JS hash because `VITE_API_BASE_URL` is baked in at build time. The backend was not rebuilt and still runs `ccf799b`.

**Automatic video auditing is local-only.** It has not been committed, pushed, or deployed. Deploying it requires setting `TRANSCRIPTION_PROVIDER=openai_whisper` and a secret `TRANSCRIPTION_API_KEY` (or `OPENAI_API_KEY`) in the host environment, choosing `OCR_PROVIDER=auto`, and ensuring enough memory for FFmpeg plus OCR. No provider credential is included in the repository.

The live smoke covered the deployed shell, Overview, workspace menu, dark styling, responsive overflow, and console health at 1440 and 390 px. The full 22-journey suite was executed locally, not against the live deployment.

Round 3 was committed as `ccf799b` and pushed to GitHub `main` on 2026-10-29. Vercel deployed automatically; Render required a manual deploy of the same commit because its auto-deploy did not trigger. Live probes confirm the Round 3 bundle, session issuance (**201**), rejection of role-only headers without a token (**401**), and governance insights (**200**). The Render service still sets `OCR_PROVIDER=none`, so image and scanned-PDF checks on the live site report OCR as disabled rather than returning invented text; local runs use `OCR_PROVIDER=auto` and perform real OCR.

The Render service runs on the free plan. It sleeps after inactivity (cold start can take about a minute) and its filesystem is ephemeral, so the deploy reseeded the demo workspace and future restarts reset uploaded files and stored changes. The startup seed recreates the fictional demo workspace. Durable deployment requires a paid instance with a disk, or Postgres plus object storage.

---

## Deliberate boundaries and deferred work

These are explicit product boundaries, not hidden gaps:

- **Demo identity, real sessions.** Tokens are server-issued, hashed, expiring, and workspace-scoped, but accounts are fictional and there is no external identity provider. Replace with Supabase Auth before real use.
- **Local OCR, bounded.** Clean printed Latin-script text reads well; handwriting, low-resolution scans, stylized video overlays, and complex layouts may fail and are reported honestly. OCR adds latency and is synchronous.
- **Speech-to-text requires manual provider configuration.** `TRANSCRIPTION_PROVIDER=none` is the default. Without `openai_whisper` plus a server-side key, the speech stage is unavailable; on-screen analysis still runs and the audit records the gap. Provider timestamps are preserved, and missing timestamps are never invented.
- **Video analysis is sampled.** Frames are taken at a bounded interval, so short overlays can be missed. Only visible text is checked; logo, colour, layout, motion, and audio tone are human-review items.
- **Video jobs are in-process.** One worker per API process with persisted progress, cancel/retry, and startup recovery. A restart marks in-flight work failed (retryable); it does not resume mid-stage. Multi-instance deployment needs a shared queue.
- **Automatic video auditing is not deployed.** It was verified locally; the live API still runs the previous backend. A real paid provider call was not made during verification (a local OpenAI-compatible mock was used).
- **No LLM in the audit path.** The assistant is deterministic and grounded in stored records; an optional LLM only drafts correction wording when configured.
- **No external research or benchmarking.** Research records are internal documentation; evaluation is a five-case synthetic regression fixture.
- **No background jobs, notifications, or scheduled re-reviews.** All actions are user-triggered.
- **Single-node storage.** SQLite and local uploads are suitable for the demo; production needs Postgres, object storage, and real migrations (Alembic).
- **Supabase RLS is not the demo’s runtime boundary.** The migrations provide policy definitions for a production Postgres deployment; the local API uses a trusted SQLAlchemy connection.
- **The redesign is deployed but live-tested only at smoke level.** The 2026-10-30 dark 3D-glass interface is live on Vercel; the 22 browser journeys were run locally, and only shell, Overview, menu, styling, overflow, and console health were rechecked against the deployment.
- **Frontend verification is Chromium-only.** Widths 390/768/1024/1440 px were tested; Safari, Firefox, real devices, screen readers, and automated axe audits were not.

---

## Recommended next steps (not implemented)

1. Review, commit, and deploy the automatic video pipeline; add the speech provider secret and `OCR_PROVIDER=auto` to the host, then make one real (paid) provider call and record latency, quota, and response-shape results.
2. Re-run the full journey suite against the live deployment, not just the smoke check, and redeploy the backend so frontend and API share a commit.
3. Replace demo sign-in with Supabase Auth and map verified identities to workspace roles.
4. Add Alembic migrations and bring the Supabase starter schema to parity.
5. Add object storage with signed URLs and retention policies.
6. Draw stored OCR bounding boxes over the source image/PDF, and consider a configurable denser frame sampling mode for short overlays.
7. Add assignment notifications and fact-review reminders.
8. Commit an end-to-end test suite and run it in CI, including axe and cross-browser coverage for the redesign and the video flow.

Full details: [ROADMAP.md](docs/ROADMAP.md).
