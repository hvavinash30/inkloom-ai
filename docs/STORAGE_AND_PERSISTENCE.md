# Storage and Persistence

This document describes what Inkloom AI actually stores, what survives a restart
or redeploy, and how to make records durable. It intentionally describes the
current implementation only — nothing here is aspirational.

## Where data lives

Inkloom AI has two independent storage layers:

| Layer | What it holds | Configured by |
| --- | --- | --- |
| Database | Workspaces, brand guidelines (rules), approved facts, campaigns, documents, versions, audit runs, findings, comments, review decisions, approval state, provenance/activity events, upload metadata | `DATABASE_URL` |
| Uploaded files | The original bytes of uploaded PDFs, images, video, and text/transcript files | `UPLOAD_DIR` |

These two layers are **not** transactional with each other. A database row can
exist while its file is gone (for example after an ephemeral instance resets).
The API never serves broken bytes in that case; it reports that the stored file
is no longer available and a reviewer must re-upload.

## Default (SQLite, local filesystem)

- `DATABASE_URL=sqlite:///./inkloom.db`
- `UPLOAD_DIR=./data/uploads`

SQLite is the zero-setup default for local development and for the bundled
fictional demo. On an ephemeral host — including the Render free plan — both the
database file and the uploads directory live on a filesystem that **resets on
restart or redeploy**. When that happens the startup seed recreates the fictional
"Acme Cloud" demo workspace so the app is usable again; any records created in a
previous session are gone.

The application states this honestly:

- `GET /api/v1/health` reports `storage.database.durable=false` and
  `storage.uploads.durable=false` with a plain-language note.
- Startup logs print the database label, durability, connectivity, upload
  writability, and AI provider status.

It never claims a record is durable when it is not.

## Making records durable

### Database

Point `DATABASE_URL` at a Postgres instance (Supabase, Neon, Render Postgres, or
self-hosted). The Postgres driver (`psycopg`) is already listed in
`backend/requirements.txt`.

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

Behavior when you switch:

- Tables are created automatically on first start (`create_all`).
- No tables are dropped, and the production database is never recreated in place.
- Existing SQLite data is **not** migrated automatically. Moving existing records
  is a deliberate, separate step: export from SQLite and import into Postgres, or
  re-create the records through the API.
- Startup validation runs `SELECT 1`; if the database is unreachable the app logs
  a connectivity failure (by exception type only) and the health endpoint reports
  `database_error`, without printing the connection string.

Once Postgres is configured, `database_durable` is inferred as `true`. If you
attach a persistent disk to a SQLite deployment instead, set
`DATABASE_PERSISTENT=true` so health reporting reflects reality.

### Uploaded files

Uploaded bytes are written to the server filesystem. Database backups do **not**
cover them. To make uploads durable you must either:

- attach a persistent volume and set `UPLOAD_DIR` to a path on it, then set
  `UPLOADS_PERSISTENT=true`; or
- move uploads to an object store (for example Supabase Storage). This is not
  implemented in this build; confidential uploads are not moved to an external
  service without explicit authorization.

If a file cannot be retrieved, the API returns a clear error (`The stored file is
no longer available.`) and a health/upload record marking the file as missing,
rather than a broken download or a misleading success.

## Backup and recovery

Align the procedure with the database you actually run.

**SQLite**

1. Stop the service (or accept a snapshot-consistent copy).
2. Copy the database file and the entire `UPLOAD_DIR` together so records and
   files stay consistent.
3. Restore by placing both back and starting the service.

**Postgres (Supabase / Neon / Render)**

1. Use the provider's automated backups or point-in-time recovery.
2. Restore into a **new** database/project and repoint `DATABASE_URL`; never drop
   or recreate the production database in place.
3. Uploaded files are not part of database backups — snapshot `UPLOAD_DIR` (or the
   object store bucket) as well.

## Reporting and health

`GET /api/v1/health` includes a `storage` block with:

- `database`: `scheme`, `label` (redacted, e.g. `sqlite:inkloom.db` or
  `postgres:host/database`), `durable`, `driver_available`, `driver`, and a
  `note`; plus a top-level `database_error` when connectivity fails.
- `uploads`: `mode` (`server-filesystem`), `durable`, `writable`, and a `note`.

No connection string, password, or API key is ever returned by the health
endpoint, written to logs, or sent to the browser.