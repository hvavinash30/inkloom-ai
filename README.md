# Inkloom AI — Evidence-First Brand Governance

Inkloom AI is a full-stack demo of a brand-governance workspace. Writers submit copy, deterministic checks compare it with active brand rules and source-backed approved facts, and reviewers make version-bound decisions with the evidence in view.

The demo workspace — **Acme Cloud Technologies** — is explicitly fictional. Every seeded rule, fact, document, campaign, research note, and evaluation case is labelled as demo data.

**Live demo**
- App: <https://inkloom-ai-rho.vercel.app>
- API: <https://inkloom-api.onrender.com> (`/api/v1/health`)

The live app serves the dark 3D-glass redesign deployed on 2026-10-30 as commit `e59bb17`.

The Render free instance sleeps after inactivity, so the first request can take about a minute. Its filesystem is ephemeral: uploads and stored changes reset on restart or redeploy, and the fictional seed is recreated. See [Deploy](#deploy-vercel--render) for durable options.

**What this build is**
- A working React + FastAPI application with three server-enforced demo roles: Creator, Reviewer, and Organization Admin. Sign-in issues an expiring server-side session; role and workspace are resolved from that session, never from browser headers.
- Deterministic content checks: literal/regex rule matching plus approved-fact contradiction and unsupported-claim detection.
- Real PDF text extraction, preserved page numbers, page-linked findings, and an authenticated PDF viewer. Scanned PDF pages and PNG/JPEG/WebP images are read locally with RapidOCR, with line-level confidence and recorded page numbers.
- Real video playback when a file exists, plus transcript-timestamp audits when one is supplied.
- Versioned content, reviewer assignment, human review decisions bound to an exact version, written override reasons when high-risk findings remain, campaign cross-asset conflicts, brand memory, research records, measured evaluation runs, and stored-data insights.
- Governance-risk insights computed from stored records only: recurring violations, frequently overridden rules with reasons, approved facts due for verification, and unclear guideline signals — each with its method, sample size, and reporting window.

**Frontend redesign (2026-10-30).** Every route, dialog, drawer, menu, and state now uses the dark 3D-glass design system described in [Design system](#design-system): near-black navy canvases, layered translucent panels, illuminated borders, and restrained blue/violet/cyan glows. Content, forms, and tables remain flat and upright. The redesign was verified locally and deployed to Vercel as commit `e59bb17` on 2026-10-30; the live smoke check passed. See [Verification results](#verification-results) and [Deployment state](#deployment-state).

**What this build is not**
- It does not call an LLM in the audit path, the assistant, OCR, or transcription. There is no simulated AI output anywhere.
- It does not transcribe video. Image and scanned-PDF text comes from a local OCR engine whose output is stored, inspectable, and fed to the same deterministic rules; visual qualities still require a human reviewer.
- It is not a production identity system. Demo accounts sign in through server-issued bearer sessions, but there is no external identity provider. Replace the demo sign-in with Supabase Auth (or similar) before real use.

---

## Demo workspace and roles

The seed creates one fictional workspace and three users:

| Role | Demo user | Server capabilities |
| --- | --- | --- |
| Creator | Jordan Patel | Create, check, revise, and submit their own content; read brand rules/facts; use the assistant |
| Reviewer | Alex Rivera | Read all content, review queue, comment, approve/reject/request changes, resolve campaign conflicts |
| Organization Admin | Sarah Chen | Everything above plus brand library, assets, policies, team, research, evaluation, insights, and settings |

Authorization is re-checked by the API on every protected request. The browser signs in through `POST /api/v1/auth/demo/session`, receives an opaque `ink_…` bearer token, and stores only that token in memory (plus the selected role/workspace for the next demo sign-in). The server stores a SHA-256 hash, resolves the token to a database user, and takes the role and workspace from that record. Client-supplied role headers or workspace headers are ignored. A production build must replace the demo sign-in with Supabase Auth or another identity provider.

### Seeded demo records

- 6 active brand rules and 1 draft rule, including uptime promises, market-rank claims, product capitalization, cheapest-platform positioning, and a pricing disclaimer.
- 9 approved facts (8 current, 1 expired), each with a named fictional source such as `Demo Enterprise Master Service Agreement §7.1`.
- `LinkedIn Launch Post` with 7 findings, `Q4 Enterprise Brochure (PDF)` with 6 findings and real page numbers, `Launch Webinar (transcript only)` with timestamped findings, and `Enterprise Launch Email` with no findings.
- `Q4 Enterprise Launch` campaign with two unresolved pricing conflicts.
- 6 research records across planned, in-progress, completed, and validation sections; planned work is labelled as not conducted.
- 5 deterministic evaluation cases with stored expected outcomes.

---

## Capability map

### Creator
- New content in text, PDF, image, video, or transcript form. Images and scanned PDF pages are OCR-processed on the server and checked like other text.
- Drafts, campaigns, and campaign attachment.
- Evidence-backed findings with severity, location, source reference, verification status, and risk explanation. Image findings carry a page number and `Image text` location label.
- Apply a suggested correction in the editor, revise, save an immutable version, re-check, and submit for review.
- Track review status, reviewer assignment, comments, requested changes, approvals, stale approvals, and version history.

### Reviewer
- Priority queue computed from stored findings, with search and high-risk filters.
- Claim a review, see who it is assigned to, or (as an admin) assign it to another reviewer for the latest submitted version.
- Findings, evidence, source references, and version context in one place.
- Comments and decisions tied to an exact version: approve, reject, or request changes with required feedback. Approving while high-severity findings are open requires a written override reason.
- Version comparison and an immutable decision record that keeps the override reason and reviewer name.
- Campaign conflict resolution with an agreed value and a recorded note.

### Organization Admin
- Overview with live counts, recent activity, and integration boundaries.
- Team and role capability matrix.
- Brand library: approved facts, deterministic rules, visual assets, contrast checks, impact analysis, and archive flows.
- Policies & brand memory: rule conflicts, uncovered recurring issues, a rule simulator over stored text, and draft-rule creation.
- Campaigns, cross-asset consistency, readiness, and conflict records.
- Audit history and governance risk insights derived only from stored records, with drill-down into affected documents.
- Research & validation records with named sources.
- Evaluation cases executed against the deterministic engine.
- Workspace settings, upload limits, and honest integration status (including local OCR availability).

---

## Evidence model

Every finding carries:
- a category and severity;
- the exact affected text and a page number or transcript timestamp when available;
- a rule or approved-fact reference where one applies;
- a verification status and confidence;
- an explanation in plain language.

Scores are a workflow aid, not a scientific or legal risk rating. The UI shows the deduction factors and labels the score method. Nothing is labelled “verified” unless a rule or approved fact was actually matched by the server. Findings without a supported source are marked for human review.

---

## PDF, image, and video truth

**PDF**
- Uploads are validated, stored server-side, and parsed with `pypdf`.
- Text pages are preserved individually, so findings point to the page that contains the quote.
- Pages without usable embedded text are rendered with PyMuPDF and read by RapidOCR. Native and OCR pages can coexist in one PDF; findings keep their true page numbers (`Page 1`, `Page 2`, …).
- Encrypted, empty, over-limit, or unreadable PDFs return an explicit processing message. A scanned page that OCR cannot read is reported as unreadable — never as empty content.
- If no page has extractable text, the UI says so and offers a manual page-text fallback. The fallback is labelled as pasted text, not OCR.
- The seeded PDF is streamed through an authenticated endpoint and displayed in a real viewer via a Blob URL.

**Image (PNG/JPEG/WebP)**
- Images are decoded and validated server-side; malformed, unsupported, or oversized files are rejected with explicit errors.
- OCR runs locally through RapidOCR (bundled ONNX models, no external API). The stored record keeps per-line text, confidence, normalized bounding boxes, and page number.
- Findings carry a page number, an `Image text` location label, and an evidence span that matches the extracted text exactly. The document page shows the extracted text with highlights and the OCR line list with confidence.
- Extraction failure, missing OCR, or unreadable images are recorded as processing limitations instead of producing fake text. Contrast, logo usage, and layout remain human-review items.

**Video**
- MP4/WebM/MOV files are stored and played with a real `<video>` element.
- Checks use a timestamped transcript supplied by the user (for example `[00:42] We deliver 100% uptime.`).
- When no file is attached, the UI says “No source file attached” and never renders a fake player.
- Without a transcript, the check reports that transcription is unavailable and asks for a transcript. No timestamps are invented.

---

## Secure collaborative approvals

- **Server-issued identity.** Demo accounts sign in at `POST /api/v1/auth/demo/session`; the API returns an opaque bearer token and stores only its hash. Every protected route resolves the token to a stored session and a user record, then applies that user's role capabilities and workspace scope. Workspace isolation covers records and file downloads.
- **Version-bound assignment.** A reviewer claims a review for the latest submitted version, or an admin assigns it to another reviewer. Responses are idempotent, superseded assignments are marked, and every change is written to the document history.
- **Decisions stay bound to the reviewed version.** Approve/reject/request-changes records the exact version. The same decision cannot be applied twice, and outdated versions cannot be decided after a newer submission.
- **Reasoned overrides.** Approving while high-severity findings are open requires a written override reason, which is stored in the decision record and shown in the decision history. Non-approval decisions still require feedback.
- **Immutable trail.** Decision records, assignment history, dismissals, and override reasons are append-only audit entries. The UI shows the reviewer, version, and reason.

## Governance risk insights

Insights are computed from stored audit runs, findings, dismissals, facts, and rule text — never from estimates:

- **Recurring violations** report finding count, unique documents, and audit-run count separately, so one document checked twice is not double-counted as two documents. Each group links to the affected documents.
- **Frequently overridden rules** count dismissal records with reasons, show the override rate against findings in scope, list reviewer names, and flag rules that "may need review".
- **Approved facts needing verification** list expired, overdue, or missing-source facts with the criteria used and the active-fact denominator.
- **Unclear guideline signals** come from deterministic rule-text checks (vague terms, missing descriptions or guidance, single-word patterns) and show the evaluated rule count.
- Every section states its method, sample size, and reporting window. Empty workspaces show zeroed states with their sample sizes instead of invented data.

See `docs/ROUND3_IMPROVEMENTS.md` for the implementation report and `docs/VERIFICATION.md` for measured results.

---

## Assistant, research, and evaluation

- **Assistant**: deterministic, workspace-grounded replies with a declared mode (`rule_based`), verification status, grounding items, suggested actions, and limitations. It retrieves stored findings, rules, facts, campaign conflicts, and records; it does not call an external model.
- **Research & validation**: records what was actually done, with sources typed exactly as entered. A record cannot be marked completed/validated without at least one titled source. Planned work remains visibly marked as not conducted.
- **Evaluation**: runs fixed cases through the real deterministic engine and stores the measured outcome. The five seeded cases cover an uptime contradiction, clean copy, legacy spelling, PDF page preservation, and transcript timestamp preservation. This is a regression fixture, not an external benchmark.

---

## Design system

The interface uses one dark, layered visual system across every route, dialog, drawer, menu, and state. It is implemented with CSS custom properties and Tailwind extensions in `frontend/src/index.css` and `frontend/tailwind.config.js`; no page carries a separate theme.

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#070B18` | Page background, fixed ambient gradients, static perspective grid |
| Secondary | `#0B1224` | Elevated background bands and inputs |
| Raised | `#111B32` | Cards, table headers, selected navigation |
| Primary | `#4388FF` | Primary actions, links, focus accents |
| Violet | `#8765FF` | Secondary accent, gradient endpoint |
| Cyan | `#36D9FF` | Informational accent |
| Text | `#F3F6FF` | Primary text |
| Muted | `#A7B3CA` | Secondary text and metadata |

- **Layers, not fake 3D.** Depth comes from stacked translucent surfaces, 1 px illuminated borders, inset top highlights, soft ambient shadows, and restrained glows. Text, forms, tables, and charts stay flat and upright; nothing is perspective-tilted.
- **Surface scale.** `.glass` (cards and panels, 18 px blur), `.glass-soft` (secondary rows, 14 px blur), `.glass-strong` (menus, dialogs, drawers; an opaque gradient so page content never shows through overlays, 24 px blur), `.glass-inset` (wells), `.glass-sheen` (top-light), `.lift` (200 ms hover elevation), and `.glow-brand`/`.glow-violet` (primary and selected emphasis).
- **Type and shape.** Inter with system fallbacks; controls 8–12 px radius, cards 14–20 px, panels 18–24 px. Status is always written as text, never conveyed by color alone.
- **Motion.** 150–250 ms transitions for hover, menus, dialogs, and drawers; no parallax or continuous animation. `prefers-reduced-motion: reduce` removes animations, transitions, and hover lift.
- **Responsive behavior.** Single-column layouts on mobile, two-column at 768 px, and the full sidebar plus multi-column dashboards at 1024/1440 px. Wide tables scroll inside their own region; the page body does not overflow. Dialogs and the assistant drawer become full-height sheets on small screens.
- **Accessibility.** Semantic landmarks; visible focus rings; labelled controls; a workspace menu with `role="menu"`/`menuitemradio`, `aria-expanded`, Escape and outside-click close; tab lists with arrow/Home/End navigation; modal dialogs that trap and restore focus; screen-reader-only labels for icon-only controls.

---

## Architecture

```text
inkloom/
├── backend/                        # FastAPI + SQLAlchemy + SQLite
│   ├── app/
│   │   ├── api/v1/endpoints/       # auth, audits, reviews, history, campaigns, brand memory,
│   │   │                           # research, evaluation, organization, uploads, insights, assistant
│   │   ├── core/                   # settings, session resolution, capability checks
│   │   ├── db/                     # engine and sessions
│   │   ├── models/                 # workspaces, users, auth sessions, rules, facts, assets,
│   │   │                           # documents, versions, findings, decisions, comments,
│   │   │                           # assignments, overrides, campaigns, OCR lines
│   │   ├── schemas/                # Pydantic contracts
│   │   └── services/               # ingestion, OCR, PDF, deterministic audit, review workflow,
│   │                               # conflicts, brand memory, insights, evaluation, assistant, seed
│   ├── data/uploads/               # server-owned upload storage
│   ├── tests/                      # 84 pytest unit/integration tests (OCR fixtures are generated)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── Procfile
├── frontend/                       # React 18 + TypeScript + Vite + Tailwind
│   ├── src/pages/                  # dashboard, content, reviews, campaigns, brand library,
│   │                               # policies, history, insights, research, evaluation,
│   │                               # team, settings
│   ├── src/components/             # shell, assistant drawer, dialogs, tables, UI primitives
│   ├── src/index.css               # dark tokens, glass layers, motion, reduced-motion
│   ├── src/lib/                    # evidence matching, insights formatting, router
│   ├── src/services/api.ts         # typed API client
│   ├── scripts/                    # Node helper tests (`npm run test:format`)
│   └── vercel.json                 # SPA rewrite for static hosting
├── supabase/migrations/            # starter PostgreSQL DDL, RLS policies, demo seed
│                                   # (core tables only; not full runtime parity)
├── docs/ARCHITECTURE.md
├── docs/ROUND3_IMPROVEMENTS.md
├── docs/VERIFICATION.md
├── docs/ROADMAP.md
├── docs/HACKATHON_ROUND2_REPORT.md
└── README.md
```

Data flow for a check:

```text
Browser → POST /api/v1/audits/submit-and-audit   (bearer session resolved to a workspace user)
        → validated upload or text
        → PDF/text extraction; local OCR for images and scanned pages
        → deterministic rule scan
        → approved-fact contradiction / unsupported-claim detection
        → severity deductions and score factors
        → persisted audit run + findings + immutable version
        → UI evidence inspector, review queue, campaign checks, history, insights
```

---

## Quickstart

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- API docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/api/v1/health`
- The SQLite database and fictional demo seed are created automatically on first start. Delete `backend/inkloom.db` and `backend/data/uploads/` only if you deliberately want to reset the demo.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The Vite dev server proxies `/api` to `http://127.0.0.1:8000`.

---

## Deploy (Vercel + Render)

The API is a long-running FastAPI process with SQLite and local file storage, so it belongs on Render (or another server host). Vercel serves the static frontend. Both steps require your own account sign-in; no secrets go into Vercel.

### 1. API on Render

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, select the repository, and apply the root `render.yaml`.
3. Set `CORS_ORIGINS` to the final Vercel origin as a JSON array, for example `["https://inkloom-ai.vercel.app"]`.
4. Confirm `https://<service>.onrender.com/api/v1/health` returns `status: online`.

The free plan sleeps and has an ephemeral filesystem, so SQLite data and uploaded files reset on restart or redeploy; the startup seed recreates the demo workspace. For durable evidence files, use a paid instance with a disk and point `DATABASE_URL` and `UPLOAD_DIR` at the mount path. See the comments in `render.yaml`.

### 2. Frontend on Vercel

1. Import the same repository and set **Root Directory** to `frontend` (framework: Vite).
2. Add a Production environment variable: `VITE_API_BASE_URL=https://<service>.onrender.com/api/v1`. Vite bakes this in at build time.
3. Deploy. `frontend/vercel.json` keeps client-side routes on `index.html`.
4. If the assigned Vercel domain differs from the value in Render, update `CORS_ORIGINS` and redeploy the API.

The only browser-visible configuration is the public API URL; role checks, upload limits, and integration decisions remain server-side.

---

## Environment variables

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./inkloom.db` | Server-side persistence. A Supabase Postgres URL can be used instead. |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | API bind address. |
| `CORS_ORIGINS` | localhost:3000/5173 | JSON array of allowed origins, e.g. `["https://inkloom-ai.vercel.app"]`. Commas alone are not valid because the setting is parsed as a list. |
| `UPLOAD_DIR` | `backend/data/uploads` | Server-owned file storage. Relative paths resolve from the backend working directory. |
| `MAX_UPLOAD_BYTES` | 26,214,400 (25 MiB) | PDF, image, and transcript limit. |
| `MAX_VIDEO_UPLOAD_BYTES` | 125,829,120 (120 MiB) | Video limit. |
| `MAX_PDF_PAGES` | `120` | Page limit for PDF extraction. |
| `DEMO_MODE` | `true` | Enables demo sign-in and demo labels. |
| `SESSION_TTL_HOURS` | `12` | Expiry for server-issued demo sessions. |
| `DEFAULT_WORKSPACE_ID` / `DEFAULT_WORKSPACE_NAME` | seeded Acme Cloud IDs | Workspace created by the seed. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | empty | Optional server-side credentials for a Postgres deployment. Never expose these to the browser. |
| `LLM_PROVIDER` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | `mock` / empty | Reported as an integration flag only. This build does not call an LLM. |
| `OCR_PROVIDER` | `auto` | `auto`/`rapidocr` run local RapidOCR; `none` disables OCR and reports the limitation. No external service or API key is used. |
| `OCR_MAX_PAGES` | `12` | Scanned pages processed per PDF (native text pages are not limited by this). |
| `OCR_RENDER_DPI` | `150` | PDF page render resolution for OCR. |
| `OCR_MAX_IMAGE_PIXELS` | `20000000` | Image decode limit; larger images are rejected with `413`. |
| `OCR_TIMEOUT_SECONDS` | `60` | Wall-clock budget per OCR page/image. |
| `OCR_MIN_NATIVE_CHARS` | `12` | Pages with fewer embedded characters fall back to OCR. |
| `TRANSCRIPTION_PROVIDER` | `none` | No speech-to-text is bundled. |

Frontend (`frontend/.env`, see `frontend/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | API prefix used by the browser; the dev proxy forwards it. |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Development proxy target. |
| `PORT` | `3000` | Vite dev-server port. |

The frontend contains no Supabase keys, service-role credentials, or LLM keys. Upload limits, workspace checks, role checks, and integration decisions are all enforced server-side.

---

## Supabase PostgreSQL (optional; starter migrations only)

The supported demo path is SQLite. The files in `supabase/migrations/` are an **early starter subset**, not a complete production migration set:

- `001_initial_schema.sql` covers workspaces, users, rules, facts, content, versions, audit runs/findings, comments, decisions, and history events.
- `002_rls_policies.sql` adds workspace-scoped RLS for those core tables.
- `003_seed_demo_data.sql` seeds the fictional core workspace, users, rules, and facts.
- Campaigns, campaign conflicts, uploaded files, brand assets, research records, and evaluation cases/runs are created by SQLAlchemy at runtime and are **not** in these migrations. The SQL seed is also smaller than the runtime demo seed.

If you point `DATABASE_URL` at Postgres, SQLAlchemy creates the current runtime tables on startup, but the starter migrations must not be treated as the authoritative schema. Generate and review a new migration from `backend/app/models/` before any real deployment. The demo API uses a trusted server connection with application role checks; RLS is not the runtime authorization boundary here. Replace the demo identity layer with Supabase Auth before storing real data.

---

## Verification results

The redesign was verified locally on 2026-10-30 against the final working tree and then smoke-tested on the live deployment.

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `cd backend && .venv\Scripts\python.exe -m pytest -q` | **84 passed**, 0 failed, 1 third-party deprecation warning, 45.20 s. Includes OCR fixtures generated at test time, session/security tests, review-workflow tests, and insights tests. |
| Frontend helper tests | `cd frontend && npm run test:format` | **27 passed**, 0 failed (Node test runner, 711.62 ms). |
| TypeScript | `cd frontend && npx tsc --noEmit` | **0 errors**. |
| Production build | `cd frontend && npm run build` | **0 TypeScript errors**; 1,624 modules transformed; JS 624.78 kB (gzip 158.98 kB), CSS 58.06 kB (gzip 10.90 kB); built in 16.36 s; one chunk-size advisory. |
| End-to-end journeys | Headless Chrome (CDP), local API + Vite | **22 of 22 journeys passed** with the data recorded in [VERIFICATION.md](docs/VERIFICATION.md): direct open, workspace switch, create/audit (score 0, 7 findings), re-run, evidence inspection, correction, version 2 (score 100), re-audit, submission, reviewer claim, comment, request changes, revision to version 3, approval, audit trail (14 events), image OCR, mixed PDF, insights, empty workspace, unauthorized actions, workspace isolation, and refresh persistence. Console errors: **0**. |
| Responsive sweep | Headless Chrome, 14 routes × 390/768/1024/1440 px | **56 checks, 0 horizontal overflow.** A clipped-text scan flagged only `sr-only` helper spans, which are intentionally visually hidden. |
| Overlay checks | Headless Chrome, 1440/1024/768/390 px | Assistant drawer, workspace/role menus, and dialogs settle fully opaque (entry animation 200–240 ms) and stay on-screen with no horizontal overflow; dialogs are opaque at 390 px. |
| Live redesign smoke | Headless Chrome (CDP) + curl, <https://inkloom-ai-rho.vercel.app> | **PASS (2026-10-30)** — deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57` is READY at commit `e59bb17`; live CSS `index-CjC3LMnu.css` contains the dark tokens and opaque `.glass-strong` gradient; body background `rgb(7, 11, 24)`; 14 glass surfaces; sidebar/header render; no onboarding gate; **0 JS errors**; `scrollWidth == innerWidth` at 1440 and 390 px; workspace menu settled opaque and inside the 390 px viewport. |
| Historical Round 3 smoke | 2026-10-29, pre-redesign | **PASS for the Round 3 build** (`ccf799b`); retained as history. |

`npm run build` runs `tsc` before Vite, which is the static type check used here; there is no ESLint configuration in this repository. Browser checks used a temporary headless-Chrome CDP harness outside the repository (Playwright is not installed in this environment), so those scripts are not part of the delivered application. Verification covered Chromium only; Safari, Firefox, real mobile devices, screen readers, and automated axe checks were not run.

The local browser journeys ran against the local development database. They created a `Lifecycle QA …` text document with versions 1–3 and its audits/comments/decisions, two OCR verification documents (image and mixed PDF), and a throwaway empty workspace; no production data was touched. The live deployment was smoke-tested separately and serves the redesign.

---

## Deployment state

The 3D-glass frontend is **live** on Vercel from commit `e59bb17` (deployed 2026-10-30). The backend is unchanged and still runs commit `ccf799b`.

| Component | Serves | Redesign? |
| --- | --- | --- |
| Vercel frontend <https://inkloom-ai-rho.vercel.app> | `assets/index-C1W67hZu.js` (624,811 bytes) + `assets/index-CjC3LMnu.css` (58,064 bytes), commit `e59bb17` | **Yes** — deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57` reached READY. The alias has since served docs-only commits (currently `7aa6774`), which rebuild identical frontend assets. Live smoke: dark body background, 14 glass surfaces, sidebar/header, opaque menus, no onboarding gate, 0 JS errors, no overflow at 1440/390 px. |
| Render API <https://inkloom-api.onrender.com> | Commit `ccf799b` (Round 3) | **Backend unchanged** — the redesign is frontend-only. `/api/v1/auth/demo/session` returns **201**, and `/api/v1/health` reports `ocr_configured: false`, `ocr_provider: "none"` with the explicit reason `OCR is disabled by configuration (OCR_PROVIDER=none)`. |

The redesign was pushed to GitHub `main` as `e59bb17`; Vercel built and promoted it automatically. Round 3 was previously committed as `ccf799b` and deployed on 2026-10-29; Render did not auto-trigger from that push despite `autoDeploy` being enabled, so the API was deployed manually to that commit. The Render service still runs with `OCR_PROVIDER=none`; image and scanned-PDF uploads on the live site therefore report OCR as disabled instead of inventing text. Local runs use `OCR_PROVIDER=auto` and perform real OCR. Set the Render variable to `auto` to enable it there; the free instance has 512 MB of memory, so verify memory headroom and latency first.

Render's free-plan filesystem is ephemeral: the deploy reseeded the fictional demo workspace, and uploads or edits made on the live site reset on the next restart or deploy.

---

## Hackathon demo script

1. **Open as Organization Admin (Sarah Chen).** Show the Overview: live findings, review load, campaign conflicts, integration boundaries.
2. **Brand library.** Point out 6 active rules and 8 current approved facts (plus one expired price). Open an approved fact to show its named source, version, and review date.
3. **Policies & brand memory.** Simulate `100%` at high severity. The server counts matches in stored content. Create a draft rule and note that it is inactive until an admin activates it.
4. **Creator flow.** Switch to Jordan Patel. Create a text asset with: `Acme Cloud is the #1 fastest platform with 100% uptime at INR 11,499!!!`
   - Run the check. Open the findings: the uptime claim contradicts the approved 99.9% SLA; the rank claim is unsupported; the price conflicts with the rate card; the punctuation/positioning rules fire.
   - Apply a suggested correction, save version 2, re-check, and submit for review.
5. **Reviewer flow.** Switch to Alex Rivera. Open the priority queue, filter to high risk, read the evidence, comment, and request changes with required feedback on that exact version.
6. **Revision and stale approval.** Switch back to the creator, revise, save version 3, resubmit. Approve version 3 as reviewer. Edit again to version 4 and show that the approval is now explicitly stale. Compare versions to see the text diff.
7. **PDF intelligence.** Open `Q4 Enterprise Brochure (PDF)`. Show the authenticated viewer, page 2 findings, and source references. Upload a non-PDF or invalid PDF to show the visible server error. Open the manual page-text fallback to show that page boundaries survive without a source file.
8. **Image OCR.** Create an image check with a PNG containing `AcmeCloud is the cheapest platform.` Show the extraction status (processed, OCR lines, mean confidence), then open the document: findings link to `Image text`, and the Content & evidence tab shows the extracted text with exact highlights.
9. **Scanned and mixed PDFs.** Upload a PDF with one native and one scanned page. Show the extraction note “native: 1, OCR: 1” and findings on both `Page 1` and `Page 2`, then open Page 2 to show the OCR-read text.
10. **Video truth.** Open `Launch Webinar (transcript only)`. Show a timestamped finding at `00:42` and the explicit “No source file attached” state. Explain that no transcription or timestamps are invented. If a real MP4 is available, upload it and show the real player.
11. **Campaign governance.** Open `Q4 Enterprise Launch` → Conflicts. Show the two pricing conflicts, record a resolution with an agreed value and note, and point out that the affected asset text must still be updated separately.
12. **Research and evaluation.** In Research, show planned records labelled “Work not completed” and source-backed completed records. In Evaluation, run all cases: 5 deterministic cases execute and pass from the current workspace records.
13. **Assistant.** Ask “What are the highest risk findings on this document?” Show the grounded evidence list and declared `rule_based` mode — no external model, no fabricated citations.
14. **Secure approvals.** As reviewer, claim the review; point out the assignment is bound to the latest submitted version. Approve a version with open high-severity findings and show that the server blocks the decision until a written override reason is entered; then show the reason and reviewer in the decision record.
15. **Governance-risk insights.** As admin, open Insights. Walk through recurring violations (findings vs documents vs audit runs), rules with an override rate and “may need review” flag, approved facts needing verification, and unclear guideline signals — then the method, sample size, and reporting window for each.
16. **Settings.** Show upload limits and integration status, including local OCR availability and the explicit statement that audits do not call an LLM or an external OCR service.

---

## Known limitations

- **Demo identity, strong session handling.** Accounts sign in with server-issued tokens and the API enforces capabilities and workspace scope on every request, but there is no external identity provider or password policy. Do not use with confidential material.
- **Local OCR, not perfect OCR.** RapidOCR reads printed Latin-script text well; handwriting, unusual fonts, small text, and complex layouts may be read incorrectly or not at all. Low-quality extractions are reported honestly, but the text still needs human confirmation before a legal decision.
- **Visual qualities are not judged.** Contrast, logo usage, layout, and image composition remain human-review items.
- **No speech-to-text.** Video checks require a user-supplied timestamped transcript. No audio or frames are analyzed.
- **No external LLM.** The assistant is deterministic and grounded in stored records. It will not answer general world-knowledge questions as an LLM would.
- **Deterministic matching limits.** Rules are literal/regex matches and fact checks are based on stored values and patterns. The engine does not understand nuance, sarcasm, or visual context.
- **PDF layout.** Extraction preserves page text order but not columns, tables, or visual placement. Line-based diffs reflect extracted text, not visual layout.
- **Evaluation is a fixture.** Five synthetic cases verify regressions; they are not a benchmark of real-world accuracy.
- **Insights are descriptive.** Counts, rates, and signals are computed from stored records only; small sample sizes are labelled and do not predict legal or brand risk.
- **Live OCR is disabled on the free Render instance.** The deployment runs with `OCR_PROVIDER=none` because the free plan has limited memory; image and scanned-PDF checks there return an explicit “OCR is disabled” state. Local runs perform real OCR, and the live instance can be switched to `auto` once memory headroom is confirmed.
- **Live redesign smoke only.** The redesign is deployed and the live home page, menus, layout, and console were checked at 1440/390 px. The full 22-journey workflow suite was run locally, not against the live deployment.
- **Frontend verification is Chromium-only.** Widths 390/768/1024/1440 px were checked for overflow and overlays; Safari, Firefox, real devices, screen-reader testing, and automated axe audits were not run.
- **Single bundle.** The production build remains one ~625 kB JS chunk (Vite advisory); route-level code splitting was not added in this round.
- **No product PDF exists in the repository.** Only uploaded evidence PDFs are present, so no product PDF was regenerated.
- **Single-node demo storage.** SQLite and local disk uploads suit the demo. A multi-instance production deployment needs Postgres, object storage, and a real auth provider.
- **Supabase migrations are optional and not exercised by the local runtime.** RLS policies are included for a production Postgres setup; they are not active protections around the demo’s direct SQLAlchemy connection.

---

## License

MIT License. Built for the hackathon demo described above. All company names, users, sources, benchmarks, and results are fictional demo data.
