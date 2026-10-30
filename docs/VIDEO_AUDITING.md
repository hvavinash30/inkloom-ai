# Automatic Video Auditing

Status: implemented and verified locally on 2026-10-30. **Not committed, pushed, or deployed.**
Scope: the existing Inkloom AI application. This is not a separate video application, and the
manual-transcript and transcript-only paths still work.

---

## 1. What changed

Before this change, a video needed a user-supplied transcript. Without one, the audit reported
that transcription was unavailable and asked for a transcript.

Now a creator can upload a supported video and click **Run video audit** with no transcript:

1. the server stores and validates the video;
2. FFmpeg extracts the audio track to a temporary file;
3. the configured speech-to-text provider transcribes it and returns timestamped segments;
4. FFmpeg samples representative frames at a configured interval;
5. the local RapidOCR engine reads visible text from those frames;
6. the existing deterministic brand-governance engine checks the spoken text and each frame's
   extracted text against the workspace's active rules and approved facts;
7. findings keep their source (`spoken` or `on_screen`), the provider's timestamp or the sampled
   frame's timestamp, and (for on-screen findings) the stored frame image.

A manual transcript is still optional. When supplied, it takes precedence over automatic
speech-to-text. A transcript-only submission (no video file) behaves exactly as before.

No language model is used in this pipeline. Speech text is extracted by the configured provider
and on-screen text by local OCR; every finding still comes from a stored rule or approved fact.

---

## 2. Server-side pipeline

`backend/app/services/video_service.py`

```text
POST /uploads  (kind=video)
  → ingestion.py: extension/MIME/size checks, container sniff, server-generated name
  → VideoExtraction row (status=queued)
  → in-process ThreadPoolExecutor(max_workers=1)
  → probe duration/audio with FFmpeg
  → speech stage (independent)          → visual stage (independent)
      extract mono audio to temp            plan frame times (capped, duration-aware)
      call provider /audio/transcriptions   extract JPEG frames (960 px wide)
      keep provider segments/timestamps     run local RapidOCR per frame
      delete temp audio                     store frame text + timestamp + file
  → finalized status + per-stage messages (persisted)
```

- Jobs are persisted in `video_extractions`; polling is `GET /api/v1/uploads/{upload_id}`.
- Startup recovery marks jobs interrupted by a restart as failed and retryable. It never reports
  a stale `processing` state as complete.
- One worker bounds CPU and memory. A processing timeout (`VIDEO_PROCESSING_TIMEOUT_SECONDS`)
  and per-provider/OCR timeouts prevent indefinite blocking.
- A run can be canceled while queued or processing. A retry can reuse a completed transcript and
  re-run only the failed visual stage, or explicitly re-run speech with `rerun_speech=true`.
- A second audit request while the video is still processing is rejected with `409`.

### 2.1 Extraction statuses

| `video.status` | Meaning |
| --- | --- |
| `queued` | Stored; waiting for the single worker |
| `processing` | A stage is running |
| `completed` | Every configured stage ran and produced usable results |
| `partial` | One source was analyzed and the other failed or was unavailable |
| `no_content` | Both stages ran but found no spoken or on-screen text |
| `failed` | Neither source produced usable text, or validation/processing failed |
| `canceled` | Canceled by the user before completion |

`upload.extraction_status` is a compatibility mirror: `processing`, `processed`, `partial`,
`no_text`, `error`, `canceled`.

Stage statuses include `pending`, `running`, `completed`, `skipped`, `unavailable`, `failed`,
`no_audio`, and `no_speech`. The UI renders the server's message for each stage; it never
invents percentages or marks a stage complete on its own.

### 2.2 Speech stage

`backend/app/services/speech_service.py`

- Provider: `openai_whisper` (an OpenAI-compatible `POST /audio/transcriptions` endpoint with
  `response_format=verbose_json`). Base URL, model, timeout, and optional language are
  configurable.
- Only the server calls the provider. The browser never receives the key.
- Provider segment timestamps are stored as returned (`timestamp_seconds`, `timestamp_label`).
  If a provider returns no segment timestamps, the transcript is stored without timestamps;
  no timestamps are invented.
- Outcomes: `completed`, `no_speech`, `no_audio`, `unavailable` (not configured), `failed`
  (network, timeout, rejected key, provider error). Messages are specific and user-visible.
- A video with no audio track reports `no_audio` instead of pretending transcription failed.
- The temporary audio file is deleted after the provider call, success or failure.

### 2.3 Visual stage

- Frames are sampled at `VIDEO_FRAME_INTERVAL_SECONDS`, but the step is widened when needed so
  the count never exceeds `VIDEO_MAX_FRAMES`. Frame timestamps stay below the video duration.
- Videos above `VIDEO_MAX_DURATION_SECONDS` are refused instead of being partially guessed.
- Frames are downscaled to `VIDEO_FRAME_MAX_WIDTH` JPEGs and stored under
  `UPLOAD_DIR/frames/{upload_id}/`.
- The existing local RapidOCR engine (`ocr_service`) reads each frame; text with fewer than
  `VIDEO_MIN_FRAME_TEXT_CHARS` is treated as no readable text.
- An OCR failure on one frame is recorded in that frame's result; the stage continues with the
  remaining frames. Unavailable OCR marks the stage unavailable and records a processing issue.
- On-screen finding locations are `On-screen mm:ss`; each carries the frame URL and timestamp.
- Only visible text is checked. Logo, colour, layout, and other visual correctness are **not**
  judged and the UI says so.

### 2.4 Audit integration

`audit_engine.run_video_audit` composes the existing deterministic engine:

- spoken text is audited by the transcript path; labels become `Spoken mm:ss` when the
  transcript is automatic and stay `Timestamp mm:ss` for a manual transcript;
- each frame with readable text is audited separately; findings get `source_type=on_screen`,
  `frame_url`, and `On-screen mm:ss`;
- spoken findings get `source_type=spoken` and never carry a frame URL;
- a failed/unavailable stage produces a `processing_issue` finding explaining the gap;
- when either stage was not analyzed, verification is downgraded to `partially_verified`, or
  `unable_to_verify` when no real finding exists. It is never reported as complete coverage;
- the stored method label states the coverage, for example
  `video-audit-v2 (spoken: automatic; on-screen frames with text: 1)`.

Findings reuse the existing `AuditFinding` model and evidence fields. The workspace's active
rules and approved facts are resolved server-side; nothing is hard-coded to the demo workspace.

---

## 3. API surface

| Method and path | Purpose |
| --- | --- |
| `POST /api/v1/uploads/` | Upload a video (`kind=video`); starts extraction and returns the serialized `video` state |
| `GET /api/v1/uploads/{upload_id}` | Poll upload and `video` state (stages, transcript, frames, config, retry/cancel flags) |
| `POST /api/v1/uploads/{upload_id}/video/retry?rerun_speech=false` | Retry processing; reuses a completed transcript unless speech is explicitly re-run |
| `POST /api/v1/uploads/{upload_id}/video/cancel` | Cancel queued/processing work |
| `GET /api/v1/uploads/{upload_id}/frames/{file_name}` | Authenticated frame JPEG for evidence previews |
| `GET /api/v1/uploads/{upload_id}/file` | Authenticated original video stream |
| `POST /api/v1/audits/submit-and-audit` | Create the version and run the audit; accepts `content_text` (manual transcript) and the stored upload |

All upload, frame, and file routes resolve the upload inside the caller's workspace and apply the
same creator/owner/brand-read checks as other files. Cross-workspace IDs return `404`.

The upload response's `video.config` block reports configuration states (provider/model names,
reasons, OCR availability, FFmpeg source/version, frame limits). It never includes a key.

---

## 4. UI behavior

`frontend/src/pages/NewContentPage.tsx`, `DocumentPage.tsx`, `FindingCard.tsx`,
`FramePreview.tsx`

- The video format explains that a transcript is optional.
- The upload card shows the real filename, size, and server-reported state.
- **Automatic video analysis** panel shows the overall status, attempt, duration, audio presence,
  frames read, and each stage's real status/message. It warns when FFmpeg, the transcription
  provider, or OCR is unavailable, and shows the reason returned by the server.
- **Run video audit** is prominent and is disabled while the upload or analysis is in flight.
  Duplicate submissions are guarded in the UI and rejected by the API (`409`) if reached anyway.
- **Add a manual transcript (optional)** is collapsed by default. A supplied transcript takes
  precedence over automatic speech.
- Buttons: **Retry analysis**, **Re-transcription** (calls the provider again), **Cancel
  analysis**, **Refresh status**. Retry does not require re-uploading the file.
- Polling runs every 2 seconds while the job is `queued`/`processing` and stops at a final
  state. Reloading the page recovers the persisted state from the server.
- Findings show the `Spoken` or `On screen` source badge, severity, explanation, rule/fact
  reference, affected text, timestamp, frame preview (on-screen), suggested correction, and a
  source-specific limitation note. Automatic evidence is described as extracted evidence to
  verify, never as verified truth.
- **Play at mm:ss** seeks the stored video player. The transcript view also seeks from each
  timestamp. Frame images are fetched with the bearer token and shown from a Blob URL; no public
  URL is exposed.
- The document's Content & evidence tab states the transcript provenance: automatic provider and
  model, or manual precedence. A prior transcript-only asset continues to show "No source file
  attached" and never renders a fake player.

---

## 5. Configuration

All values are backend-only. Set them in `backend/.env` locally, or in the Render/host
environment for a deployment. Never put a provider key in `frontend/` or any `VITE_*` variable.

### 5.1 Required for automatic speech-to-text

| Variable | Default | Notes |
| --- | --- | --- |
| `TRANSCRIPTION_PROVIDER` | `none` | Set to `openai_whisper` to enable speech-to-text |
| `TRANSCRIPTION_API_KEY` | empty | Provider key; falls back to `OPENAI_API_KEY` when empty |
| `TRANSCRIPTION_API_BASE` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint that supports `/audio/transcriptions` |
| `TRANSCRIPTION_MODEL` | `whisper-1` | Must be a transcription model offered by the endpoint |
| `TRANSCRIPTION_LANGUAGE` | empty | Optional ISO-639-1 hint |
| `TRANSCRIPTION_TIMEOUT_SECONDS` | `180` | Provider request timeout |
| `TRANSCRIPTION_MAX_AUDIO_BYTES` | `25165824` (24 MiB) | Extracted audio size cap |

If the provider is not configured, uploads still run the on-screen stage; the speech stage is
reported as `unavailable` with an explicit reason and the audit records a processing issue. The
UI never claims the video was fully analyzed.

### 5.2 FFmpeg

FFmpeg is resolved in this order:

1. `FFMPEG_PATH`, if set and the file exists;
2. a system `ffmpeg` on `PATH`;
3. the static binary bundled by the `imageio-ffmpeg` package (already in
   `backend/requirements.txt`).

The health payload and the analysis panel report which source and version are in use. If none is
available, audio and frames cannot be extracted and the failure is explicit. No `ffprobe` binary
is required; the app parses `ffmpeg -i` output.

### 5.3 Visual stage and limits

| Variable | Default | Notes |
| --- | --- | --- |
| `OCR_PROVIDER` | `auto` | `auto`/`rapidocr` use the local RapidOCR engine; `none` disables it |
| `VIDEO_FRAME_INTERVAL_SECONDS` | `10` | Nominal sampling interval |
| `VIDEO_MAX_FRAMES` | `24` | Hard cap; the interval widens automatically to respect it |
| `VIDEO_MAX_DURATION_SECONDS` | `900` | Longer videos are refused rather than partially analyzed |
| `VIDEO_FRAME_MAX_WIDTH` | `960` | Stored frame width |
| `VIDEO_PROCESSING_TIMEOUT_SECONDS` | `600` | Overall processing budget |
| `VIDEO_MIN_FRAME_TEXT_CHARS` | `3` | Shorter OCR output is treated as no readable text |
| `MAX_VIDEO_UPLOAD_BYTES` | `125829120` (120 MiB) | Upload limit; also reported in the UI |
| `OCR_MAX_PAGES` / `OCR_RENDER_DPI` | `12` / `150` | PDF OCR controls; frame OCR uses the same engine |
| `OCR_TIMEOUT_SECONDS` | `60` | Per-image/frame OCR budget |
| `OCR_MAX_IMAGE_PIXELS` | `20000000` | Image/frame decode limit |

The existing `imageio-ffmpeg` and `rapidocr-onnxruntime` packages are installed by
`pip install -r requirements.txt`. A system FFmpeg is optional. A deployment must have enough
memory for FFmpeg plus OCR; the free Render plan was not validated for this workload.

### 5.4 Deployment checklist (manual)

1. Set `TRANSCRIPTION_PROVIDER=openai_whisper`.
2. Add `TRANSCRIPTION_API_KEY` (or `OPENAI_API_KEY`) as a secret in the host dashboard. Do not
   put it in `render.yaml`, the repository, or any frontend environment.
3. Optionally set `TRANSCRIPTION_API_BASE`, `TRANSCRIPTION_MODEL`, `TRANSCRIPTION_LANGUAGE`.
4. For on-screen text, set `OCR_PROVIDER=auto` and confirm the instance has enough memory.
5. Keep the upload directory on a persistent disk for durable evidence, and pair it with a
   persistent database. On an ephemeral host, files and the database reset on redeploy.
6. Redeploy the API and check `/api/v1/health` reports the expected
   `integrations.transcription` and `integrations.video` states.
7. Rebuild the frontend only if frontend files changed.

No credentials are included in the repository. Supplying the provider key and choosing the
deployment configuration remain manual steps.

---

## 6. Costs and operational notes

- Speech-to-text is billed by the provider. One provider call is made per video upload (or per
  explicit re-transcription); retrying the visual stage reuses a completed transcript.
- Exactly one video job runs at a time per process. Uploads queue instead of overloading the
  host. There is no distributed queue; a multi-instance deployment needs shared work claiming.
- Frame OCR is local and free of API cost but uses CPU and memory. The frame cap and duration
  limit bound that cost.
- Logs contain IDs, statuses, and provider/model names, never API keys or transcript text.
- Temporary audio is deleted after the provider call. Sampled frames remain with the upload while
  the database record exists, because they are evidence previews.

---

## 7. Verification

Environment: Windows, local FastAPI + SQLite, Vite dev server, a 4-second 960×540 MP4 fixture with
a title card reading `100% uptime` and a sine-wave audio track. The speech provider was a local
OpenAI-compatible mock that returned two timestamped segments; the rest of the pipeline (FFmpeg,
RapidOCR, audit engine, persistence) was real.

### 7.1 Automated tests

| Command | Result |
| --- | --- |
| `cd backend && .venv\Scripts\python.exe -m pytest tests/test_video_pipeline.py -q` | **18 passed** in 20.47 s |
| `cd backend && .venv\Scripts\python.exe -m pytest -q` | **102 passed**, 0 failed, 1 third-party deprecation warning, 35.78 s |
| `cd frontend && npm run build` | `tsc` + Vite build succeeded; 1,625 modules, JS 640.03 kB (gzip 162.91 kB), CSS 58.74 kB (gzip 11.02 kB) |

The video tests cover: persisted speech + visual stages; audit without a manual transcript; manual
transcript precedence; speech unconfigured; provider failure with visual results preserved; OCR
unavailable with spoken results preserved; no audio track; no speech and no visible text; invalid,
corrupt, and oversized uploads; `409` while processing; cancel and duplicate retry guards; retry
reusing a transcript while re-running frames; interrupted-job recovery; workspace isolation of
uploads and frames; health reporting; and real RapidOCR on a generated title card.

### 7.2 Browser / API end-to-end

| Check | Result |
| --- | --- |
| Upload without a transcript | Stored as `video`; **Automatic video analysis** showed `Complete`, attempt 1, `00:04`, audio track present, `1/1 frames read` |
| Speech stage | `Complete` — 2 timestamped segments from `openai_whisper` (`whisper-1`) |
| Visual stage | `Complete` — on-screen text read from 1 of 1 sampled frames |
| Run video audit | Created version 1; score **40**, verification `verified`, model `video-audit-v2 (spoken: automatic; on-screen frames with text: 1)`; **2 critical findings** |
| Findings | `On screen` at `On-screen 00:00` and `Spoken` at `Spoken 00:02`, both for `100% uptime`, each citing the approved SLA fact |
| Frame evidence | 960×540 JPEG fetched through the authenticated endpoint as a Blob URL |
| Timestamp playback | `00:02` sought and played the stored video |
| Provenance | Transcript section: "Automatically transcribed by openai_whisper (whisper-1)"; version metadata `transcript_source=automatic` |
| Refresh recovery | Reload preserved findings, metadata, frame preview, and transcript |
| Console | 0 errors during the flow |

Two UI defects found during this verification were fixed and re-checked: an automatic transcript
was duplicated in an "untimestamped transcript text" block, and an on-screen finding was anchored
to the transcript line at the same timestamp. On-screen findings now stay with their frame
evidence, and the duplicate block is suppressed when segments already cover the text.

### 7.3 Browser check with speech-to-text unconfigured

A second stack (separate SQLite database and upload directory, backend on port 8012 with
`TRANSCRIPTION_PROVIDER=none`, Vite proxy on port 3002) uploaded the same fixture with no
transcript to verify the honest partial state end to end.

| Check | Measured result |
| --- | --- |
| Analysis panel | `Partial results`, attempt 1, `00:04`, audio track present, `1/1 frames read` |
| Speech stage | `Unavailable` — "Automatic speech-to-text is not configured (TRANSCRIPTION_PROVIDER=none)" |
| Visual stage | `Complete` — readable text on 1 of 1 sampled frames |
| Guidance | "On-screen text was analyzed, but speech was not transcribed"; "Add a manual transcript below to check spoken content." |
| Controls | `Retry analysis` and `Refresh status` available; `Run video audit` stayed enabled |
| Audit result | Document `Checked`; badges `Critical risk` and `Partially checked`; stored `verification_status = partially_verified` |
| Findings | 2: the on-screen `100% uptime` contradiction (`On-screen 00:00`, frame preview, approved-SLA citation) and one `Inspection limit` — "Spoken content was not analyzed" |
| Score | **62** — −30 confirmed contradiction, −8 processing issue |
| Fabrication check | No spoken findings and no spoken timestamps were created; the only spoken entry states that speech was not analyzed |

A third truthfulness defect was found and fixed here: the `processing_issue` card inherited the
video provenance badge and note, so an unanalyzed-speech limit was labelled `Spoken` and described
as "extracted from automatically transcribed speech", and it offered correction-drafting actions
that paste guidance into copy. Inspection-limit cards now omit the source badge, state that the
stage could not be inspected and is not a content violation, and hide Apply/Suggest/Edit
correction actions. Re-checked in the browser: the limit card shows the corrected note and only
"Ask about this" and "Mark accepted"; the on-screen evidence card is unchanged.

### 7.4 Scenario matrix

| # | Scenario | Result / coverage |
| --- | --- | --- |
| 1 | Video upload, no transcript, run audit | Passed in API/browser E2E and test 2 |
| 2 | Manual transcript still works and takes precedence | Test 3; existing transcript suite |
| 3 | Transcript-only asset still audits | Existing transcript tests; UI preserved |
| 4 | Text/PDF/image paths unaffected | Full backend suite; frontend build; no changes to those paths |
| 5 | Speech provider unconfigured | Test 4; explicit `unavailable` stage, processing issue, `partially_verified` run |
| 6 | Speech provider fails/times out | Test 5; visual results preserved |
| 7 | OCR unavailable | Test 6; spoken findings preserved |
| 8 | FFmpeg missing | Health/state reporting and explicit stage failure (unit-level); not exercised by removing the binary in the E2E run |
| 9 | No audio track | Test 7; reports `no_audio`, not a config error |
| 10 | No spoken or on-screen text | Test 8; `no_content`, not a clean result |
| 11 | Unsupported, corrupt, oversized upload | Tests 9–11; explicit 4xx/error states |
| 12 | Duplicate submit while processing | Test 12; API `409` + UI disabled during analysis |
| 13 | Cancel processing | Test 13 |
| 14 | Retry without re-upload | Tests 13–14; transcript reuse and frame retry |
| 15 | Restart during processing | Test 15; interrupted job marked failed/retryable |
| 16 | Workspace isolation of uploads/frames | Test 16; cross-workspace `404` |
| 17 | Health reports pipeline capabilities | Test 17 |
| 18 | Real OCR on a generated frame | Test 18 and browser frame text |
| 19 | Timestamp seek and frame preview | Browser E2E; authenticated Blob frame and seek to 00:02 |
| 20 | Refresh recovery | Browser reload; persisted video state, findings, metadata |

### 7.5 Not verified

- No real paid provider call was made; the provider contract was exercised with a local
  OpenAI-compatible mock. The first production call should be monitored for quota, latency, and
  response-shape differences.
- No deployment was performed. Render still runs the previous backend commit and the live app
  does not include this pipeline.
- OCR was verified on clean generated frames, not on noisy, handwritten, animated, or non-Latin
  video text.
- Chromium only; no Safari/Firefox, mobile-device, screen-reader, or axe pass for the new panel.
- Frame sampling is interval-based and can miss short on-screen flashes between samples; the UI
  states that on-screen results come from sampled frames.
- No speaker diarization, translation, or visual-quality judgement is provided.

---

## 8. Known limitations and boundaries

- Speech-to-text requires a configured provider; the default is none. Without it, on-screen
  analysis still runs and the audit reports the missing spoken coverage.
- Provider timestamps are preserved, not recalculated. If the provider returns no timestamps,
  findings have no timestamps rather than invented ones.
- OCR reads printed text; stylized, animated, low-contrast, or very small on-screen text may be
  missed or misread. The frame preview is the evidence to verify.
- Only sampled frames are analyzed, so short overlays can be missed.
- Logo, colour, layout, motion, audio tone, and visual-quality correctness are not judged.
- The job runner is in-process and single-worker. A restart marks in-flight work failed
  (retryable); it does not resume mid-stage. Multi-instance deployments need a shared queue.
- Uploads and frames are local-disk files. Durable deployments need a persistent disk or object
  storage, plus a durable database.
- Demo identity remains fictional; production must replace it with a real identity provider.

---

## 9. Files

| Area | Files |
| --- | --- |
| Pipeline | `backend/app/services/video_service.py`, `speech_service.py`, `ocr_service.py`, `audit_engine.py` |
| Storage and models | `backend/app/models/assets.py`, `backend/app/services/ingestion.py`, `content_service.py` |
| API | `backend/app/api/v1/endpoints/uploads.py`, `audits.py`, `health.py` |
| Config | `backend/app/core/config.py`, `backend/.env.example`, `render.yaml` |
| Frontend | `frontend/src/pages/NewContentPage.tsx`, `DocumentPage.tsx`, `components/FindingCard.tsx`, `components/FramePreview.tsx`, `services/api.ts`, `types/index.ts` |
| Tests | `backend/tests/test_video_pipeline.py` |
| Docs | `docs/VIDEO_AUDITING.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/VERIFICATION.md`, `PROJECT_STATUS.md` |
