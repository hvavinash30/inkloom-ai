# Inkloom AI — Hackathon Round 2 Final Report

## 1. Summary

Inkloom AI is a working brand-governance workspace for the fictional **Acme Cloud Technologies** demo account. It lets a creator check copy against stored rules and approved facts, apply corrections into new versions, and send an exact version to a reviewer. Reviewers see the evidence, comment, and record version-bound decisions. Admins maintain the rules, facts, campaigns, research records, evaluation cases, and workspace settings.

The defining decision in this round was to **remove the language model from the audit path**. Earlier plans described a three-stage RAG + LLM pipeline. During implementation, that design would have made it too easy to imply certainty the system did not have. The final build instead uses deterministic matching, approved-fact comparison, explicit verification states, and honest boundaries wherever the system cannot act (OCR, transcription, broad semantic judgment). No simulated AI output is presented as real.

All demo content is fictional and labelled. No survey, interview, competitor result, customer metric, or benchmark in the workspace is real.

---

## 2. What works end to end

| Area | Delivered behavior |
| --- | --- |
| Content intake | Text, PDF, image, video, and transcript submissions with server-side type, size, and page limits |
| Checks | Prohibited phrases, claim restrictions, tone, product naming, required terminology, fact contradictions, unsupported quantitative claims, human-review fallbacks |
| Evidence | Exact quote, page or timestamp, rule/fact source, verification status, confidence, explanation, score deductions |
| Corrections | Apply suggested correction in the editor; save immutable version; re-check; submit |
| Review | Priority queue from stored findings; comments; approve/reject/request changes tied to a version; stale-approval warning |
| Versions | Line-based comparison; decision history; append-only activity trail |
| PDF | Real `pypdf` extraction, page preservation, page-linked findings, authenticated viewer, explicit extraction failures, manual page fallback |
| Video | Real player for stored files; timestamped transcript checks; no player or timestamps when no file/transcript exists |
| Campaigns | Cross-asset claim conflicts, approved-value evidence, resolution records, readiness computed from stored state |
| Brand memory | Facts/rules CRUD, statuses, source references, impact analysis, rule simulation, draft-rule suggestions, contrast checker |
| Research | Sections, statuses, structured details, named sources, completion gate |
| Evaluation | Five deterministic cases executed against the real engine; stored measurements |
| Insights | Aggregates from stored audits and findings only |
| Assistant | Workspace-grounded, deterministic replies with declared mode, evidence, suggested actions, and limitations |
| Roles | Creator, Reviewer, Organization Admin with server capability checks and workspace isolation |
| UI | Responsive desktop/tablet/mobile layouts, navy navigation, restrained blue accent, status colors, empty/loading/error states |

---

## 3. Security and trust decisions

- All protected API routes re-check role capabilities on the server.
- Every record query is scoped to the workspace; creator draft access has an additional ownership check.
- Uploads are type- and size-validated, filenames are sanitized, and downloads require authorization.
- No Supabase service key, LLM key, or other secret exists in the frontend.
- Integration responses report configuration names/states, never secret values.
- Findings never claim verification without a stored rule or approved fact. Unsupported claims are marked for human review.
- When OCR or transcription is unavailable, the interface says so and requests human input.
- The assistant declares `rule_based` mode and states that no external model is configured.
- Demo records are labelled individually and in the shell.

**Explicit limitation:** the role switcher is not authentication. The server enforces capabilities, but anyone can choose a demo role. Production use requires a real identity provider and a review of the trust boundary.

---

## 4. What changed from the initial proposal

1. **Dropped the LLM verification stage.** A language model could produce plausible but unsupported findings. The deterministic engine and approved-fact comparisons are narrower, but every finding is traceable. The optional LLM environment variables remain a configuration flag only.
2. **Added real PDF intelligence.** Page extraction, page-linked findings, authenticated viewing, extraction-error states, and a manual page fallback replaced the original mock preview.
3. **Added the video truth boundary.** The product supports real playback and timestamped transcript analysis, but refuses to invent a player, transcript, or timestamps.
4. **Introduced three server-enforced roles.** The original single-editor flow became Creator, Reviewer, and Organization Admin workspaces with distinct capabilities.
5. **Added campaign governance.** Cross-asset claims, conflicts, resolutions, and readiness are computed from stored assets rather than a static dashboard.
6. **Replaced planned research claims with a research record.** The workspace documents planned and completed work with named sources; planned items are visibly not conducted.
7. **Replaced benchmark claims with a small evaluation fixture.** Five cases run the real engine and store actual outcomes. They are not presented as external accuracy metrics.

---

## 5. Verification evidence

Measured on 2026-10-24:

| Check | Result |
| --- | --- |
| Backend pytest | 17 passed, 0 failed (1 third-party deprecation warning), 6.48 s |
| TypeScript + Vite build | 0 errors; 1,619 modules; JS 519.92 kB (gzip 135.00 kB), CSS 45.60 kB (gzip 8.15 kB); one chunk-size advisory |
| Responsive sweep | 63 page loads at 1440/834/325 px; 0 console errors, 0 overflow, 0 HTTP ≥ 400 |
| Creator + reviewer journey | 9/9 checks passed, including versioning, request changes, exact-version approval, stale approval, version comparison, real PDF upload, manual PDF pages, transcript-only video |
| Admin journey | 10/10 checks passed, including fact/rule creation, contrast 17.85:1, matched-document rule simulation, draft rule, conflict resolution, research add/edit, 5/5 evaluation cases, settings, team, mobile drawer |

Browser journeys ran against an isolated copy of the demo database and upload directory, so the shipped demo workspace remains as seeded.

There is no ESLint configuration; `tsc` is the static check and runs as part of `npm run build`.

---

## 6. Demo path (about five minutes)

1. **Admin overview** — live counts and integration boundaries.
2. **Brand library** — named sources, rule statuses, contrast check.
3. **Policies** — simulate `100%`, see stored matches, create an inactive draft rule.
4. **Creator** — check copy containing `#1`, `100% uptime`, an outdated price, and `!!!`; apply a fix; save version 2; submit.
5. **Reviewer** — high-risk queue, evidence, comment, request changes on version 2.
6. **Creator** — revise and submit version 3.
7. **Reviewer** — approve version 3; creator edits version 4; stale approval appears; compare versions.
8. **PDF** — page 2 findings in the authenticated viewer.
9. **Video** — timestamped transcript findings with no fake player.
10. **Campaign** — two unresolved pricing conflicts; record a resolution.
11. **Research + evaluation** — planned work marked not conducted; run all five deterministic cases.
12. **Assistant** — ask for the highest-risk findings; inspect the grounding list and declared mode.

---

## 7. Planned Round 3 improvements

These are proposals, not completed features:

1. **Production identity** — replace demo role headers with Supabase Auth, derive workspace roles from trusted claims, and test cross-workspace isolation with real sessions.
2. **Opt-in multimodal providers** — add OCR and speech-to-text behind explicit configuration, with confidence reporting, human-review fallback, and no claims of accuracy until measured.
3. **Evidence expansion** — store source documents themselves (not only references), add source validity dates, and warn when a finding cites an expired source.
4. **Richer evaluation** — grow beyond five synthetic fixtures only with consented, licensed data, and publish measured precision/recall with the dataset definition.
5. **Operational hardening** — Postgres + object storage, background re-review reminders, rate limiting, malware scanning, and external audit logs.
