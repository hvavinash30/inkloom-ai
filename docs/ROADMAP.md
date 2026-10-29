# Inkloom AI — Roadmap

Date: 2026-10-28
This file lists work that is **not implemented**. Items already shipped are described in the [README](../README.md) and [Round 3 report](ROUND3_IMPROVEMENTS.md).

---

## 1. Deployment (the next concrete step)

Round 3 is verified locally and intentionally not deployed. To ship it:

1. Review the working tree (`git status`, `git diff`) and confirm no secrets or local databases/uploads are included.
2. Commit and push to GitHub `main`. Vercel builds automatically; Render must be redeployed manually.
3. After Render restarts, confirm:
   - `GET /api/v1/health` reports `ocr_configured: true` and an `ocr_provider` (or an honest `false` if the wheel is unavailable on the host);
   - `POST /api/v1/auth/demo/session` returns `201`;
   - the Vercel bundle contains the Round 3 UI strings (`Governance risk signals`).
4. Render’s free instance has an ephemeral filesystem. Uploaded files and stored changes reset on restart; the fictional seed is recreated. For durable demo evidence, attach a disk or move uploads to object storage.
5. Run the demo journeys against the live site: OCR image, mixed PDF, claim/override, insights, dashboard.

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

---

## 5. Quality and verification

- Add a committed Playwright (or equivalent) end-to-end suite; the Round 3 browser harness lived outside the repository.
- Add CI (GitHub Actions) running backend pytest, frontend helper tests, `tsc`, and the production build on every pull request.
- Add accessibility automation (axe) and keyboard-only journeys.
- Add visual regression snapshots for Insights, Document evidence, and review dialogs.
- Build a small, consented corpus of real scanned documents to measure OCR accuracy honestly; do not publish invented accuracy numbers.
- Add performance budgets for the 617 kB JS bundle (route-level code splitting is the obvious next step).

---

## 6. Deliberate non-goals (unchanged)

- No LLM in the audit path, assistant, or evidence generation.
- No simulated OCR, transcription, evidence, or metrics.
- No automatic approval of content; human decisions remain human.
- No replacement of the demo workspace or removal of existing routes/features.
- No claim that insights predict legal or brand risk.
