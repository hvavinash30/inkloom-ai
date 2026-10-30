# Round 3 — Implementation Report

Date: 2026-10-28 (Round 3 features); post-Round-3 redesign recorded 2026-10-30.
Scope: three improvements to the existing Inkloom AI application (no rebuild, no route removals), followed by a presentation-only dark 3D-glass redesign.
Status: Round 3 is **implemented, verified locally, and deployed** on 2026-10-29 as commit `ccf799b` (live OCR is disabled by the production `OCR_PROVIDER=none` setting). The 2026-10-30 redesign is **implemented, verified locally, and deployed to Vercel** as commit `e59bb17`; see [Post-Round-3 redesign](#post-round-3--dark-3d-glass-frontend-redesign-2026-10-30).

This report records what was built, how it works, which records it produces, and its honest boundaries. Measured results are in [VERIFICATION.md](VERIFICATION.md).

---

## Improvement 1 — Multimodal brand auditing (COMPLETE)

### What changed

Images (PNG/JPEG/WebP) and scanned PDF pages are now read with a **local** OCR engine (RapidOCR, bundled ONNX models) and fed into the existing deterministic audit engine. Previously these formats were stored for human review only.

- **Ingestion** (`backend/app/services/ingestion.py`)
  - Images are decoded and validated with Pillow (format allow-list, pixel limit). Malformed, unsupported, or oversized files return `415`/`413` with explicit messages.
  - PDF pages with fewer than `OCR_MIN_NATIVE_CHARS` embedded characters are rendered with PyMuPDF and OCR-processed. Native and scanned pages can coexist in one PDF, and each finding keeps its true page number.
  - Extraction statuses are explicit: `processed`, `no_text`, `needs_ocr` (engine disabled/unavailable), `error`. A page OCR cannot read is reported as unreadable instead of being silently treated as empty.
  - OCR is bounded by page count (`OCR_MAX_PAGES`), image pixels, and a wall-clock timeout.
- **OCR service** (`backend/app/services/ocr_service.py`)
  - Lazy engine load with a lock; availability and reason are reported through `/health` (`ocr_configured`, `ocr_provider`, `ocr_reason`).
  - Per-line output: text, confidence, normalized bounding box, page number. Mean confidence and per-page line counts are stored.
  - `OCR_PROVIDER=none` disables OCR and records the limitation; it does not fabricate text.
- **Data model** (`backend/app/models/assets.py`)
  - New `ocr_lines` table (per upload, per line) plus OCR metadata on `uploaded_files`.
- **Audit wiring** (`backend/app/services/content_service.py`)
  - Image text runs through the same page-based audit path with `page_number=1` and `location_label="Image text"`, model label `image-ocr-v1`.
  - Findings store `start_index`/`end_index` against the stored extracted text, so highlights are exact.
  - OCR failure and no-text cases produce a `processing_issue` finding with the engine message in `extraction_notes`.
  - The extraction note no longer repeats the “visual qualities require a human reviewer” sentence when the engine message already contains it.
- **API** (`backend/app/api/v1/endpoints/uploads.py`, schemas)
  - Upload responses expose `extraction_status`, `extraction_message`, `page_texts`, `page_count`, and an `ocr` object (`available`, `provider`, `reason`, `line_count`, `mean_confidence`, `pages`, `lines`).
- **Frontend**
  - `NewContentPage`: accurate image-mode description (“OCR reads the text; visual checks stay manual”), extraction status/message panel, OCR availability callout driven by `/health`.
  - `DocumentPage`: “Extraction details” with OCR line count, mean confidence, per-page breakdown, and the full OCR line list with confidence; image Content & evidence now renders the extracted text with exact highlights and a missing-evidence note; page labels for native and OCR PDF pages.
  - Evidence text uses the existing index-first, then verbatim-search matcher — never fuzzy matching.

### Tests

`backend/tests/test_ocr.py` — **9 tests**, with fixtures generated at test time by PyMuPDF (no committed binary fixtures):

1. Image OCR feeds the audit and keeps evidence links (line confidence, bboxes in `0..1`, exact evidence span).
2. Scanned PDF is OCR-processed with page numbers (`Page 1`).
3. Mixed native/scanned PDF keeps pages apart (`native: 1`, `OCR: 1`; findings on pages 1 and 2; evidence spans match each page’s text).
4. Native text PDF uses embedded text without OCR lines.
5. OCR engine failure is reported without fake text (monkeypatched engine).
6. OCR unavailable is declared honestly (`needs_ocr`, no text).
7. Image validation rejects malformed, unsupported (GIF bytes named `.png`), and oversized images.
8. PDF validation rejects non-PDF bytes.
9. A scanned page with no readable text is reported as unreadable.

### Boundaries

- OCR reads printed Latin-script text well; handwriting, unusual fonts, tiny text, and complex layouts may be misread or skipped. Low-confidence output is visible but human confirmation is still required.
- Visual qualities (contrast, logo usage, layout) are not judged.
- OCR is synchronous in the request path; a large scan can add seconds to an upload. It is bounded, not queued.
- The local engine needs the `rapidocr-onnxruntime` wheel; on a host where it cannot load, the API reports OCR as unavailable rather than pretending it ran.

---

## Improvement 2 — Secure collaborative approvals (COMPLETE)

### What changed

- **Server-issued sessions** (`backend/app/models/auth.py`, `services/auth_service.py`, `api/v1/endpoints/auth.py`, `core/security.py`)
  - `GET /api/v1/auth/demo/accounts` lists fictional demo accounts (public, no secrets).
  - `POST /api/v1/auth/demo/session` issues an opaque `ink_…` token; only its SHA-256 hash is stored in `auth_sessions`.
  - `get_actor` resolves the token to a stored session and user; role and workspace come from that record. Client-declared role/workspace headers are ignored.
  - Sessions expire after `SESSION_TTL_HOURS` (default 12); expired sessions return `401`. Logout revokes only the presented session. A user keeps at most ten sessions.
  - Frontend keeps the token in memory, re-signs in on reload using the remembered demo role/workspace, and surfaces `401`s instead of silently continuing.
- **Workspace isolation**
  - Every protected query filters by the session’s workspace, including upload metadata and file downloads (`GET /api/v1/uploads/{id}/file`).
  - Cross-workspace record and file access return not-found/denied instead of leaking existence.
- **Reviewer assignment** (`backend/app/models/review.py`, `services/review_workflow_service.py`, `api/v1/endpoints/reviews.py`)
  - New `review_assignments` table, bound to the latest submitted version.
  - `GET/POST /api/v1/reviews/documents/{id}/assignment`; a reviewer can claim the review, an admin can assign another reviewer. Re-claiming with the same target is idempotent; a new assignment supersedes the previous one; only an admin can reassign someone else’s review.
  - Assignments require a submitted version; unsubmitted or superseded versions cannot be assigned or decided.
- **Decisions and overrides**
  - Decisions remain bound to an exact version; duplicate decisions and decisions on stale/superseded versions are rejected.
  - Approving while high-severity findings are open requires a written override reason (server-enforced minimum length). The reason is stored on the decision and in an append-only history event.
  - Finding dismissals create `finding_overrides` rows with reason, reviewer, rule, and document; the audit trail is append-only.
- **Frontend**
  - Session context signs in through the auth endpoints and exposes capabilities from the server response.
  - Review tab shows reviewer assignment (“Claim review”, “Assigned to you”, assignee with “assigned by”), and an approval dialog that blocks submission without an override reason when required.
  - Decision record shows reviewer, version, and the override reason.
  - Workspace switcher and “Create Your Own Brand” still work; they re-issue a session for the selected demo account (no onboarding gate).

### Tests

- `backend/tests/test_security.py` — **9 tests**: protected routes require a session; client role/workspace headers are ignored; creator cannot decide; reviewer cannot manage the workspace; cross-workspace records **and files** are isolated; logout revokes only the current session; expired sessions are rejected; the public demo-account directory contains no secrets; unknown workspace login is rejected.
- `backend/tests/test_review_workflow.py` — **5 tests**: assignment is version-bound and audited; an assigned reviewer blocks other reviewers; approval with open high findings requires a written override; unsubmitted/superseded versions cannot be decided; dismissals keep a reasoned override record.

### Boundaries

- Demo accounts are fictional and there is no password, MFA, or external identity provider. The session mechanics are real, but this is not production authentication.
- No background notifications when a review is assigned; the reviewer sees it on the queue/document page.
- No rate limiting on sign-in attempts; acceptable for the fictional demo only.

---

## Improvement 3 — Governance-risk insights (COMPLETE)

### What changed

`backend/app/services/insights_service.py` now derives governance-risk signals strictly from stored records, and the response declares its method and sample size for every metric (`metric_methods`, `reporting_window`).

- **Recurring violations** — grouped by rule (or category + title when no rule applies). Each group reports `finding_count`, `unique_documents`, `audit_run_count` (distinct runs), up to five document references, a sample quote, and first/last seen. One document checked twice counts as two findings in one document across two runs — not two documents. Status filters apply.
- **Frequently overridden rules** — built from `finding_overrides`: override count, unique documents, findings in scope, override rate against in-scope findings, reasons with counts and reviewer names, and `may_need_review` when a rule is overridden at least twice or at ≥50%. The UI frames this as “may need review”, not automatic policy change.
- **Approved facts needing verification** — expired, overdue, missing-source, or flagged facts with a reason per item, the active-fact denominator, and the recorded criteria. No facts are invented to fill the section.
- **Unclear guideline signals** — deterministic rule-text checks (vague terms, missing description, missing guidance, single short pattern), with the evaluated rule count and last-reviewed date.
- **Frontend** (`InsightsPage.tsx`, `lib/insights.ts`)
  - “Governance risk signals” summary cards scroll to detailed sections.
  - Recurring violations span the row with per-group metrics and document chips that navigate to the affected content.
  - Overrides, facts, and guideline cards show reasons, status badges, method notes, and honest empty states.
  - A “How these signals are computed” card lists each metric’s method, sample size, and window.
  - Fixed a pre-existing filter bug: the API returns `content_types`/`asset_types`/`statuses`, while the page read singular keys, leaving dropdowns empty.
- **Tests**
  - `backend/tests/test_insights.py` — **5 tests**: recurring-violation counts distinguish findings/documents/runs, status filter excludes, method sample sizes match the database; overridden rules report reasons/rate/review flag and stay workspace-scoped; facts needing verification use recorded criteria and isolation; unclear guideline signals come from rule text; an empty workspace reports zeros with sample sizes and “No completed checks”.
  - `frontend/scripts/insights.test.mjs` — 3 Node tests for override-rate formatting, hidden-chip counts, and pluralization.

### Boundaries

- Insights are descriptive counts and rates, not predictions or legal ratings.
- Small workspaces produce small samples; the UI states the sample size and does not hide it.
- Rule-text heuristics flag signals for human review; they do not declare a guideline objectively unclear.
- Override rates depend on dismissals being recorded with reasons (the server enforces a reason).

---

## Cross-cutting fixes

- Insights filter dropdown keys (see above).
- Image Content & evidence now shows extracted text with exact highlights; the section previously claimed highlights without rendering them for images.
- Duplicate sentence removed from image extraction notes.
- No routes, existing features, demo workspace, sidebar/role switcher, Create Your Own Brand flow, or dashboard panels were removed.

---

## Post-Round-3 — Dark 3D-glass frontend redesign (2026-10-30)

### Scope

Every existing route, dialog, drawer, menu, loading/empty/error/access-denied state, and workflow now uses one dark layered visual system. No route, feature, server contract, test, demo record, or backend behavior was removed. The application remains the same React + FastAPI product; there is no separate prototype or static replacement.

### What changed

- **Design tokens and surfaces** (`frontend/src/index.css`, `frontend/tailwind.config.js`): canvas `#070B18`, secondary `#0B1224`, raised `#111B32`, primary `#4388FF`, violet `#8765FF`, cyan `#36D9FF`, text `#F3F6FF`, muted `#A7B3CA`; Inter type stack. Fixed ambient gradients and a static perspective grid add depth without motion.
- **Layer utilities**: `.glass` (cards, 18 px blur), `.glass-soft` (secondary rows, 14 px blur), `.glass-strong` (overlays; fully opaque gradient plus 24 px blur so content cannot ghost through), `.glass-inset`, `.glass-sheen`, `.lift` (200 ms hover elevation), and restrained brand/violet glows. Radii: controls 8–12 px, cards 14–20 px, panels 18–24 px.
- **Shell and navigation** (`Shell.tsx`, `RoleSwitcher.tsx`, `AssistantDrawer.tsx`, `Toast.tsx`): dark sidebar with grouped navigation, sticky translucent header, workspace menu with `role="menu"`/`menuitemradio`, role switcher, mobile navigation dialog, assistant sheet, and toast surfaces. On small screens the workspace menu and drawer are fixed sheets with opaque surfaces.
- **Shared primitives** (`ui.tsx`): Card, PageHeader, Button, Badge, StatusBadge, SeverityBadge, Tabs, Dialog, Field, EmptyState, ErrorState, and Skeleton all use the new surfaces and focus styles, so every page inherits the system. Status is always written as text in addition to color.
- **Pages** (31 modified frontend files): Overview, Content list, New content, Document workspace/evidence, Reviews, Campaigns and campaign detail, Brand library, Policies, History, Insights, Research, Evaluation, Team, Settings, Create Your Own Brand, error states, plus their dialogs and empty states.
- **Responsive behavior**: single column on mobile, two columns at 768 px, sidebar plus multi-column layouts at 1024/1440 px. Wide tables and tab strips scroll inside their own region; page bodies do not overflow. Dialogs become full-height sheets at 390 px. Header action groups wrap and stay right-aligned.
- **Accessibility**: visible focus rings, labelled controls, semantic landmarks, `aria-expanded`/`aria-haspopup` menus, tab keyboard navigation (Arrow/Home/End), dialog focus trapping/restoration, and screen-reader labels for icon-only actions. `prefers-reduced-motion: reduce` removes animations, transitions, and hover lift.

### Verification

Measured against the final working tree on 2026-10-30 (details in [VERIFICATION.md](VERIFICATION.md)):

- Backend **84 passed**, 0 failed, 45.20 s; frontend **27 passed**, 0 failed, 711.62 ms; `tsc --noEmit` **0 errors**.
- Production build succeeded: 1,624 modules; JS 624.78 kB (gzip 158.98 kB), CSS 58.06 kB (gzip 10.90 kB); one chunk-size advisory.
- **22 of 22** end-to-end browser journeys passed, including the full create → audit → correct → revise → submit → claim → comment → request changes → resubmit → approve flow, audit trail, image OCR, mixed PDF, insights, empty workspace, unauthorized actions, workspace isolation, and refresh persistence. Console errors: **0**.
- **56** route-overflow checks (14 routes × 390/768/1024/1440 px) found **0 horizontal overflow**; the clipped-text scan flagged only `sr-only` helper spans. Overlay checks at four widths confirmed settled-opaque menus, dialogs, and drawer with no page bleed-through.

### Deployment

- The redesign is **deployed** to [Vercel](https://inkloom-ai-rho.vercel.app) as commit `e59bb17`, deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57`, ready 2026-10-30 03:05:49 UTC. Live assets are `assets/index-C1W67hZu.js` (624,811 bytes) and `assets/index-CjC3LMnu.css` (58,064 bytes).
- A live smoke check at 1440 and 390 px confirmed the dark canvas `rgb(7, 11, 24)`, 14 glass surfaces, sidebar and header, zero console errors, no horizontal overflow, and an opaque workspace menu inside the 390 px viewport. Full journey re-runs against the live site have not been done.
- The backend was not redeployed; Render still runs `ccf799b`, and live OCR remains disabled by `OCR_PROVIDER=none`.

### Boundaries

- Browser verification used Chromium only. Safari, Firefox, real devices, screen readers, and automated axe checks were not run.
- The bundle remains a single ~625 kB JS chunk; route-level code splitting was not added.
- The existing OCR, review, insights, and data semantics are unchanged; the redesign is presentation-only.
- No product PDF exists in the repository, so none was regenerated.

---

## Status summary

| Item | Status |
| --- | --- |
| 1. Multimodal brand auditing (images, scanned/mixed PDFs, evidence, tests) | **COMPLETE** (local) |
| 2. Secure collaborative approvals (sessions, isolation, assignment, overrides, audit trail, tests) | **COMPLETE** (local) |
| 3. Governance-risk insights (four signals, methods, drill-down, tests) | **COMPLETE** (local) |
| Integration and regression testing | **COMPLETE** (local browser + suites) |
| Deployment of Round 3 | **COMPLETE** — Vercel and Render deployed commit `ccf799b` on 2026-10-29; live OCR is disabled by `OCR_PROVIDER=none` |
| Dark 3D-glass frontend redesign (2026-10-30) | **COMPLETE AND DEPLOYED** — 22/22 journeys, 56/56 responsive checks, 0 console errors, build passes; live on Vercel as `e59bb17` with a passing smoke check |
| Documentation package | **COMPLETE** (this report, verification, roadmap, README, architecture, project status) |
| Updated product PDF | **NOT APPLICABLE** — no product PDF exists in the repository, so none was regenerated |
