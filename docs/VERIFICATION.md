# Inkloom AI — Verification Report

Date: 2026-10-30
Repository: `C:/Users/User/Documents/Qoder/2026-10-24/5f93a79c/inkloom`
Scope: the dark 3D-glass frontend redesign across every existing route, dialog, drawer, menu, and state. The backend, audit engine, demo data, and workflows were not rebuilt; the redesign preserves them.
Environment: Windows 10, local development (FastAPI `127.0.0.1:8000`, Vite `localhost:3000`), SQLite.

This report contains only results measured against the final working tree on 2026-10-30. Older Round 3 results are kept only where explicitly labelled **historical**, and they do not describe the redesign. The redesign was committed as `e59bb17`, pushed to GitHub `main`, and deployed to Vercel on 2026-10-30; §4 records the live verification.

---

## 1. Automated tests

Commands were run from the repository root against the final code.

| Suite | Command | Result |
| --- | --- | --- |
| Backend (all) | `cd backend && .venv\Scripts\python.exe -m pytest -q` | **84 passed, 0 failed, 1 warning in 45.20 s** (warning: third-party `anyio` deprecation from Starlette’s TestClient) |
| Frontend helper tests | `cd frontend && npm run test:format` | **27 passed, 0 failed, 0 skipped** (Node test runner, 711.62 ms) |
| TypeScript | `cd frontend && npx tsc --noEmit` | **0 errors** (exit code 0) |
| Production build | `cd frontend && npm run build` | **0 TypeScript errors**; build succeeded (see §2) |

The full backend suite includes OCR ingestion, session/security, review-workflow, insights, campaign, brand-memory, research, evaluation, assistant, and deterministic-engine tests. OCR fixtures (PNG, scanned PDF, mixed native/scanned PDF, blank scan) are generated with PyMuPDF at test time; no binary fixtures are committed. The suite uses a temporary SQLite database (`backend/tests/conftest.py`) and does not modify `backend/inkloom.db`.

No tests were removed, skipped, or weakened for this redesign.

---

## 2. Production build

Command: `cd frontend && npm run build` (runs `tsc` first).

```
vite v6.4.5 building for production...
✓ 1624 modules transformed.
dist/index.html                   1.32 kB │ gzip:   0.69 kB
dist/assets/index-CjC3LMnu.css   58.06 kB │ gzip:  10.90 kB
dist/assets/index-1FkI2ji3.js   624.78 kB │ gzip: 158.98 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 16.36s
```

The chunk-size message is a Vite advisory; the build succeeded with zero TypeScript errors. There is no ESLint configuration in the repository, so `tsc` is the static check.

---

## 3. Browser verification

Tooling: a temporary headless-Chrome harness driven over the Chrome DevTools Protocol (Python `websockets`, `Emulation.setDeviceMetricsOverride`, `Page.captureScreenshot`, `Runtime.evaluate`, `Page.addScriptToEvaluateOnNewDocument`). The harness lives outside the repository (`%TEMP%\inkloom-cdp\`) and is not part of the application. Playwright is not installed in this environment.

Servers: local Uvicorn backend and Vite dev server, both running the final working tree. API calls used real server-issued demo bearer sessions for the Creator, Reviewer, and Admin accounts.

### 3.1 End-to-end journeys (22 of 22 passed)

| # | Journey | Actual result |
| --- | --- | --- |
| 1 | Direct open | Overview renders for `Acme Cloud Technologies`; no onboarding gate or workspace-selection screen; no access-denied or session error. |
| 2 | Workspace switch | Switched Acme ↔ Northwind; header workspace and dashboard records changed; switching back restored Acme. |
| 3 | Create and check | Created `Lifecycle QA 080941` (document `0da612ff-5856-407b-9c44-769789e10b3d`) and ran a check: score **0**, **7 findings**, owner Jordan Patel. |
| 4 | Re-run check | Re-running created a new audit run; **7 findings** again. |
| 5 | Evidence inspection | A finding showed its affected text, rule or approved-fact source, severity, verification status, and location. |
| 6 | Apply correction | Applied the suggested `AcmeCloud` → `Acme Cloud` correction; the editor text updated and a staged toast was shown. |
| 7 | Save revision | Saved version 2; re-check returned score **100** with **0 findings**. |
| 8 | Re-audit version 2 | A new audit run for version 2 returned score **100**. |
| 9 | Submit for review | Status became `in_review` with the submitted version recorded. |
| 10 | Reviewer claim | Reviewer Alex Rivera claimed the review; UI showed “Assigned to you” for the latest submitted version. |
| 11 | Comment | Posted a review comment; comment count **1** and the comment text were visible. |
| 12 | Request changes | Decision returned the document to `changes_requested`; feedback was recorded and visible. |
| 13 | Revise and resubmit | Creator saved version 3 and resubmitted; status returned to `in_review`; the superseded assignment was cleared. |
| 14 | Approve | Reviewer approved version 3 without an override (no open high-severity findings); status `approved`; `approved_version_id = a69024b9-a21a-44f5-bbe5-fb3693e56220`. |
| 15 | Audit trail | **14 events**: `content_created`, `version_created`, `audit_executed` ×5, `submitted_for_review` ×2, `reviewer_assigned`, `comment_added`, `decision_changes_requested`, `decision_approved`. |
| 16 | Image OCR | Uploaded a PNG (`AcmeCloud is the cheapest platform.` / `Contact our sales team today.`): OCR read **2 lines** at **99% mean confidence**; findings carry the `Image text` location; extracted text highlighted; no horizontal overflow at 390 px (document `e7679dc1…`). |
| 17 | Mixed native/scanned PDF | 2-page PDF with one native and one scanned page: extraction note **native: 1, OCR: 1**; findings on `Page 1` and `Page 2`; Page 2 OCR line listed with confidence; highlights match extracted text (document `70a3805f…`). |
| 18 | Governance insights | Admin saw **18 audits**, average score **69.2**, all four risk sections, methods/sample sizes, and no access-denied state. |
| 19 | Empty workspace | Created `Journey Empty 081503` through the UI: dashboard showed “No content yet”, “No checks yet”, “No campaigns yet”, “No recorded activity yet.”; content, reviews, and insights showed empty states; API returned **0** documents, rules, facts, reviews, and audits; Acme was restored afterwards. |
| 20 | Unauthorized actions | Creator decision → **403**; creator brand-rule creation → **403**; creator review assignment → **403**; creator finding dismissal → **403**; each returned an explicit message. |
| 21 | Workspace isolation | Acme session → Northwind document **404**; Northwind session → Acme document **404**; Acme session → Northwind history events **404**. |
| 22 | Refresh persistence | After reload: `approved` status, version 3, the comment, and all **14** history events persisted. Console errors across the run: **0**. |

### 3.2 Responsive and overlay checks

| Check | Method | Result |
| --- | --- | --- |
| Route overflow sweep | 14 routes (`/`, `/content`, `/content/new`, `/reviews`, `/campaigns`, `/brand`, `/policies`, `/history`, `/insights`, `/research`, `/evaluation`, `/team`, `/settings`, `/onboarding`) × 390/768/1024/1440 px | **56 checks, 0 horizontal overflow** (`document.documentElement.scrollWidth == window.innerWidth`). |
| Clipped-text scan | Same sweep, computed styles and client rects | No real clipping. The only flagged elements were `sr-only` helper spans, which are intentionally visually hidden. |
| Assistant drawer | 1440/1024/768/390 px | Opens as a right-hand sheet; on small screens it is full-width; settled opacity **1**; fully on-screen; no horizontal overflow. |
| Workspace and role menus | 1440/1024/768/390 px | Settled opacity **1**; menus stay within the viewport; at 390 px the workspace menu is a fixed sheet with an opaque `.glass-strong` surface, and screenshot inspection showed no page text bleeding through after the 200 ms entry animation. |
| Dialogs (submit, review decision) | 390 px and desktop | Opaque `.glass-strong` panels; fully on-screen; no horizontal overflow at 390 px; focus is moved into the dialog and restored on close. |
| Header actions | 1440 px | Page-header action groups are right-aligned, wrap instead of overflowing, and remain within the header at reduced widths. |

A first overlay measurement taken immediately after opening the workspace menu read opacity `0` because the 200 ms `rise-in` animation had just started. Re-measuring after 1.2 s read opacity `1` and the screenshot was fully opaque. This was a measurement timing issue, not an application defect.

### 3.3 Manual and accessibility verification

- All interactive checks were driven through the real UI with real server sessions; no route was stubbed or mocked. No separate human manual pass was performed — the browser was controlled programmatically over CDP.
- Semantic structure, labels, `aria-expanded`/`aria-haspopup`, `role="menu"`/`menuitemradio`, tab `role`/`aria-selected`, dialog focus trapping/restoration, and `:focus-visible` styling are present in the shipped components.
- Tabs support Arrow/Home/End keys; dialogs close on Escape and restore focus; the workspace menu closes on Escape and outside click.
- **Not run this round:** a full keyboard-only traversal of all 22 journeys, screen-reader testing, automated axe/WCAG auditing, and color-contrast measurement. Earlier rounds covered dialog focus management and tab keyboard navigation; this round did not repeat a full assistive-technology audit.

### 3.4 Harness issues found and resolved (not application defects)

- A stale document ID from an earlier database seed produced an “Content unavailable” page until the current IDs were queried from the API. The journey was rerun with valid IDs.
- The first journey script built an invalid JavaScript click predicate (`trim() includes "..."`); all clicks silently failed until the predicate was corrected. The rerun completed all steps.
- The initial overlay script measured menus during their entry animation and used a document without a Submit button for a dialog check; both were corrected and the checks rerun.

No product behavior failed in the final runs.

---

## 4. Deployment verification

The redesign was deployed to production on 2026-10-30.

| Item | Result |
| --- | --- |
| Commit | `e59bb17` — “Redesign frontend with dark 3D glass system” |
| GitHub push | `54d8784..e59bb17 main -> main` |
| Vercel deployment | `dpl_5PHx5bjX5WaUUP7taiYMWc1gjx57`, target production, state **READY** |
| Production alias | <https://inkloom-ai-rho.vercel.app>, currently serving the docs-only follow-up `7aa6774`; docs commits rebuild identical frontend assets |
| Live assets | `assets/index-C1W67hZu.js` (624,811 bytes) and `assets/index-CjC3LMnu.css` (58,064 bytes) |
| Backend | Unchanged; still commit `ccf799b` on Render |

Live browser smoke (headless Chrome over CDP, 2026-10-30):

- App loaded as Organization Admin in the Acme Cloud Technologies workspace; no onboarding or workspace-selection gate.
- Body background computed as `rgb(7, 11, 24)`; **14** `.glass`/`.glass-soft`/`.glass-strong`/`.glass-inset` surfaces present; sidebar and header rendered.
- **0 JavaScript errors** captured via `window.onerror` and `unhandledrejection`.
- `scrollWidth == innerWidth` at **1440** and **390** px.
- At 390 px the workspace menu opened, settled at opacity **1**, occupied `left 12 → right 378` within a 390 px viewport, and showed no page-content bleed-through.
- Live CSS contains the dark token (`#070b18`) and the opaque `.glass-strong` gradient (`linear-gradient(156deg,#1f2c4b,#0e172b 60%,#080e1c)`).
- Screenshots: `%TEMP%\inkloom-cdp\shots\live-redesign-1440.png`, `live-redesign-390.png`, `live-menu-390.png`.
- Re-run after the docs-only deployment (`7aa6774`) took the alias: identical results — `rgb(7, 11, 24)` background, 14 glass surfaces, 0 errors, no overflow at 1440/390 px, menu settled at opacity 1 within the 390 px viewport, same asset hashes.

Historical live smoke (2026-10-29, Round 3 build `ccf799b`, **not** this redesign): `POST /api/v1/auth/demo/session` → **201**; role-only header without a token → **401**; `GET /api/v1/insights/` with an admin token → **200**; production OCR disabled by `OCR_PROVIDER=none`.

The full 22-journey suite was executed locally, not against the live deployment. The live smoke covered the deployed shell, home page, workspace menu, dark styling, responsive overflow, and console health.

---

## 5. Known failures and limitations

- **Automated failures:** none. Backend 84/84, frontend 27/27, `tsc` 0 errors, production build success.
- **Build advisory:** one chunk over 500 kB (`624.78 kB` JS); the build passes and was not code-split in this round.
- **Browser coverage:** Chromium only. Safari, Firefox, real iOS/Android devices, screen readers, and axe were not tested. Widths tested: 390, 768, 1024, 1440 px.
- **Live coverage is smoke-level.** The redesign is deployed and passed the live smoke above, but the 22 journeys were not re-run against the live deployment, and the live backend still disables OCR.
- **OCR quality:** verified with generated, clean fixtures; photographs, handwriting, non-Latin scripts, and low-resolution scans were not measured.
- **Animation timing:** menus and dialogs enter over 200–240 ms. Opacity is 0 at the first animation frame by design; settled-state checks pass.
- **Reduced motion:** the stylesheet disables animations/transitions and hover lift under `prefers-reduced-motion: reduce`; this was inspected in code, not exercised with an OS-level setting in the browser.
- **No product PDF:** the repository contains only uploaded evidence PDFs (seed brochure and verification uploads), not a product PDF, so none was regenerated.

---

## 6. Local data touched during verification

All changes are confined to the local development SQLite database and upload directory; no production or deployed data was touched.

- `Lifecycle QA 080941` with versions 1–3, five audit runs, one comment, two decisions, an assignment, and 14 history events.
- OCR verification documents (image `e7679dc1…`, mixed PDF `70a3805f…`) with stored OCR lines and findings.
- A throwaway workspace, `Journey Empty 081503`, used to verify empty states and zeroed API counts.
- The journey harness signed in as the seeded Creator, Reviewer, and Admin accounts and switched between the seeded Acme and Northwind workspaces. No seeded record was deleted.

To reset the local demo, back up and remove `backend/inkloom.db` and `backend/data/uploads/`; the startup seed recreates the fictional Acme workspace.

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

Browser journeys require a local backend and frontend running plus a Chrome installation. The CDP harness used here is intentionally outside the repository and is not shipped.
