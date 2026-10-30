# Inkloom AI — Evidence-First Brand Governance

Inkloom AI is a full-stack demo of a brand-governance workspace. Writers submit copy, deterministic checks compare it with active brand rules and source-backed approved facts, and reviewers make version-bound decisions with the evidence in view.

The demo workspace — **Acme Cloud Technologies** — is explicitly fictional. Every seeded rule, fact, document, campaign, research note, and evaluation case is labelled as demo data.

**Live demo**
- App: <https://inkloom-ai-rho.vercel.app>
- API: <https://inkloom-api.onrender.com> (`/api/v1/health`)

The live frontend auto-deployed from `main` serves the bright redesign and the complete Inkloom AI assistant (commit `516825a`, verified via live bundle `assets/index-MIQiRlJY.js`, 686,881 bytes, and `index-BExhdNgb.css`, 77,954 bytes). The floating orb launcher and voice action, animated thinking orb, safe Markdown replies, clipboard actions, Quality Snapshot polish, and permission-aware governance answers described below are all in that live bundle. The live API runs commit `57936c9` as Render deploy `dep-dbid68dg1s2s73elp56g` and exposes the assistant, video pipeline, system FFmpeg `5.1.9`, the video status/retry/cancel/frame routes, and the `video`/`transcription` health blocks. Speech-to-text is now configured with Groq's OpenAI-compatible Whisper endpoint (`whisper-large-v3-turbo`, free tier) using a server-side key; on-screen OCR remains disabled (`OCR_PROVIDER=none`) after a real video job exhausted the 512 MB free instance. Automatic video auditing therefore transcribes speech and audits it, but marks the on-screen stage unavailable and returns a `partial` result until OCR is re-enabled on a larger instance. See [Automatic video auditing](#automatic-video-auditing).

The Render free instance sleeps after inactivity, so the first request can take about a minute. Its filesystem is ephemeral: uploads and stored changes reset on restart or redeploy, and the fictional seed is recreated. See [Deploy](#deploy-vercel--render) for durable options.

**What this build is**
- A working React + FastAPI application with three server-enforced demo roles: Creator, Reviewer, and Organization Admin. Sign-in issues an expiring server-side session; role and workspace are resolved from that session, never from browser headers.
- Deterministic content checks: literal/regex rule matching plus approved-fact contradiction and unsupported-claim detection.
- Real PDF text extraction, preserved page numbers, page-linked findings, and an authenticated PDF viewer. Scanned PDF pages and PNG/JPEG/WebP images are read locally with RapidOCR, with line-level confidence and recorded page numbers.
- Automatic video auditing: a stored video is transcribed by the configured speech-to-text provider, sampled frames are read with local OCR, and both sources are checked with the same rules and approved facts. Manual transcripts remain optional and take precedence; transcript-only assets still work.
- Versioned content, reviewer assignment, human review decisions bound to an exact version, written override reasons when high-risk findings remain, campaign cross-asset conflicts, brand memory, research records, measured evaluation runs, and stored-data insights.
- Governance-risk insights computed from stored records only: recurring violations, frequently overridden rules with reasons, approved facts due for verification, and unclear guideline signals — each with its method, sample size, and reporting window.

**Frontend redesign (2026-10-30).** Every route, dialog, drawer, menu, and state uses the bright design system described in [Design system](#design-system): a pale blue canvas with a soft mesh and blueprint grid, white surface cards, navy ink, electric-blue accents, and soft layered shadows. The capability carousel, assistant, Quality Snapshot polish, floating launcher, orb states, Markdown replies, and assistant context are live on Vercel from `main` (commit `516825a`) and were verified locally and against the deployed build.

**What this build is not**
- It does not use a language model to make audit decisions. The deterministic rule/fact engine remains authoritative. An optional LLM drafts correction wording only when an admin configures a provider; it is never presented as verified proof.
- It does not pretend OCR or transcription ran. Images, scanned PDF pages, and sampled video frames are read locally by RapidOCR, and video speech is sent to the speech-to-text provider configured on the server. If a dependency or key is missing, the stage is reported as unavailable and the audit records the gap.
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
- Video upload with automatic speech-to-text and on-screen OCR. No transcript is required; a manual transcript is optional and takes precedence over automatic speech. Stage-level progress, retry, and cancel are shown from persisted server state.
- Drafts, campaigns, and campaign attachment.
- Evidence-backed findings with severity, location, source reference, verification status, and risk explanation. Image findings carry a page number and `Image text` location label; video findings carry `Spoken mm:ss` or `On-screen mm:ss`, and on-screen findings include a frame preview from the stored video.
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
- a source type where applicable: `spoken` (automatic or manual transcript) or `on_screen` (OCR from a sampled video frame);
- a rule or approved-fact reference where one applies;
- a verification status and confidence;
- an explanation in plain language;
- for on-screen video findings, the sampled frame timestamp and an authenticated frame reference.

On-screen findings are labelled as OCR output that may be misread; spoken findings are labelled as provider transcript evidence, not confirmed truth. Scores are a workflow aid, not a scientific or legal risk rating. The UI shows the deduction factors and labels the score method. Nothing is labelled “verified” unless a rule or approved fact was actually matched by the server. Findings without a supported source are marked for human review.

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

**Video (automatic)**
- MP4/WebM/MOV files are validated (extension, MIME, container signature, 120 MiB limit), stored, and played with a real `<video>` element through an authenticated endpoint.
- On upload, the server extracts audio with FFmpeg and sends it to the configured speech-to-text provider; provider segments and timestamps are stored. It also samples frames at a bounded interval and reads visible text with local RapidOCR. No transcript is required.
- Speech and on-screen stages are independent. A failed or unconfigured stage preserves the other stage's results, produces a `processing_issue` finding, and downgrades verification; the audit is never reported as complete coverage.
- Findings are `spoken` or `on_screen`, with real provider timestamps or sampled-frame timestamps. On-screen findings carry an authenticated frame preview; clicking a timestamp seeks the stored video.
- A manual transcript remains optional and takes precedence over automatic speech. A transcript-only asset still shows “No source file attached” and never renders a fake player.
- When speech-to-text is not configured, the on-screen stage still runs and the UI says exactly which stage is unavailable and why. No timestamps, transcripts, or OCR text are invented.

See [Automatic video auditing](#automatic-video-auditing) and `docs/VIDEO_AUDITING.md` for the pipeline, statuses, limits, configuration, and test matrix.

---

## Automatic video auditing

The video upload screen is the same content form as before, with an optional transcript collapsed away. After a supported video is stored, the server runs two independent stages:

| Stage | What runs | What is stored | What happens if it cannot run |
| --- | --- | --- | --- |
| Speech | FFmpeg extracts the audio; the configured `openai_whisper`-compatible provider transcribes it | Provider text, provider segment timestamps, language, provider/model names | Stage is `unavailable` or `failed` with the server's message; on-screen results are preserved |
| On-screen | FFmpeg samples bounded frames; local RapidOCR reads visible text | Frame timestamp, OCR text, and a stored JPEG per frame with visible text | Stage is `unavailable` or `failed` with the server's reason; spoken results are preserved |

The existing audit engine checks both sources against the workspace's active rules and approved facts. A spoken finding at provider time `00:02` is labelled `Spoken 00:02`; an on-screen finding is labelled `On-screen 00:00`, carries the frame reference, and can be checked against the frame preview. A processing-issue finding records any stage that did not run, and verification is `partially_verified` or `unable_to_verify` when coverage is incomplete.

Final states are `completed`, `partial`, `no_content`, `failed`, and `canceled` (plus `queued`/`processing`). The UI polls persisted state, offers retry without re-upload and explicit re-transcription, cancels in-flight work, and recovers after a refresh. The API rejects a second audit while processing with `409`.

**What must be configured manually**

- Speech-to-text is off by default. Set `TRANSCRIPTION_PROVIDER=openai_whisper` and a server-side `TRANSCRIPTION_API_KEY` (or `OPENAI_API_KEY`). Optional: `TRANSCRIPTION_API_BASE`, `TRANSCRIPTION_MODEL`, `TRANSCRIPTION_LANGUAGE`. Never put the key in the frontend or a `VITE_*` variable.
- FFmpeg is resolved from `FFMPEG_PATH`, a system install, or the bundled `imageio-ffmpeg` binary (already in `requirements.txt`).
- On-screen text needs `OCR_PROVIDER=auto` (or `rapidocr`) and enough host memory; `none` reports OCR as disabled.
- A durable deployment needs a persistent disk or object storage for uploads/frames plus a durable database.

The implementation, stage semantics, environment table, costs, and the 20-scenario verification matrix are in [docs/VIDEO_AUDITING.md](docs/VIDEO_AUDITING.md). Automatic video auditing was verified locally on 2026-10-30 and speech-only production auditing was verified live on the same day. Both tiers now run the current build (`57936c9`), and the live API has speech-to-text configured through Groq's free-tier `whisper-large-v3-turbo`; **on-screen OCR remains unavailable in production** because it was reverted to `none` after a real video job restarted the 512 MB instance. The UI reports OCR as unavailable and records the gap, so live video audits with speech finish as `partial` rather than `failed`; manual transcripts still work.

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

- **Assistant**: workspace-grounded replies with a declared mode, verification status, grounding items, suggested actions, and limitations. The deterministic rules engine always assembles the answer from stored findings, rules, facts, campaign conflicts, and records. When a server-side LLM is configured, it may rephrase that grounded answer and the response is labelled `grounded_llm` with the provider; a provider timeout or rate limit keeps the deterministic answer and reports `ai_error`. It never invents facts or answers general world knowledge.
- **Assistant surface**: a floating launcher on every route opens a bright, responsive drawer with the thinking orb, safe Markdown replies, evidence cards, copy, stop-generation, and new-conversation controls. On a document or campaign route the request carries that record's ID; elsewhere it carries the current page only. Document-context answers quote stored finding evidence and suggested corrections without changing the document, and the assistant cannot approve, publish, or delete. Governance insight answers and navigation actions are role-scoped: creators are told that workspace-wide insights need an admin and are sent to their content, while admins receive stored insights and a link to `/insights`; reviewers are sent to `/reviews`. `<strong>`, inline code, headings, and lists are rendered from a small React-node parser; no HTML is injected.
- **Voice chat**: the browser's Web Speech API captures speech, shows interim results, and submits the final transcript through the same message path as typed chat. The orb reflects real state (`idle`, `listening`, `processing`, `responding`, `speaking`, `error`), stops on completion, failure, cancel, and close, and the drawer cleans up timers and aborting requests on unmount. Typed chat works when speech recognition is unavailable; permission, unsupported-browser, empty-speech, and network states are shown explicitly. See [Known limitations](#known-limitations) for browser coverage.
- **Research & validation**: records what was actually done, with sources typed exactly as entered. A record cannot be marked completed/validated without at least one titled source. Planned work remains visibly marked as not conducted.
- **Evaluation**: runs fixed cases through the real deterministic engine and stores the measured outcome. The five seeded cases cover an uptime contradiction, clean copy, legacy spelling, PDF page preservation, and transcript timestamp preservation. This is a regression fixture, not an external benchmark.

---

## Design system

The interface uses one bright, layered visual system across every route, dialog, drawer, menu, and state. It is implemented with CSS custom properties and Tailwind extensions in `frontend/src/index.css` and `frontend/tailwind.config.js`; no page carries a separate theme.

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F5F8FF` | Page background with the soft blue/cyan/violet mesh and blueprint grid |
| Surface | `#FFFFFF` | Cards, drawers, dialogs |
| Soft surface | `#F6F9FF` | Secondary rows and inset wells |
| Tint | `#EEF4FF` | Selected navigation and highlighted facts |
| Primary | `#2F6BFF` | Primary actions, links, focus accents |
| Violet | `#7C5CFF` | Secondary accent, gradient endpoint |
| Cyan | `#22D3EE` | Informational accent |
| Ink | `#0C1C3D` | Primary text |
| Muted | `#5D708F` | Secondary text and metadata |

- **Layered light surfaces.** White cards sit on a pale blueprint grid with 1 px hairline borders, soft ambient shadows, and restrained blue/violet glows. Text, forms, tables, and charts stay flat and upright; nothing is perspective-tilted.
- **Surface scale.** `.glass` (white gradient card), `.glass-soft` (tinted secondary row), `.glass-strong` (opaque white menus, dialogs, and drawers so page content never shows through), `.glass-inset` (wells), `.surface-card`/`.surface-tint`, `.lift` (220 ms hover elevation), and `.glow-brand`/`.glow-violet` (primary and selected emphasis).
- **Type and shape.** Plus Jakarta Sans for display headings, Inter for body text, with system fallbacks; controls 8–12 px radius, cards 14–20 px, panels 18–24 px. Status is always written as text, never conveyed by color alone.
- **Motion.** 150–250 ms transitions for hover, menus, dialogs, and drawers. The assistant orb — a luminous core inside three elliptical rings that rotate at different speeds — and the live microphone levels animate only while the assistant is active. `prefers-reduced-motion: reduce` collapses animations and transitions to a single near-instant iteration, including the orb, and skips the decorative live level meter.
- **Responsive behavior.** Single-column layouts on mobile, two-column at 768 px, and the full sidebar plus multi-column dashboards at 1024/1440 px. Wide tables scroll inside their own region; the page body does not overflow. Dialogs and the assistant drawer become full-width sheets on small screens; the drawer measured 480 px at 1024/1440 px and 390 px at a 390 px viewport, with zero panel overflow.
- **Accessibility.** Semantic landmarks; visible focus rings; labelled controls; a workspace menu with `role="menu"`/`menuitemradio`, `aria-expanded`, Escape and outside-click close; tab lists with arrow/Home/End navigation; modal dialogs that trap and restore focus; screen-reader-only labels for icon-only controls including the floating assistant launchers. The drawer labels the orb's state in text, traps focus while open, and closes with Escape.

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
│   │   │                           # assignments, overrides, campaigns, OCR lines,
│   │   │                           # video extractions
│   │   ├── schemas/                # Pydantic contracts
│   │   └── services/               # ingestion, OCR, PDF, video pipeline, speech provider,
│   │                               # deterministic audit, review workflow,
│   │                               # conflicts, brand memory, insights, evaluation, assistant, seed
│   ├── data/uploads/               # server-owned upload storage and sampled video frames
│   ├── tests/                      # 102 pytest unit/integration tests (fixtures are generated)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── Procfile
├── frontend/                       # React 18 + TypeScript + Vite + Tailwind
│   ├── src/pages/                  # dashboard, content, reviews, campaigns, brand library,
│   │                               # policies, history, insights, research, evaluation,
│   │                               # team, settings
│   ├── src/components/             # shell, assistant drawer, evidence/frame previews, dialogs,
│   │                               # tables, UI primitives
│   ├── src/index.css               # bright tokens, layered surfaces, orb states, reduced-motion
│   ├── src/lib/                    # evidence matching, insights formatting, router, speech
│   ├── src/services/api.ts         # typed API client
│   ├── scripts/                    # Node helper tests (`npm run test:format`)
│   └── vercel.json                 # SPA rewrite for static hosting
├── supabase/migrations/            # starter PostgreSQL DDL, RLS policies, demo seed
│                                   # (core tables only; not full runtime parity)
├── docs/ARCHITECTURE.md
├── docs/VIDEO_AUDITING.md
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
        → video: stored speech transcript + per-frame OCR text (independent stages)
        → deterministic rule scan
        → approved-fact contradiction / unsupported-claim detection
        → severity deductions and score factors
        → persisted audit run + findings + immutable version
        → UI evidence inspector, frame previews, review queue, campaign checks, history, insights
```

Video processing runs when the file is uploaded, before the audit:

```text
POST /api/v1/uploads (kind=video)
  → validated file + persisted video_extractions row (queued)
  → single-worker job: FFmpeg audio → speech provider (timestamps preserved)
                       FFmpeg frames → local OCR (frame timestamp + JPEG)
  → GET /uploads/{id} polled by the UI; retry / cancel are explicit actions
  → POST /audits/submit-and-audit reads the stored transcript segments and frame text
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

Video upload works without extra setup: `imageio-ffmpeg` supplies FFmpeg and RapidOCR is installed by `requirements.txt`. To enable automatic speech-to-text, set `TRANSCRIPTION_PROVIDER=openai_whisper` and `TRANSCRIPTION_API_KEY` (or `OPENAI_API_KEY`) in `backend/.env`, then restart the API. Without a key, the on-screen stage still runs and the speech stage reports the exact reason it was skipped. See [docs/VIDEO_AUDITING.md](docs/VIDEO_AUDITING.md).

---

## Deploy (Vercel + Render)

The API is a long-running FastAPI process with SQLite and local file storage, so it belongs on Render (or another server host). Vercel serves the static frontend. Both steps require your own account sign-in; no secrets go into Vercel.

### 1. API on Render

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, select the repository, and apply the root `render.yaml`.
3. Set `CORS_ORIGINS` to the final Vercel origin as a JSON array, for example `["https://inkloom-ai.vercel.app"]`.
4. For automatic video speech, set `TRANSCRIPTION_PROVIDER=openai_whisper` and add `TRANSCRIPTION_API_KEY` (or `OPENAI_API_KEY`) as a secret in the Render dashboard. Do not add the key to `render.yaml`. Set `OCR_PROVIDER=auto` if you want on-screen frame OCR; confirm the instance has enough memory for FFmpeg plus OCR.
5. Confirm `https://<service>.onrender.com/api/v1/health` returns `status: online` and the expected transcription/video states.

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
| `LLM_PROVIDER` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | `mock` / empty | Optional server-side provider (`openai` or `gemini`) for AI-assisted correction wording and for rephrasing a record-grounded assistant answer. `mock` or empty means no provider: the assistant stays deterministic. The audit findings themselves never depend on the provider. Keys stay server-side. |
| `LLM_MODEL` | `gpt-4o-mini` | Provider model used for corrections and assistant wording. |
| `LLM_TIMEOUT_SECONDS` / `LLM_MAX_OUTPUT_TOKENS` / `AI_RATE_LIMIT_PER_MINUTE` | `20` / `700` / `12` | Provider timeout, output cap, and per-user request limit; failures fall back to the deterministic answer with an explicit error. |
| `OCR_PROVIDER` | `auto` | `auto`/`rapidocr` run local RapidOCR for images, scanned PDF pages, and sampled video frames; `none` disables OCR and reports the limitation. No external service or API key is used. |
| `OCR_MAX_PAGES` | `12` | Scanned pages processed per PDF (native text pages are not limited by this). |
| `OCR_RENDER_DPI` | `150` | PDF page render resolution for OCR. |
| `OCR_MAX_IMAGE_PIXELS` | `20000000` | Image decode limit; larger images are rejected with `413`. |
| `OCR_TIMEOUT_SECONDS` | `60` | Wall-clock budget per OCR page/image/frame. |
| `OCR_MIN_NATIVE_CHARS` | `12` | Pages with fewer embedded characters fall back to OCR. |
| `TRANSCRIPTION_PROVIDER` | `none` | `openai_whisper` enables automatic speech-to-text through an OpenAI-compatible `/audio/transcriptions` endpoint. |
| `TRANSCRIPTION_API_KEY` | empty | Server-side provider key; falls back to `OPENAI_API_KEY`. Never expose it to the browser. |
| `TRANSCRIPTION_API_BASE` | `https://api.openai.com/v1` | Base URL for the compatible transcription endpoint. |
| `TRANSCRIPTION_MODEL` | `whisper-1` | Provider transcription model. |
| `TRANSCRIPTION_LANGUAGE` | empty | Optional ISO-639-1 hint. |
| `TRANSCRIPTION_TIMEOUT_SECONDS` | `180` | Provider request timeout. |
| `TRANSCRIPTION_MAX_AUDIO_BYTES` | `25165824` (24 MiB) | Extracted audio size cap. |
| `FFMPEG_PATH` | empty | Optional FFmpeg binary override. Otherwise a system FFmpeg or the bundled `imageio-ffmpeg` binary is used. |
| `VIDEO_FRAME_INTERVAL_SECONDS` / `VIDEO_MAX_FRAMES` | `10` / `24` | Frame sampling interval and hard cap; the interval widens for long videos. |
| `VIDEO_MAX_DURATION_SECONDS` | `900` | Longer videos are refused rather than partially analyzed. |
| `VIDEO_FRAME_MAX_WIDTH` | `960` | Stored sampled-frame width in pixels. |
| `VIDEO_PROCESSING_TIMEOUT_SECONDS` | `600` | Overall processing budget per video. |
| `VIDEO_MIN_FRAME_TEXT_CHARS` | `3` | OCR output shorter than this is treated as no readable text. |

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
| Backend tests | `cd backend && .venv\Scripts\python.exe -m pytest -q` | **111 passed**, 0 failed, 1 third-party deprecation warning, 74.10 s. Includes OCR fixtures generated at test time, session/security, review-workflow, insights, 18 video-pipeline tests, and four assistant tests covering finding-correction context, role-scoped governance insights, review-process guidance, and registered navigation routes. |
| Video pipeline tests | `cd backend && .venv\Scripts\python.exe -m pytest tests/test_video_pipeline.py -q` | **18 passed**, 0 failed, 20.47 s. Covers speech/visual independence, provider and OCR failure states, no-audio/no-content, validation, cancel/retry/recovery, workspace isolation, health, and real OCR. |
| Frontend helper tests | `cd frontend && npm run test:format` | **27 passed**, 0 failed, 625.85 ms (Node test runner). |
| TypeScript | `cd frontend && npx tsc --noEmit` | **0 errors**. |
| Production build | `cd frontend && npm run build` | **0 TypeScript errors**; 1,629 modules transformed; JS 686.85 kB (gzip 175.52 kB), CSS 77.95 kB (gzip 14.49 kB); built in 16.91 s; one chunk-size advisory. |
| Video end-to-end (local) | Local FastAPI + Vite + local OpenAI-compatible speech mock, real FFmpeg and RapidOCR | Uploaded a 4 s MP4 with no transcript: both stages completed; audit produced **2 critical findings** (`On-screen 00:00` and `Spoken 00:02`), score **40**, verification `verified`, method `video-audit-v2 (spoken: automatic; on-screen frames with text: 1)`; frame preview loaded through the authenticated endpoint; timestamp seek and refresh recovery passed; **0 console errors**. |
| Unconfigured speech-to-text (local) | Second stack with `TRANSCRIPTION_PROVIDER=none` | Panel showed `Partial results`, speech `Unavailable`, OCR `Complete`; the audit stored `partially_verified`, kept the on-screen contradiction, added one `Inspection limit` for unanalyzed speech, and invented no spoken findings or timestamps. |
| End-to-end journeys | Headless Chrome (CDP), local API + Vite | **22 of 22 journeys passed** with the data recorded in [VERIFICATION.md](docs/VERIFICATION.md): direct open, workspace switch, create/audit (score 0, 7 findings), re-run, evidence inspection, correction, version 2 (score 100), re-audit, submission, reviewer claim, comment, request changes, revision to version 3, approval, audit trail (14 events), image OCR, mixed PDF, insights, empty workspace, unauthorized actions, workspace isolation, and refresh persistence. Console errors: **0**. |
| Responsive sweep | Headless Chrome, 14 routes × 390/768/1024/1440 px | **56 checks, 0 horizontal overflow.** A clipped-text scan flagged only `sr-only` helper spans, which are intentionally visually hidden. |
| Overlay checks | Headless Chrome, 1440/1024/768/390 px | Assistant drawer, workspace/role menus, and dialogs settle fully opaque (entry animation 200–240 ms) and stay on-screen with no horizontal overflow; dialogs are opaque at 390 px. |
| Assistant responsive sweep | Headless Chrome (CDP), 1440×900 / 1024×768 / 768×1024 / 390×844 | **PASS** — floating launcher inside the viewport with three orb rings; drawer 480 px wide at 1024/1440 px and 390 px at a 390 px viewport; panel and document overflow **0**; mic, input, header, and footer visible; a real brand-rules chat rendered Markdown (6 `<strong>`, 6 `<li>`, no literal `**` or `•`) with the `Open brand rules` action; reduced motion collapsed ring/halo/core animations to `1e-05s` and one iteration. |
| Assistant behaviour, local full stack | Headless + headed Chrome 156; mocked recognizer and Chrome synthetic audio | **PASS for the checked flows** — document-context corrections (quoted, explicitly not applied), stop generation, retry recovery, request error mapped to the error orb, `/brand?tab=rules` deep links, creator insights denial vs admin insights with `/insights`, mocked voice success/denial/stop, TTS speaking/stop, and close-while-speaking cleanup; console clean after reload. The real Web Speech pipeline was also started with Chrome's fake audio device: permission was granted, input peaks reached 1.0, and `audiostart`/`soundstart`/`speechstart` fired, but the browser speech service returned no transcript within 20 s; the UI showed its no-speech error and inserted no fabricated text. A physical microphone and real transcription accuracy remain untested. |
| Live assistant smoke | Headless Chrome via browser-use + curl, <https://inkloom-ai-rho.vercel.app> + <https://inkloom-api.onrender.com> | **PASS (2026-10-30)** — production deployment `dpl_4dw5W5W7wfFs3qpkbUJUCR3SX8T6` is READY at commit `516825a`; live bundle `assets/index-MIQiRlJY.js` (686,881 bytes) + `assets/index-BExhdNgb.css` (77,954 bytes) contain the floating launcher and orb. Drawer opened with header, footer, mic, input, and 3-ring orb; panel overflow **0**; **0 console messages**. Chat “What do the brand rules say?” returned a real backend answer from 6 active rules with 6 bold terms, 6 list items, rendered Markdown (no literal `**`/`•`), the `Open brand rules` action, and an idle orb. A creator-session question about governance insights was correctly refused as admin-only and offered `Open your content` instead of `/insights`; no errors or alerts. Live health at that time returned `online` in 0.57 s with `llm_configured:false`, `ocr_configured:false`, and transcription unconfigured (missing key); the key was added later — see the live transcription smoke row. |
| Live bright-redesign smoke (superseded) | curl + live bundle inspection, <https://inkloom-ai-rho.vercel.app> | **PASS (2026-10-30)** — live CSS `index-BYfk9uw1.css` defined the bright root tokens (`--bg: #f5f8ff`); live JS `index-DVd-Fara.js` (671,563 bytes) contained `Ask with voice` but none of the floating-launcher/orb strings, confirming the then-current assistant work was local only. Superseded by the live assistant smoke row. |
| Live dark-redesign smoke (historical) | Headless Chrome (CDP) + curl, <https://inkloom-ai-rho.vercel.app> | **PASS (2026-10-30)** — deployment `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57` is READY at commit `e59bb17`; live CSS `index-CjC3LMnu.css` contains the dark tokens and opaque `.glass-strong` gradient; body background `rgb(7, 11, 24)`; 14 glass surfaces; sidebar/header render; no onboarding gate; **0 JS errors**; `scrollWidth == innerWidth` at 1440 and 390 px; workspace menu settled opaque and inside the 390 px viewport. Superseded by the live bright-redesign smoke row. |
| Live video-UI smoke (historical) | Headless Chrome + curl, <https://inkloom-ai-rho.vercel.app> | **PASS (2026-10-30)** — deployment `dpl_9x8Wa2ChSHyS4PDbwYwcrwRQyEFm` is READY at commit `1885b2e`; live bundle `assets/index-B4UXtfvY.js` (640,060 bytes) contains `Run video audit`; Overview rendered seeded records, New content showed the video option and optional-transcript copy; **0 console messages**. The API was redeployed later that day (see [Deployment state](#deployment-state)); this row records the UI state before that deploy. |
| Live backend deployment | Render CLI + curl + real uploads, <https://inkloom-api.onrender.com> | **PASS with a memory limit (2026-10-30)** — deploy `dep-dbi1uadg1s2s73doco9g` served commit `9c99044`; `/api/v1/health` reported the `video` block with system FFmpeg `5.1.9`, and the video status, retry, cancel, and frame routes returned **401** without a session (routes live). With `OCR_PROVIDER=auto`, a real PNG audit completed OCR: **2 lines**, **97.3%** mean confidence, **51.6 s** cold start. A follow-up 8 s MP4 job then exhausted the 512 MB free instance during frame OCR (restart at 04:46:59 UTC), so OCR was reverted to `none` in deploy `dep-dbi22tjbc2fs739ssca0`. No paid speech call was made. The assistant build was later deployed as `dep-dbickkflk1mc73ftu7q0` (commit `516825a`, live 16:49:59 UTC). Speech-to-text was then enabled in `dep-dbid68dg1s2s73elp56g` (commit `57936c9`) through Groq's OpenAI-compatible endpoint; see the live transcription smoke row below. |
| Live transcription smoke | Render API + real MP4 upload, <https://inkloom-api.onrender.com> | **PASS (2026-10-30)** — after adding `TRANSCRIPTION_API_BASE=https://api.groq.com/openai/v1` and `TRANSCRIPTION_MODEL=whisper-large-v3-turbo`, health reported `transcription.provider: "openai_whisper"`, `model: "whisper-large-v3-turbo"`, `configured: true`. A generated 5.74 s MP4 with the spoken sentence “Acme Cloud is the cheapest platform for every team.” returned transcript `completed` with **1 timestamped segment**; submitting it created a `partially_verified` audit with a **high-severity** `Policy violation: cheapest` finding at **Spoken 00:00**, plus one OCR inspection-limit finding. The video status was `partial` because OCR is disabled. Groq free tier; no paid call. The reported 2:54 user video was not re-uploaded after the deploy wiped it. |
| Historical Round 3 smoke | 2026-10-29, pre-redesign | **PASS for the Round 3 build** (`ccf799b`); retained as history. |

`npm run build` runs `tsc` before Vite, which is the static type check used here; there is no ESLint configuration in this repository. Browser checks used a temporary headless-Chrome CDP harness outside the repository (Playwright is not installed in this environment), so those scripts are not part of the delivered application. Verification covered Chromium only; Safari, Firefox, real mobile devices, screen readers, and automated axe checks were not run.

The 22-journey suite and the 56-check responsive sweep predate the assistant work. This round re-ran the full backend suite (**111 passed**), the frontend helper tests (27), the type check, and the production build, and added the assistant responsive sweep, assistant behaviour checks, and live bundle inspection above. The assistant behaviour checks used a mocked browser recognizer; typed chat, backend grounding, permissions, and navigation were real. Speech-to-text in the earlier video flow used a local OpenAI-compatible mock; FFmpeg, RapidOCR, storage, and the audit engine were real. The later live transcription check used Groq's free tier and a real generated audio track; no paid provider call was made.

The local browser journeys ran against the local development database. They created a `Lifecycle QA …` text document with versions 1–3 and its audits/comments/decisions, two OCR verification documents (image and mixed PDF), and a throwaway empty workspace; no production data was touched. The live deployment was smoke-tested separately: the frontend serves the `516825a` bundle and the backend runs `57936c9` with speech configured.

---

## Deployment state

The frontend is **live** on Vercel from `main`. The production bundle is `assets/index-MIQiRlJY.js` (686,881 bytes) with `assets/index-BExhdNgb.css` (77,954 bytes): the bright redesign and the full Inkloom AI assistant matching commit `516825a`, built as `dpl_4dw5W5W7wfFs3qpkbUJUCR3SX8T6`. That bundle includes the floating launcher, voice action, orb states, safe Markdown, Quality Snapshot, and permission-aware assistant answers. Later README-only commits are deployed as separate Vercel builds with the same assets. The backend is **live** on Render at commit `57936c9` as `dep-dbid68dg1s2s73elp56g`; Render again did not auto-trigger, so it was deployed manually on 2026-10-30. The live API exposes the assistant and video pipeline, and speech-to-text is configured through Groq's OpenAI-compatible `whisper-large-v3-turbo` endpoint using a server-side key. On-screen OCR remains off after a real video job restarted the 512 MB instance, so speech-only video audits complete as `partial` until OCR can run on a larger instance. See [Automatic video auditing](#automatic-video-auditing).

| Component | Serves | State |
| --- | --- | --- |
| Vercel frontend <https://inkloom-ai-rho.vercel.app> | `assets/index-MIQiRlJY.js` (686,881 bytes) + `assets/index-BExhdNgb.css` (77,954 bytes), frontend of commit `516825a`, deployment `dpl_4dw5W5W7wfFs3qpkbUJUCR3SX8T6` | **Current** — verified live on 2026-10-30: floating launcher and voice action present with 3 orb rings, drawer header/footer/mic/input visible at a 428 px viewport, panel overflow 0, brand-rules answer rendered from stored records with its navigation action, creator insights request correctly scoped to admins, idle orb, 0 console messages. |
| Render API <https://inkloom-api.onrender.com> | Commit `57936c9`, deploy `dep-dbid68dg1s2s73elp56g` | **Live** — `/api/v1/health` reported `online` at 17:27:50 UTC with `database: connected`, system FFmpeg `5.1.9`, `ocr_configured: false` / `ocr_provider: "none"`, `llm_configured: false` / `llm_provider: "mock"`, and `transcription.provider: "openai_whisper"` with `configured: true` and `model: "whisper-large-v3-turbo"` through Groq's OpenAI-compatible endpoint. The upload status, `/video/retry`, `/video/cancel`, and `/frames/...` routes exist and return **401** without a session; assistant chat returned a grounded answer through the live session. A real 5.74 s MP4 upload completed speech extraction and produced a timestamped finding; see the live transcription smoke row above. |

The video-auditing work was committed as `1885b2e` and pushed to GitHub `main` on 2026-10-30; Vercel built and promoted `dpl_9x8Wa2ChSHyS4PDbwYwcrwRQyEFm` automatically. The bright redesign and voice assistant were then committed as `0bd15fb`, and Vercel auto-deployed that frontend. The floating-launcher, Markdown, permission-aware assistant, and Quality Snapshot work was committed as `516825a` and pushed to `main`; Vercel promoted `dpl_4dw5W5W7wfFs3qpkbUJUCR3SX8T6`, and Render again did not auto-trigger despite `autoDeploy`, so the API was deployed manually as `dep-dbickkflk1mc73ftu7q0` (live 16:49:59 UTC). Round 3 was committed as `ccf799b` and deployed on 2026-10-29. Earlier on 2026-10-30, Render deploys `dep-dbi1uadg1s2s73doco9g` (04:39 UTC), `dep-dbi20d142hec73c7ip9g` (04:43 UTC, applying `OCR_PROVIDER=auto` and `TRANSCRIPTION_PROVIDER=openai_whisper`), and `dep-dbi22tjbc2fs739ssca0` (04:49 UTC, reverting OCR to `none`) configured the video pipeline. A real image OCR call worked (2 lines, 97.3% confidence, 51.6 s cold), but the following 8 s video job restarted the 512 MB instance while reading frames, so OCR was turned off to keep the demo stable. Image and scanned-PDF uploads on the live site therefore report OCR as disabled instead of inventing text. Local runs use `OCR_PROVIDER=auto` and perform real OCR. Enabling it in production needs a larger instance and a repeat of the same real-upload check. In this round the documentation was committed as `57936c9` and pushed to `main`; Render again did not auto-trigger, so the API was redeployed manually as `dep-dbid68dg1s2s73elp56g`. That deploy also activated speech-to-text: `TRANSCRIPTION_PROVIDER=openai_whisper`, `TRANSCRIPTION_API_BASE=https://api.groq.com/openai/v1`, and `TRANSCRIPTION_MODEL=whisper-large-v3-turbo` use a server-side Groq free-tier key that is not in the repository or the browser. A real upload then transcribed correctly and stored a timestamped spoken finding. Enabling LLM rephrasing still needs a server-side provider key and `LLM_PROVIDER`; rules-based answers work without one.

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
10. **Automatic video auditing.** Create a video check, upload an MP4 without a transcript, and show the analysis panel: speech and on-screen stages, provider/model, frame count, and real status messages. Click **Run video audit**; show `Spoken 00:02` and `On-screen 00:00` findings for the same claim, the authenticated frame preview, and timestamp playback. Then open `Launch Webinar (transcript only)` to show that manual/transcript-only auditing still works. The live deployment has speech configured (Groq Whisper) but on-screen OCR disabled, so a real upload finishes as `partial`: the spoken stage completes with timestamps, the on-screen stage reports `unavailable`, and the audit records that inspection gap instead of inventing on-screen findings. Show that honest state rather than claiming a full visual audit.
11. **Campaign governance.** Open `Q4 Enterprise Launch` → Conflicts. Show the two pricing conflicts, record a resolution with an agreed value and note, and point out that the affected asset text must still be updated separately.
12. **Research and evaluation.** In Research, show planned records labelled “Work not completed” and source-backed completed records. In Evaluation, run all cases: 5 deterministic cases execute and pass from the current workspace records.
13. **Assistant and voice chat.** Open the floating **Inkloom AI assistant** button, then ask “What are the highest risk findings on this document?” Show the grounded evidence list. With no provider configured, the response badge reads `Records engine`; with `LLM_PROVIDER` set, it reads `AI wording · <provider>` while the verification card still cites stored records. Show that suggested corrections are quoted but not applied and that the assistant cannot approve, publish, or delete. Use the floating microphone action (tooltip **Ask with voice**) or the drawer's **Voice input** button to grant the microphone, speak, review the live transcript, stop, and show the same answer path. Show **New conversation**, **Copy**, and **Stop generation** on a slow request. Ask for governance insights as Creator, then as Admin, to show the role-scoped answer and `/insights` navigation.
14. **Secure approvals.** As reviewer, claim the review; point out the assignment is bound to the latest submitted version. Approve a version with open high-severity findings and show that the server blocks the decision until a written override reason is entered; then show the reason and reviewer in the decision record.
15. **Governance-risk insights.** As admin, open Insights. Walk through recurring violations (findings vs documents vs audit runs), rules with an override rate and “may need review” flag, approved facts needing verification, and unclear guideline signals — then the method, sample size, and reporting window for each.
16. **Settings.** Show upload limits and integration status, including local OCR availability and the explicit statement that audits do not call an LLM or an external OCR service.

---

## Known limitations

- **Demo identity, strong session handling.** Accounts sign in with server-issued tokens and the API enforces capabilities and workspace scope on every request, but there is no external identity provider or password policy. Do not use with confidential material.
- **Local OCR, not perfect OCR.** RapidOCR reads printed Latin-script text well; handwriting, unusual fonts, small text, and complex layouts may be read incorrectly or not at all. Low-quality extractions are reported honestly, but the text still needs human confirmation before a legal decision.
- **Visual qualities are not judged.** Contrast, logo usage, layout, and image composition remain human-review items.
- **Speech-to-text is provider-dependent.** Automatic video speech requires `TRANSCRIPTION_PROVIDER=openai_whisper` plus a server-side key. The live deployment uses Groq's free-tier `whisper-large-v3-turbo`; a real upload transcribed correctly. Without a provider, neither stage can carry the audit alone: the on-screen stage still runs and the audit reports the missing spoken coverage. Provider timestamps are preserved; if the provider returns none, no timestamps are invented. Groq's free tier enforces a 25 MB audio limit, so long videos may exceed it.
- **Video analysis is sampled.** Frames are sampled at a configured interval with a hard cap, so brief on-screen flashes can be missed. OCR may misread stylized, animated, small, or low-contrast text; the frame preview is the evidence to verify. Logo, colour, layout, motion, and audio tone are not judged.
- **Automatic video auditing is deployed with speech only in production.** Speech-to-text runs through Groq and returns timestamped findings, but `OCR_PROVIDER=none` after a real video job restarted the 512 MB free instance, so the on-screen stage is unavailable and live video audits finish as `partial`. The UI reports the gap and the audit records an inspection-limit finding; manual transcripts and transcript-only auditing still work.
- **Video jobs are in-process.** One worker per API process, persisted progress, cancel/retry, and startup recovery are implemented, but a multi-instance deployment needs a shared queue. A restart marks in-flight work failed (retryable), not resumed mid-stage.
- **The assistant's provider path is optional and unset locally.** Without `LLM_PROVIDER=openai|gemini` and a server-side key, replies are deterministic (`rule_based`) and say so. When configured, the LLM only rephrases a record-grounded answer; it cannot add facts, and provider failures show the deterministic answer plus an `ai_error`. The live deployment has no assistant provider configured.
- **Voice input depends on the browser's speech service.** It requires a secure context (HTTPS or localhost) and `SpeechRecognition`/`webkitSpeechRecognition`; currently that means Chromium-based browsers and Safari, not Firefox. Chrome's implementation sends audio to its speech service and needs a network connection. Permission denial, unsupported browsers, no-speech, network errors, cancellation, and a start timeout are handled in the UI; typed chat remains available. Automated verification used a mocked recognizer for the transcript→answer path. A real Web Speech session was also started in Chrome with a synthetic audio device: permission and capture worked and `speechstart` fired, but the browser speech service returned no transcript in this environment, so a physical microphone and real transcription accuracy remain untested.
- **Deterministic matching limits.** Rules are literal/regex matches and fact checks are based on stored values and patterns. The engine does not understand nuance, sarcasm, or visual context.
- **PDF layout.** Extraction preserves page text order but not columns, tables, or visual placement. Line-based diffs reflect extracted text, not visual layout.
- **Evaluation is a fixture.** Five synthetic cases verify regressions; they are not a benchmark of real-world accuracy.
- **Insights are descriptive.** Counts, rates, and signals are computed from stored records only; small sample sizes are labelled and do not predict legal or brand risk.
- **Live OCR is disabled after a measured memory failure.** With `OCR_PROVIDER=auto`, a real image check succeeded (2 lines, 97.3%, 51.6 s cold), but the next video job restarted the 512 MB free instance at 04:46:59 UTC during frame OCR. The setting was reverted to `none`, so image and scanned-PDF checks there return an explicit “OCR is disabled” state. Local runs perform real OCR; production needs a larger instance and a repeat of the real-upload check before re-enabling it.
- **Live assistant verification is focused, not exhaustive.** The deployed assistant was exercised through a real session at a 428 px in-app-browser viewport (open drawer, grounded chat, navigation action, creator insights denial, orb state, console) and the production bundle was inspected. The four-width responsive sweep and the full orb-state matrix were run locally against the same commit, not repeated on the live site. Real-microphone transcription and real-LLM phrasing remain unverified for the reasons above.
- **Frontend verification is Chromium-only.** Widths 390/768/1024/1440 px were checked for overflow and overlays; Safari, Firefox, real devices, screen-reader testing, and automated axe audits were not run.
- **Single bundle.** The production build remains one ~687 kB JS chunk (Vite advisory); route-level code splitting was not added in this round.
- **No product PDF exists in the repository.** Only uploaded evidence PDFs are present, so no product PDF was regenerated.
- **Single-node demo storage.** SQLite and local disk uploads suit the demo. A multi-instance production deployment needs Postgres, object storage, and a real auth provider.
- **Supabase migrations are optional and not exercised by the local runtime.** RLS policies are included for a production Postgres setup; they are not active protections around the demo’s direct SQLAlchemy connection.

---

## License

MIT License. Built for the hackathon demo described above. All company names, users, sources, benchmarks, and results are fictional demo data.
