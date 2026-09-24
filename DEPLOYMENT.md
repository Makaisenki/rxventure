# Public deployment guide

## Accounts and ownership

1. The named operations owner creates the Cloudflare and Supabase accounts and stores recovery methods and the shared administrator password in the organisation password manager.
2. Create a Supabase project, then create the shared administrator email/password user in **Authentication → Users**.
3. Run `supabase/migrations/20260924_public_game.sql` in the Supabase SQL Editor.
4. Copy `.env.example` to `.env.local` for local builds. Add the corresponding server values from `.dev.vars.example` as Cloudflare Pages production secrets; never commit either real secret file.

## Cloudflare Pages

1. Push this project to a GitHub repository.
2. In Cloudflare Pages, create a project from that repository.
3. Set build command to `npm ci && npm run build` and build output directory to `dist`.
4. Pages automatically deploys files in `functions/` as API routes.
5. Add the environment variables shown in `.env.example` and `.dev.vars.example`. `SUPABASE_SERVICE_ROLE_KEY` must be marked secret and must never be exposed as a Vite variable.
6. Deploy. Open the generated `pages.dev` URL, sign in to Administration, and upload the bundled workbook once to activate the shared question bank.

## Operations

- Add Cloudflare rate-limiting rules for `POST /api/leaderboard` (recommended: five submissions per minute per IP) and turn on bot protection.
- Configure an external uptime monitor for the Pages URL and alert the operations owner.
- Enable Supabase database backups appropriate to the selected plan. Export the leaderboard periodically if retention is important.
- Add a custom domain later in Cloudflare Pages; HTTPS certificates are managed automatically after DNS validation.

## Recovery and rollback

- Roll back a release from the Cloudflare Pages deployment history.
- Restore question content through Administration using the bundled workbook or a validated replacement.
- Rotate the administrator password and Cloudflare/Supabase credentials if access is lost or suspected compromised.
