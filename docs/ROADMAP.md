# Inkloom AI — Roadmap

Date: 2026-10-30
This file lists work that is **not implemented**. Items already shipped are described in the [README](../README.md) and [Round 3 report](ROUND3_IMPROVEMENTS.md).

---

## 1. Deployment follow-ups

The [Vercel](https://inkloom-ai-rho.vercel.app) frontend serves commit `1885b2e` (deployment `dpl_9x8Wa2ChSHyS4PDbwYwcrwRQyEFm`) with the redesign and video UI. The [Render](https://inkloom-api.onrender.com) API was deployed manually on 2026-10-30 at `9c99044` (backend code `1885b2e`) as `dep-dbi22tjbc2fs739ssca0`; it serves the video pipeline with system FFmpeg `5.1.9`, but `OCR_PROVIDER=none` and no speech key. Enabling OCR on the 512 MB free instance was tested: a real image OCR succeeded (2 lines, 97.3%, 51.6 s), then the next video frame job restarted the instance at 04:46:59 UTC, so OCR was reverted. Remaining deployment work:

1. Add a backend-only `TRANSCRIPTION_API_KEY` (or `OPENAI_API_KEY`) in Render and make one real provider call; record latency, quota, and response-shape results.
2. Move the API to an instance with more than 512 MB of RAM (or run OCR in a separate worker), set `OCR_PROVIDER=auto`, and repeat the real image **and video** upload check. Revert if the instance restarts.
3. Re-run the full local journey suite against the live deployment, not just the smoke check: create, audit, correct, re-audit, submission, claim, comment, request changes, approval, audit trail, OCR, insights, workspace isolation, and the automatic video flow.
4. Investigate why Render did not auto-deploy the `main` push despite `autoDeploy` being enabled; the same commit was deployed manually.
5. Render’s free instance has an ephemeral filesystem. Uploaded files and stored changes reset on restart; the fictional seed is recreated. The OCR crash reset the database and cleared the smoke records. For durable demo evidence, attach a disk or move uploads to object storage.
6. Re-run the live demo journeys after any provider or plan change: image OCR, mixed PDF, claim/override, insights, dashboard, and video.

---

## 2. Production identity and security

- Replace demo sign-in with Supabase Auth (or another OIDC provider); map verified identities to workspace roles.
- Add password/MFA policy, session revocation across devices, and sign-in rate limiting.
- Add CSRF protection if sessions move to cookies; keep tokens out of `localStorage`.
- Add structured audit-log export (SIEM/webhook) for decisions and overrides.
- Add malware scanning and content-type sniffing for uploads.
- Define data retention and deletion policies, including uploaded evidence.

---

## 3. Data and deployment hardening

- Introduce Alembic migrations; today the runtime uses `Base.metadata.create_all`, and Round 3 tables exist only as model definitions.
- Bring the Supabase starter migrations to parity with the runtime schema (auth sessions, assignments, overrides, OCR lines, uploads, campaigns, research, evaluation).
- Move from SQLite to Postgres for multi-instance deployments; move uploads to object storage with signed URLs.
- Add background jobs for OCR/transcription queues, fact re-review reminders, and assignment notifications.
- Add health/readiness probes, metrics, and error tracking.

---

## 4. Product improvements

- **OCR evidence overlay**: draw real OCR bounding boxes over the stored image/PDF page (boxes are stored but only the line list and text highlights are shown today).
- **Async OCR** for large scans with progress and retry, instead of synchronous processing.
- **Additional languages and handwriting models**; expose confidence thresholds in the UI.
- **Reviewer notifications/SLA**: email or in-app notification when assigned, due dates, reminders.
- **Assignment history UI**: show past assignments and reassignment reasons in the document timeline (records exist; the UI shows the current assignment).
- **Insights drill-down depth**: per-rule trend charts, export to CSV/PDF, and configurable reporting windows.
- **Policy workflow**: turn “may need review” flags into a tracked policy-review task with an owner and due date.
- **Fact review automation**: scheduled reminders using `next_review_date`; bulk re-verification flows.
- **Search and reporting** across decisions and override reasons.
- **Design-system guidance**: document when to use each glass surface and overlay rule, and replace remaining inline color values with shared tokens where practical.
- **Contrast audit**: measure text and control contrast against the new dark surfaces and publish the results; adjust tokens rather than eyeballing.

---

## 5. Quality and verification

- Add a committed Playwright (or equivalent) end-to-end suite; the browser harness lives outside the repository.
- Add CI (GitHub Actions) running backend pytest, frontend helper tests, `tsc`, and the production build on every pull request.
- Add accessibility automation (axe) and keyboard-only journeys, including the new dark UI’s menus, dialogs, tabs, and focus order.
- Add a reduced-motion verification pass with the OS setting enabled; only stylesheet behavior was inspected.
- Add visual regression snapshots for the redesign at 390/768/1024/1440 px (shell, Overview, Document/evidence, Insights, review dialogs, assistant drawer, workspace menu).
- Add a cross-browser pass (Safari/Firefox) for `backdrop-filter`, `color-scheme`, and overlay opacity.
- Build a small, consented corpus of real scanned documents to measure OCR accuracy honestly; do not publish invented accuracy numbers.
- Add performance budgets for the 624.78 kB JS bundle (route-level code splitting is the obvious next step).

---

## 6. Deliberate non-goals (unchanged)

- No LLM in the audit path, assistant, or evidence generation.
- No simulated OCR, transcription, evidence, or metrics.
- No automatic approval of content; human decisions remain human.
- No replacement of the demo workspace or removal of existing routes/features.
- No claim that insights predict legal or brand risk.
