# Inkloom AI — Project Status

## Product state

Inkloom AI is a working, evidence-first brand-governance demo for the fictional **Acme Cloud Technologies** workspace. It runs locally with SQLite and no external services. Every finding comes from a deterministic rule match or a source-backed approved fact; images and scanned PDF pages are read by a local OCR engine whose output is stored and inspected, never simulated.

**Last verified:** 2026-10-30 (dark 3D-glass frontend redesign verified locally and deployed to Vercel as `e59bb17`; a live smoke check passed at 1440/390 px). The backend remains live from commit `ccf799b`, deployed 2026-10-29; live OCR is disabled by the Render configuration. See [Deployment](#deployment).

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
| Backend pytest suite | **84 passed**, 0 failed, 1 third-party deprecation warning, 45.20 s |
| Frontend helper tests | **27 passed**, 0 failed (711.62 ms) |
| TypeScript check | **0 errors** (`npx tsc --noEmit`) |
| Vite production build | 1,624 modules; JS 624.78 kB (gzip 158.98 kB), CSS 58.06 kB (gzip 10.90 kB); one chunk-size advisory |
| End-to-end browser journeys (2026-10-30) | **22 of 22 passed**: direct open, workspace switch, create/audit/correct/re-audit, submission, claim, comment, request changes, revision 3, approval, 14-event audit trail, image OCR, mixed PDF, insights, empty workspace, unauthorized actions, workspace isolation, refresh persistence. Console errors: 0 |
| Responsive sweep | **56 checks** (14 routes × 390/768/1024/1440 px), **0 horizontal overflow**; clipped-text flags were only `sr-only` spans |
| Overlay checks | Drawer, menus, and dialogs settled opaque and on-screen at 1440/1024/768/390 px with no horizontal overflow |
| Live deployment smoke (2026-10-29) | Historical: commit `ccf799b` on Vercel and Render; Round 3 dashboard, content, insights, onboarding, and 390 px drawer passed; session **201**, role-only header **401**, insights **200**; production OCR disabled |
| Live redesign smoke (2026-10-30) | Deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57` READY and aliased; dark canvas `rgb(7, 11, 24)`, 14 glass surfaces, sidebar/header rendered, **0 JS errors**, no horizontal overflow at 1440 and 390 px, workspace menu opaque at 390 px |

Exact commands, outputs, and journey details are in [VERIFICATION.md](docs/VERIFICATION.md).

### Deployment

| Component | Status | URL |
| --- | --- | --- |
| Frontend (Vercel, Vite) | Live — 3D-glass redesign, commit `e59bb17` | <https://inkloom-ai-rho.vercel.app> |
| API (Render, FastAPI) | Live — commit `ccf799b` | <https://inkloom-api.onrender.com> |
| GitHub source | Public | <https://github.com/hvavinash30/inkloom-ai> |

The 2026-10-30 dark 3D-glass redesign was committed as `e59bb17` and pushed to GitHub `main`, and Vercel built deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57` to READY, aliased to the production URL. The live frontend serves `assets/index-C1W67hZu.js` (624,811 bytes) and `assets/index-CjC3LMnu.css` (58,064 bytes); the local build emits a different JS hash because `VITE_API_BASE_URL` is baked in at build time. The backend was not rebuilt and still runs `ccf799b`.

The live smoke covered the deployed shell, Overview, workspace menu, dark styling, responsive overflow, and console health at 1440 and 390 px. The full 22-journey suite was executed locally, not against the live deployment.

Round 3 was committed as `ccf799b` and pushed to GitHub `main` on 2026-10-29. Vercel deployed automatically; Render required a manual deploy of the same commit because its auto-deploy did not trigger. Live probes confirm the Round 3 bundle, session issuance (**201**), rejection of role-only headers without a token (**401**), and governance insights (**200**). The Render service still sets `OCR_PROVIDER=none`, so image and scanned-PDF checks on the live site report OCR as disabled rather than returning invented text; local runs use `OCR_PROVIDER=auto` and perform real OCR.

The Render service runs on the free plan. It sleeps after inactivity (cold start can take about a minute) and its filesystem is ephemeral, so the deploy reseeded the demo workspace and future restarts reset uploaded files and stored changes. The startup seed recreates the fictional demo workspace. Durable deployment requires a paid instance with a disk, or Postgres plus object storage.

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
- **The redesign is deployed but live-tested only at smoke level.** The 2026-10-30 dark 3D-glass interface is live on Vercel; the 22 browser journeys were run locally, and only shell, Overview, menu, styling, overflow, and console health were rechecked against the deployment.
- **Frontend verification is Chromium-only.** Widths 390/768/1024/1440 px were tested; Safari, Firefox, real devices, screen readers, and automated axe audits were not.

---

## Recommended next steps (not implemented)

1. Re-run the full journey suite against the live deployment, not just the smoke check, and redeploy the backend so frontend and API share a commit.
2. Replace demo sign-in with Supabase Auth and map verified identities to workspace roles.
3. Add Alembic migrations and bring the Supabase starter schema to parity.
4. Add object storage with signed URLs and retention policies.
5. Draw stored OCR bounding boxes over the source image/PDF.
6. Add assignment notifications and fact-review reminders.
7. Commit an end-to-end test suite and run it in CI, including axe and cross-browser coverage for the redesign.

Full details: [ROADMAP.md](docs/ROADMAP.md).
