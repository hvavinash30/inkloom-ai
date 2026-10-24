# Inkloom AI — Evidence-First Brand Governance

Inkloom AI is a full-stack demo of a brand-governance workspace. Writers submit copy, deterministic checks compare it with active brand rules and source-backed approved facts, and reviewers make version-bound decisions with the evidence in view.

The demo workspace — **Acme Cloud Technologies** — is explicitly fictional. Every seeded rule, fact, document, campaign, research note, and evaluation case is labelled as demo data.

**Live demo**
- App: <https://inkloom-ai-rho.vercel.app>
- API: <https://inkloom-api.onrender.com> (`/api/v1/health`)

The Render free instance sleeps after inactivity, so the first request can take about a minute. Its filesystem is ephemeral: uploads and stored changes reset on restart or redeploy, and the fictional seed is recreated. See [Deploy](#deploy-vercel--render) for durable options.

**What this build is**
- A working React + FastAPI application with three server-enforced demo roles: Creator, Reviewer, and Organization Admin.
- Deterministic content checks: literal/regex rule matching plus approved-fact contradiction and unsupported-claim detection.
- Real PDF text extraction, preserved page numbers, page-linked findings, and an authenticated PDF viewer.
- Real video playback when a file exists, plus transcript-timestamp audits when one is supplied.
- Versioned content, human review decisions, campaign cross-asset conflicts, brand memory, research records, measured evaluation runs, and stored-data insights.

**What this build is not**
- It does not call an LLM in the audit path, the assistant, OCR, or transcription. There is no simulated AI output anywhere.
- It does not transcribe video or OCR images/scans. Those boundaries are shown in the interface instead of being hidden.
- It is not a production identity system. The role switcher is a demo access mechanism, not authentication.

---

## Demo workspace and roles

The seed creates one fictional workspace and three users:

| Role | Demo user | Server capabilities |
| --- | --- | --- |
| Creator | Jordan Patel | Create, check, revise, and submit their own content; read brand rules/facts; use the assistant |
| Reviewer | Alex Rivera | Read all content, review queue, comment, approve/reject/request changes, resolve campaign conflicts |
| Organization Admin | Sarah Chen | Everything above plus brand library, assets, policies, team, research, evaluation, insights, and settings |

Authorization is re-checked by the API on every protected request. The browser sends `X-Inkloom-Role` (and an optional user header) in demo mode only. A production build must replace this with Supabase Auth or another provider; the role switcher alone is not a security boundary.

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
- New content in text, PDF, image, video, or transcript form.
- Drafts, campaigns, and campaign attachment.
- Evidence-backed findings with severity, location, source reference, verification status, and risk explanation.
- Apply a suggested correction in the editor, revise, save an immutable version, re-check, and submit for review.
- Track review status, comments, requested changes, approvals, stale approvals, and version history.

### Reviewer
- Priority queue computed from stored findings, with search and high-risk filters.
- Findings, evidence, source references, and version context in one place.
- Comments and decisions tied to an exact version: approve, reject, or request changes with required feedback.
- Version comparison and decision history.
- Campaign conflict resolution with an agreed value and a recorded note.

### Organization Admin
- Overview with live counts, recent activity, and integration boundaries.
- Team and role capability matrix.
- Brand library: approved facts, deterministic rules, visual assets, contrast checks, impact analysis, and archive flows.
- Policies & brand memory: rule conflicts, uncovered recurring issues, a rule simulator over stored text, and draft-rule creation.
- Campaigns, cross-asset consistency, readiness, and conflict records.
- Audit history, governance insights derived only from stored records.
- Research & validation records with named sources.
- Evaluation cases executed against the deterministic engine.
- Workspace settings, upload limits, and honest integration status.

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

## PDF and video truth

**PDF**
- Uploads are validated, stored server-side, and parsed with `pypdf`.
- Text pages are preserved individually, so findings point to the page that contains the quote.
- Encrypted, empty, over-limit, or unreadable PDFs return an explicit processing message.
- If a PDF has no extractable text (for example, a scan), the UI says so and offers a manual page-text fallback. No OCR is invented.
- The seeded PDF is streamed through an authenticated endpoint and displayed in a real viewer via a Blob URL.

**Video**
- MP4/WebM/MOV files are stored and played with a real `<video>` element.
- Checks use a timestamped transcript supplied by the user (for example `[00:42] We deliver 100% uptime.`).
- When no file is attached, the UI says “No source file attached” and never renders a fake player.
- Without a transcript, the check reports that transcription is unavailable and asks for a transcript. No timestamps are invented.

---

## Assistant, research, and evaluation

- **Assistant**: deterministic, workspace-grounded replies with a declared mode (`rule_based`), verification status, grounding items, suggested actions, and limitations. It retrieves stored findings, rules, facts, campaign conflicts, and records; it does not call an external model.
- **Research & validation**: records what was actually done, with sources typed exactly as entered. A record cannot be marked completed/validated without at least one titled source. Planned work remains visibly marked as not conducted.
- **Evaluation**: runs fixed cases through the real deterministic engine and stores the measured outcome. The five seeded cases cover an uptime contradiction, clean copy, legacy spelling, PDF page preservation, and transcript timestamp preservation. This is a regression fixture, not an external benchmark.

---

## Architecture

```text
inkloom/
├── backend/                        # FastAPI + SQLAlchemy + SQLite (Supabase-compatible schema)
│   ├── app/
│   │   ├── api/v1/endpoints/       # audits, reviews, history, campaigns, brand memory,
│   │   │                           # research, evaluation, organization, uploads, assistant
│   │   ├── core/                   # settings, demo identity, capability checks
│   │   ├── db/                     # engine and sessions
│   │   ├── models/                 # workspaces, users, rules, facts, assets, documents,
│   │   │                           # versions, findings, decisions, comments, campaigns
│   │   ├── schemas/                # Pydantic contracts
│   │   └── services/               # ingestion, PDF, deterministic audit, conflicts,
│   │                               # brand memory, insights, evaluation, assistant, seed
│   ├── data/uploads/               # server-owned upload storage
│   ├── tests/                      # 17 pytest unit/integration tests
│   ├── requirements.txt
│   ├── Dockerfile
│   └── Procfile
├── frontend/                       # React 18 + TypeScript + Vite + Tailwind
│   ├── src/pages/                  # dashboard, content, reviews, campaigns, brand library,
│   │                               # policies, history, insights, research, evaluation,
│   │                               # team, settings
│   ├── src/components/             # shell, assistant drawer, dialogs, tables, UI primitives
│   ├── src/services/api.ts         # typed API client
│   └── vercel.json                 # SPA rewrite for static hosting
├── supabase/migrations/            # starter PostgreSQL DDL, RLS policies, demo seed
│                                   # (core tables only; not full runtime parity)
├── docs/ARCHITECTURE.md
├── docs/HACKATHON_ROUND2_REPORT.md
└── README.md
```

Data flow for a check:

```text
Browser → POST /api/v1/audits/submit-and-audit
        → validated upload or text
        → deterministic rule scan
        → approved-fact contradiction / unsupported-claim detection
        → severity deductions and score factors
        → persisted audit run + findings + immutable version
        → UI evidence inspector, review queue, campaign checks, history
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
| `DEMO_MODE` | `true` | Enables the demo role switcher and demo labels. |
| `DEFAULT_WORKSPACE_ID` / `DEFAULT_WORKSPACE_NAME` | seeded Acme Cloud IDs | Workspace created by the seed. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | empty | Optional server-side credentials for a Postgres deployment. Never expose these to the browser. |
| `LLM_PROVIDER` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | `mock` / empty | Reported as an integration flag only. This build does not call an LLM. |
| `OCR_PROVIDER` | `none` | No OCR is bundled. |
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

Last verified on 2026-10-24.

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `cd backend && .venv\Scripts\python.exe -m pytest -q` | **17 passed**, 1 third-party deprecation warning, 6.48 s |
| Frontend type-check + production build | `cd frontend && npm run build` | **0 TypeScript errors**; 1,619 modules transformed; JS 519.92 kB (gzip 135.00 kB), CSS 45.60 kB (gzip 8.15 kB); one chunk-size advisory |
| Responsive sweep | Playwright, 63 page loads at 1440 / 834 / 325 px | 0 console errors, 0 horizontal overflow, 0 HTTP ≥ 400, 0 `[object Object]` |
| Creator + reviewer workflow | Playwright against an isolated copy of the demo database | 9/9 checks passed: validation, apply fix, versioning, assistant grounding, high-risk queue filter, comment, request changes, resubmit, exact-version approval, stale approval, version compare, PDF upload/rejection, page-linked findings, transcript-only video |
| Admin workflow | Playwright against the same isolated copy | 10/10 checks passed: fact + rule creation, search, contrast 17.85:1, rule simulation (11 matched documents in the isolated QA database at run time), draft rule, campaign conflict resolution, research add/edit with sources, 5/5 evaluation cases, settings save, team matrix, mobile drawer navigation at 325 px |

There is no ESLint configuration in this repository; `npm run build` runs `tsc` before Vite, which is the static type check used here. Browser checks used a local Chrome through `playwright-core`; those scripts live outside the repo and are not part of the delivered application.

The Playwright workflow ran against a copy of the demo database and upload directory, so the delivered demo workspace remains as seeded.

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
8. **Video truth.** Open `Launch Webinar (transcript only)`. Show a timestamped finding at `00:42` and the explicit “No source file attached” state. Explain that no transcription or timestamps are invented. If a real MP4 is available, upload it and show the real player.
9. **Campaign governance.** Open `Q4 Enterprise Launch` → Conflicts. Show the two pricing conflicts, record a resolution with an agreed value and note, and point out that the affected asset text must still be updated separately.
10. **Research and evaluation.** In Research, show planned records labelled “Work not completed” and source-backed completed records. In Evaluation, run all cases: 5 deterministic cases execute and pass from the current workspace records.
11. **Assistant.** Ask “What are the highest risk findings on this document?” Show the grounded evidence list and declared `rule_based` mode — no external model, no fabricated citations.
12. **Settings.** Show upload limits, integration status, and the explicit statement that audits do not call an LLM or OCR service.

---

## Known limitations

- **Demo authentication only.** Roles are selected in the browser; the server enforces capabilities but does not verify a real identity. Do not use with confidential material.
- **No OCR.** Image uploads and scanned/image-only PDFs are stored for human review. Manual page text is a transparent fallback, not OCR.
- **No speech-to-text.** Video checks require a user-supplied timestamped transcript. No audio or frames are analyzed.
- **No external LLM.** The assistant is deterministic and grounded in stored records. It will not answer general world-knowledge questions as an LLM would.
- **Deterministic matching limits.** Rules are literal/regex matches and fact checks are based on stored values and patterns. The engine does not understand nuance, sarcasm, or visual context.
- **PDF layout.** Extraction preserves page text order but not columns, tables, or visual placement. Line-based diffs reflect extracted text, not visual layout.
- **Evaluation is a fixture.** Five synthetic cases verify regressions; they are not a benchmark of real-world accuracy.
- **Insights are descriptive.** Charts and recurring-issue counts are computed from stored audits only. They do not predict legal or brand risk.
- **Single-node demo storage.** SQLite and local disk uploads suit the demo. A multi-instance production deployment needs Postgres, object storage, and a real auth provider.
- **Supabase migrations are optional and not exercised by the local runtime.** RLS policies are included for a production Postgres setup; they are not active protections around the demo’s direct SQLAlchemy connection.

---

## License

MIT License. Built for the hackathon demo described above. All company names, users, sources, benchmarks, and results are fictional demo data.
