# Round 3 — Verification Report

Date: 2026-10-28
Repository: `C:/Users/User/Documents/Qoder/2026-10-24/5f93a79c/inkloom`
Environment: Windows 10, local development (backend `127.0.0.1:8000`, frontend `localhost:3000`), SQLite.

This report contains only measured results. Where something was not tested, it says so.

---

## 1. Automated tests

Commands were run from the repository root.

| Suite | Command | Result |
| --- | --- | --- |
| Backend (all) | `cd backend && .venv\Scripts\python.exe -m pytest -q` | **84 passed, 1 warning in 43.23 s** (warning: third-party `anyio` deprecation from Starlette’s TestClient) |
| Backend — OCR | `pytest tests/test_ocr.py` | **9 tests collected/passed** (included in the 84) |
| Backend — security | `pytest tests/test_security.py` | **9 tests collected/passed** |
| Backend — review workflow | `pytest tests/test_review_workflow.py` | **5 tests collected/passed** |
| Backend — insights | `pytest tests/test_insights.py` | **5 tests collected/passed** |
| Frontend helper tests | `cd frontend && npm run test:format` | **27 passed, 0 failed** (Node test runner, 729.76 ms) |
| TypeScript | `cd frontend && npx tsc --noEmit` | **0 errors** |

Backend tests use a temporary SQLite database (`backend/tests/conftest.py`). OCR fixtures (PNG, scanned PDF, mixed native/scanned PDF, blank scan) are generated with PyMuPDF at test time; no binary fixtures are committed.

### What the new tests prove

- **OCR ingestion**: image OCR produces lines with confidence and normalized bounding boxes; findings reference the exact extracted span; scanned PDFs keep page numbers; mixed PDFs keep native and OCR pages apart; OCR failure/unavailable/no-text states are reported without fabricated text; malformed/unsupported/oversized images and non-PDF bytes are rejected.
- **Security**: protected routes require a server-issued session; client role/workspace headers are ignored; role capabilities are enforced; records **and files** from another workspace are inaccessible; logout revokes only the presented session; expired sessions are rejected; the demo account directory exposes no secrets; unknown workspace login is rejected.
- **Review workflow**: assignments are version-bound and audited; an assigned reviewer blocks others; approval with open high-severity findings requires a written override; unsubmitted/superseded versions cannot be decided; dismissals keep a reasoned override record.
- **Insights**: recurring violations count findings, unique documents, and audit runs separately; overridden rules report reasons, rate, and review flag; facts needing verification use recorded criteria; unclear guideline signals come from rule text; an empty workspace reports zeros with sample sizes.

---

## 2. Production build

Command: `cd frontend && npm run build`

```
✓ 1624 modules transformed.
dist/index.html                   1.30 kB │ gzip:   0.69 kB
dist/assets/index-Chi17fbW.css   53.20 kB │ gzip:   9.48 kB
dist/assets/index-DoADEShH.js   617.26 kB │ gzip: 157.62 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 9.74s
```

The chunk-size message is a Vite advisory; the build succeeded with zero TypeScript errors. There is no ESLint configuration in the repository.

---

## 3. Browser journeys

Tooling: a temporary headless-Chrome harness driven over the Chrome DevTools Protocol (Python `websockets`, `Emulation.setDeviceMetricsOverride`, `Page.captureScreenshot`, `DOM.setFileInputFiles`). The harness lives outside the repository (`%TEMP%\inkloom-cdp\`) and is not part of the application. Playwright is not installed in this environment.

Servers: local backend (Uvicorn, `--reload`) and local Vite dev server, both running the final Round 3 source.

| Journey | Steps | Result |
| --- | --- | --- |
| A. Image OCR upload | Role Creator → New content → Image → upload generated PNG (`AcmeCloud is the cheapest platform.` / `Contact our sales team today.`) → run check → open document | **PASS** — extraction status `processed`, “OCR read 2 line(s) from page 1 … mean confidence 99%”; document shows findings “Product naming” and “cheapest” with `Image text`; Content & evidence shows “Extracted text with evidence” with highlighted `AcmeCloud` and `cheapest`; OCR line count/confidence and per-line list present. |
| B. Mixed native/scanned PDF | Upload 2-page PDF (page 1 native text, page 2 rendered image) → run check → open document | **PASS** — extraction note “Extracted text from 2 of 2 page(s) (native: 1, OCR: 1)”; findings on `Page 1` **and** `Page 2`; Page 2 OCR line listed with confidence; page-1 evidence highlighted exactly; no fabricated text. |
| C. Reviewer assignment | Reviewer → document in review → Review tab → “Claim review” | **PASS** — “Assigned to you”, “assigned by”, claim button disappears; assignment is bound to version 1. |
| D. Reasoned override approval | Reviewer → Approve version → submit without reason → enter reason → submit | **PASS** — server blocks with “Provide an override reason of at least 10 characters”; with reason, “Current version is approved”, status Approved, decision record shows reviewer, version, and the override reason. |
| E. Governance-risk insights | Admin → Insights at 1440/768/390 px | **PASS** — four sections render (`Governance risk signals`, `Frequently overridden rules`, `Approved facts needing verification`, `Unclear guideline signals`, `How these signals are computed`); empty states honest; document chip navigates to `#/content/<id>`; signal cards scroll to sections; `scrollWidth == innerWidth` at all three widths. |
| F. Overrides with real records | Separate throwaway workspace, dismissed findings | **PASS** — “May need review” badge, 100% override rate, reason text and reviewer visible at 1440 and 390 px; demo workspace does not show that reason (workspace isolation). |
| G. Regression | Admin → dashboard → content list → Create Your Own Brand → mobile drawer | **PASS** — dashboard (demo workspace label, “Start an audit”, deployment panel, recent content); content list “Showing 16 items”; onboarding form fields; 390 px drawer opens and navigates to Insights (`#/insights`, risk sections render); `scrollWidth == innerWidth` at 390 px. |

Screenshots were captured to `%TEMP%\inkloom-cdp\shots\` (outside the repository): `ocr-image-1440.png`, `ocr-image-390.png`, `ocr-pdf-1440.png`, `insights-1440/768/390.png`, `risk-1440/768/390.png`, `override-1440/390.png`, `approval-1440/390.png`, `regression-dashboard-1440.png`, `regression-content-1440.png`, `regression-onboarding-1440.png`, `regression-mobile-nav-390.png`.

### Not covered by browser checks

- No Safari, Firefox, or real mobile-device testing. Widths tested: 390, 768, 1440 px.
- No automated axe/WCAG audit; existing keyboard/focus work was verified manually in earlier rounds.
- No console-error capture in the CDP harness for every page (structural and text assertions were used).
- OCR quality was tested with clean, generated fixtures, not real-world photos, handwriting, or low-resolution scans.

---

## 4. Verified feature list

Status values: **COMPLETE (local)** means implemented and verified in this environment; **NOT DEPLOYED** means intentionally absent from the live sites.

| Feature | Status |
| --- | --- |
| PNG/JPEG/WebP upload validation and local OCR | COMPLETE (local) |
| Scanned PDF pages OCR with true page numbers | COMPLETE (local) |
| Mixed native/scanned PDFs (per-page extraction) | COMPLETE (local) |
| Findings linked to extracted text with exact evidence spans | COMPLETE (local) |
| OCR confidence, line list, extraction details in UI | COMPLETE (local) |
| Honest OCR failure/no-text/disabled states | COMPLETE (local) |
| Server-issued sessions with hashed tokens and expiry | COMPLETE (local) |
| Role/workspace resolved server-side (client headers ignored) | COMPLETE (local) |
| Workspace isolation for records and file downloads | COMPLETE (local) |
| Reviewer claim/assignment bound to the latest version | COMPLETE (local) |
| Version-bound decisions; stale/duplicate decisions rejected | COMPLETE (local) |
| Written override reason required for high-risk approval | COMPLETE (local) |
| Immutable decision/assignment/override audit trail | COMPLETE (local) |
| Recurring violations (findings vs documents vs runs) | COMPLETE (local) |
| Frequently overridden rules with reasons/rate/review flag | COMPLETE (local) |
| Approved facts needing verification | COMPLETE (local) |
| Unclear guideline signals | COMPLETE (local) |
| Methods, sample sizes, reporting window, empty states | COMPLETE (local) |
| Existing dashboard, content, reviews, campaigns, brand memory, research, evaluation, assistant, settings | COMPLETE (regression-checked) |
| Round 3 deployed to Vercel/Render | NOT DEPLOYED |

---

## 5. Local vs deployed

| Environment | Frontend | Backend | Round 3? |
| --- | --- | --- | --- |
| Local (verified) | Vite dev server, working tree | Uvicorn, working tree | **Yes** |
| Live (<https://inkloom-ai-rho.vercel.app>, <https://inkloom-api.onrender.com>) | `assets/index-KdOOcaBQ.js`, 593,314 bytes; contains none of `Governance risk signals`, `Recurring violations`, `auth/demo/session`, `Extracted text with evidence` | `/api/v1/auth/demo/session` → **404**; `/api/v1/health` lacks `ocr_provider`/`ocr_reason`; `ocr_configured: false` | **No** |

Local probes in the same session:

- `POST http://127.0.0.1:8000/api/v1/auth/demo/session {"role":"admin"}` → **201**
- Local `/api/v1/health` → `ocr_configured: true`, `ocr_provider: "rapidocr-onnxruntime"`, plus `ocr_reason`
- Live `/api/v1/health` → `ocr_configured: false`, no `ocr_provider`/`ocr_reason`

Nothing was committed, pushed, deployed, or published. The live sites continue to serve the previous build.

---

## 6. Local data touched during verification

All changes are confined to the local development SQLite database and upload directory; no production or deployed data was touched.

- OCR browser journeys created six image/PDF verification documents in the demo workspace (titles `OCR image verification …`, `OCR mixed PDF verification …`). They demonstrate the feature and remain in the local demo database.
- A throwaway local workspace, `Round 3 override verification`, contains the documents used for the assignment/override browser test.
- Backend tests use temporary databases and do not modify `backend/inkloom.db`.

If a clean local demo is required, back up and reset `backend/inkloom.db` and `backend/data/uploads/` so the startup seed recreates the fictional workspace.

---

## 7. Reproducing the checks

```bash
# Backend
cd backend
.venv\Scripts\python.exe -m pytest -q

# Frontend
cd frontend
npm run test:format
npx tsc --noEmit
npm run build
```

Browser journeys require a local backend and frontend running, plus a Chrome installation; the CDP harness used here is intentionally outside the repository.

---

## 8. Honest limitations of this verification

- All functional proof is local. The deployed sites still run the previous build; Round 3 deployment was explicitly out of scope for this change set.
- The OCR tests use generated, clean fixtures. Real scans, photos, handwriting, non-Latin scripts, and low-resolution images were not measured.
- Security tests exercise the application’s session and workspace boundaries, not a production identity provider, TLS termination, rate limiting, or malware scanning.
- Browser checks covered Chromium only, at 390/768/1440 px, with text/structural assertions and screenshots.
- The production build reports a chunk-size advisory (617 kB JS); it does not fail the build and was not code-split in this round.
