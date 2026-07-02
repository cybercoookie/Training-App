# PR Adventures 🏝️

Discover hikes, beaches, waterfalls, caves, bio bays, and outdoor adventures across
Puerto Rico. Interactive map, GPS directions, wishlist, and a photo journal of your
visits. Bilingual (Español/English). Runs in any browser as an installable PWA and
wraps to Android/iOS with Capacitor.

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for the full design, development, and
deployment plan.

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS 4 + React Router
- **Map:** MapLibre GL with free OpenFreeMap vector tiles (no API key)
- **Backend:** Supabase — Postgres (RLS), Auth, Storage (project `PR Adventures`)
- **PWA:** vite-plugin-pwa (installable, offline shell, cached map tiles)
- **Native:** Capacitor (config in `capacitor.config.json`)
- **Hosting:** Netlify — https://pr-adventures.netlify.app

## Local development

```bash
cd pr-adventures
npm install
cp .env.example .env.local   # fill in the anon/publishable key
npm run dev                  # http://localhost:5173
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` come from the Supabase dashboard
(PR Adventures → Project Settings → API). The anon key is safe for clients; all
data access is enforced by Row Level Security.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | production build to `dist/` (includes PWA service worker) |
| `npm run preview` | serve the production build locally |
| `npm run lint` | ESLint |
| `npm run cap:android` / `cap:ios` | build + open native project (after `npx cap add android|ios`) |

## Deployment

Netlify builds from Git: production from `main`, every other branch gets its own
preview URL (`<branch>--pr-adventures.netlify.app`) — that's the dev environment.
Build settings live in `netlify.toml`; env vars are set on the Netlify site.

## Database

Schema is managed through Supabase migrations (`initial_schema`,
`seed_curated_places`, `lock_down_trigger_function`). Tables: `places` (public
read), `profiles`, `wishlist`, `journal_entries`, `journal_photos` (owner-only via
RLS). Journal photos live in the private `journal-photos` storage bucket under
`<user_id>/…` and are served with signed URLs.

> **Note:** seeded place coordinates are approximate — verify before public launch
> (tracked in PROJECT_PLAN.md Phase 1).
