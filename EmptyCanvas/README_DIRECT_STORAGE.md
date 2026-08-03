# Direct Supabase Storage uploads

This stage moves high-frequency attachment bytes away from Express/PM2.

## Flow

1. The browser requests a short-lived upload ticket from `/api/storage/upload-ticket`.
2. The browser uploads the raw `File` directly to the signed Supabase Storage URL.
3. `/api/storage/upload-complete` verifies the stored object size before returning a protected application link.
4. Opening `/api/storage/file/:reference` checks the current login and page access, then redirects to a short-lived Supabase URL. Node does not proxy the file body.

## Migrated areas

- Task Management attachments and work files — 10 MB per file.
- B2C customer files — 10 MB per file.
- KPI evidence — 15 MB per file.

The previous base64 upload endpoints remain as automatic fallbacks when direct Storage is unavailable.

## Required configuration

Existing Supabase settings remain required:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=operations-files
SESSION_SECRET=...
```

`SESSION_SECRET` is already required by the PM2/Redis session stage. You may optionally use a separate stable secret:

```env
STORAGE_LINK_SECRET=use-a-long-random-secret
```

Do not rotate `STORAGE_LINK_SECRET` while protected links stored in database records are still in use, because old links are HMAC-signed with that value.

## Diagnostics

After login:

```text
/api/storage/direct-diagnostics
```

This returns ticket, verification, redirect, and signed-URL cache counters without exposing bucket paths, tokens, or secrets.
