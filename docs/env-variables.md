# Environment Variables

This document lists every environment variable the Knockouts.in application reads at runtime, with its purpose, accepted values, default behaviour, and where it must be configured on each deployment target.

The app reads variables via `process.env.*`. Local development uses `.env` at the repo root; Railway reads from the service's **Variables** tab.

---

## Core infrastructure

### `DATABASE_URL`

- **Required.** No default — the app will fail to start without it.
- PostgreSQL connection string used by `src/lib/db.ts`.
- Example: `postgresql://user:password@host:5432/dbname`
- On Railway: provided automatically by the Postgres plugin. Reference it with `${{ Postgres.DATABASE_URL }}` in the web service variables if needed.

### `NODE_ENV` *(managed by the platform)*

- Set automatically by Next.js / Railway. Do not override manually.
- Used in `src/instrumentation.ts` to enable Node-runtime hooks in production.

### `NEXT_RUNTIME` *(managed by Next.js)*

- Next.js sets this internally (`"nodejs"` or `"edge"`). Do not set it yourself.

---

## Authentication (NextAuth + Google OAuth)

### `AUTH_SECRET`

- **Required.** Minimum 32 characters.
- Signs NextAuth session cookies and doubles as the shared secret for internal revalidate requests (`src/app/api/internal/revalidate/route.ts`).
- Generate locally with `npx auth secret`.
- On Railway: set to the same value across all replicas. Rotating it signs everyone out.

### `AUTH_URL`

- **Required in production.**
- Canonical base URL of the app. Used by NextAuth to build OAuth callback URLs.
- Local: `http://localhost:3000`
- Railway: your production domain, e.g. `https://knockouts.in` (no trailing slash).

### `GOOGLE_CLIENT_ID`

- **Required.** From Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
- Consumed in `src/lib/auth.ts`.

### `GOOGLE_CLIENT_SECRET`

- **Required.** Paired with `GOOGLE_CLIENT_ID`.
- Never commit to git. On Railway keep it marked as a **secret** variable.

---

## AI predictions (Claude API)

### `ANTHROPIC_API_KEY`

- **Optional.** When missing, all AI generation is silently skipped; cached summaries are still served.
- Used by `src/engine/scenario-summary-ai.ts`, `src/engine/best-third-summary-ai.ts`, and the pre-generation helpers in `src/lib/probability-cache.ts`.
- Starts with `sk-ant-api03-…`.

### `AI_PREDICTIONS_ENABLED`

- **Optional. Default: off.**
- Master kill-switch for Claude API generation. Sits *before* the DB-backed `ai_predictions` feature flag.
- Accepted truthy values (case-insensitive): `1`, `true`. Anything else (including missing) → off.
- When off: pregeneration helpers short-circuit and team page / best-third page only read from cache. Fresh Claude calls never happen.
- When on: the DB feature flag is then consulted; both must be enabled for generation to proceed.
- Read by `isAiGenerationEnabledByEnv()` in `src/lib/feature-flags.ts`.

---

## Email (Resend)

### `RESEND_API_KEY`

- **Optional.** When missing, outbound emails (tip-result notifications, feedback form) are skipped and a `missing` note appears in the logs.
- Consumed in `src/lib/tip-notifications.ts` and `src/app/api/feedback/route.ts`.

### `RESEND_FROM_EMAIL`

- **Optional.** Default: `Knockouts.in <onboarding@resend.dev>` (Resend's sandbox sender).
- Override with a verified custom-domain sender once DNS for Resend is configured.
- Format: `Display Name <address@domain>` or just `address@domain`.

### `FEEDBACK_NOTIFY_EMAIL`

- **Optional.** Where the feedback form forwards submissions.
- When missing, submissions are stored in the DB only (no email is sent).

---

## Cache purging (Cloudflare)

### `CF_ZONE_ID`

- **Optional.** Cloudflare zone ID of the `knockouts.in` domain.
- Required (together with `CF_API_TOKEN`) for `src/lib/cloudflare-purge.ts` to issue cache-purge requests after probability / AI recalcs.

### `CF_API_TOKEN`

- **Optional.** Cloudflare API token with the `Cache Purge` permission scoped to the zone above.
- When either Cloudflare variable is missing, the purge step is a silent no-op.

---

## Railway setup checklist

1. Open the Railway dashboard → project → web service → **Variables** tab.
2. Add each required variable (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
3. Add the optional ones you need (`ANTHROPIC_API_KEY`, `AI_PREDICTIONS_ENABLED`, `RESEND_*`, `CF_*`).
4. Mark secrets (`AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `CF_API_TOKEN`) as hidden.
5. Railway redeploys automatically when variables change. Verify in the build logs that the new value is picked up.

### CLI alternative

```
railway variables set AI_PREDICTIONS_ENABLED=true
railway variables set RESEND_API_KEY=re_xxx
```

Run from inside a linked project directory (`railway link` once).

---

## Local `.env` reference

Copy `.env.example` to `.env` and fill in values. The `.env` file is git-ignored. Changes require a dev-server restart to take effect.