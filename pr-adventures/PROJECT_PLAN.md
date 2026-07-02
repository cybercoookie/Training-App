# PR Adventures — Project Plan

**Aventuras de Puerto Rico** — an app to discover hikes, beaches, waterfalls, caves,
bio bays, and outdoor adventures across Puerto Rico on an interactive map; navigate
to them by GPS; keep a wishlist; and journal visits with photos.

**Platforms:** browsers (installable PWA) + Android and iOS (Capacitor wrappers of
the same codebase).

---

## 1. Key decisions (agreed 2026-07-02)

| Decision | Choice | Why |
|---|---|---|
| Delivery | PWA + Capacitor | One React codebase serves web, Android, and iOS; matches the existing js-running-club stack |
| Maps | MapLibre GL + OpenFreeMap tiles | Free, no API key or billing risk; great vector maps |
| Turn-by-turn GPS | Hand off to Google/Apple Maps | Native apps do navigation best; universal URLs open the right app per platform |
| Place data | Curated dataset in our database | Full control, zero API cost; 27 places seeded, grows over time |
| Language | Bilingual Spanish/English | UI strings and place descriptions in both, with a persistent toggle |
| Backend | Supabase (`PR Adventures`, `ysciaskzwblmyjvfnlhv`) | Postgres + Auth + Storage in one free service |
| Hosting | Netlify (`pr-adventures.netlify.app`) | Free CI deploys from Git with branch previews as the dev environment |

## 2. Design

### 2.1 User experience

Five core flows, all mobile-first:

1. **Explore** — Full-screen island map with category filter chips (hikes, beaches,
   waterfalls, caves, bio bays, adventures, landmarks). Tapping a marker opens a
   bottom sheet with summary, wishlist heart, Directions, and Details.
2. **Navigate** — "Directions / Cómo llegar" reads the user's GPS position and opens
   turn-by-turn navigation from where they are to the place.
3. **Wishlist** — Heart any place; the Wishlist tab lists saved places for trip planning.
4. **Journal** — Log a visit with date, star rating, notes, and photos (camera or
   gallery). The Journal tab is a reverse-chronological adventure log.
5. **Profile** — Language toggle (ES/EN) and account management.

Navigation is a four-tab bottom bar (Map, Wishlist, Journal, Profile). Wishlist and
Journal require sign-in; the map is open to everyone.

### 2.2 Visual design

Tropical, sunny palette: teal primary (`#0d9488`), sky/sea blues, warm orange accents.
Category-colored emoji map pins. Large touch targets, rounded cards, minimal chrome —
the map is the hero.

### 2.3 Data model (Supabase Postgres)

```
places            catalog (public read): slug, name, category, municipality,
                  lat/lng, difficulty, description_en, description_es, tags[]
profiles          1:1 with auth.users, created by trigger on signup
wishlist          (user_id, place_id) join table
journal_entries   user_id, place_id, visited_on, notes, rating 1–5
journal_photos    entry_id, storage_path → Storage bucket `journal-photos`
```

**Security:** Row Level Security on every table — places are world-readable,
everything else is owner-only. Photos live in a private bucket under
`<user_id>/<entry_id>/…`, enforced by storage policies and served via signed URLs.

### 2.4 Architecture

```
React 19 SPA (Vite, Tailwind 4, React Router)
 ├─ MapLibre GL → OpenFreeMap vector tiles (free, keyless)
 ├─ supabase-js → Postgres (RLS) + Auth (email/password) + Storage (photos)
 ├─ Geolocation API → distance display + directions origin
 ├─ Google Maps universal URLs → native turn-by-turn navigation
 └─ vite-plugin-pwa → installable app, offline shell, cached map tiles
      └─ Capacitor → Android (Play Store) & iOS (App Store) builds
```

## 3. Development plan

### Phase 0 — Foundations ✅ (this session)
- [x] Supabase project `PR Adventures` created (Bettermark paused to free the slot)
- [x] Schema, RLS policies, storage bucket, signup trigger (security-advisor clean)
- [x] 27 curated places seeded with bilingual descriptions
- [x] App scaffolded: map + filters, place details, GPS directions handoff, auth,
      wishlist, journal with photo upload, ES/EN toggle, PWA manifest + service worker
- [x] Netlify site `pr-adventures` with Supabase env vars configured

### Phase 1 — MVP polish (1–2 weeks)
- Verify/correct all place coordinates in the field or against official sources
  (seed coordinates are approximate)
- Real photography per place (hero images in a public storage bucket)
- Search by name/municipality; sort by distance from user
- Place detail extras: hours/fees where relevant, hazard notes, best-time tips
- Error/empty/loading states audit; accessibility pass (labels, contrast, focus)

### Phase 2 — Native apps (1–2 weeks, needs Apple/Google developer accounts)
- `npx cap add android && npx cap add ios` (config already in `capacitor.config.json`)
- Capacitor Geolocation + Camera plugins for smoother native permission flows
- App icons, splash screens, store listings (bilingual), privacy policy page
- Internal testing (Play Console internal track / TestFlight) → production release
- Costs: Google Play $25 one-time, Apple Developer $99/year; iOS builds need a Mac
  (or a cloud build service such as Ionic Appflow)

### Phase 3 — Offline & quality (ongoing)
- Offline place catalog (cache Supabase reads; queue journal writes made offline)
- Code-split MapLibre to shrink the initial bundle (currently ~407 kB gzipped)
- Test suite: Vitest unit tests + Playwright end-to-end flows in CI
- Image compression on upload (resize client-side before storing)

### Phase 4 — Growth (later, by demand)
- Social: public journals, following friends, community ratings/reviews
- User-submitted places with moderation queue
- Optional Google Places enrichment (hours, live busyness)
- Trail difficulty/length data, GPX track overlays on the map

## 4. Deployment plan

### 4.1 Environments

| Environment | Frontend | Database | Purpose |
|---|---|---|---|
| **Local dev** | `npm run dev` (localhost:5173) | `PR Adventures` via `.env.local` | day-to-day coding |
| **Dev / preview** | Netlify branch deploys & PR previews (`<branch>--pr-adventures.netlify.app`) | same project | review features before merge |
| **Production** | `main` → https://pr-adventures.netlify.app | `PR Adventures` | end users |

Dev and prod currently share the one free-tier database; RLS keeps user data safe
regardless. When traffic justifies it, upgrade to Supabase Pro and split with
database branches (or a second project) — the migration history in this repo
replays cleanly onto any new project.

### 4.2 One-time manual step (owner)

Link the repo so deploys run on every push — Netlify dashboard →
**pr-adventures → Configuration → Build & deploy → Link repository**:
`cybercoookie/Training-App`, base directory `pr-adventures`, production branch
`main`, branch deploys **All**. Build command and publish dir come from
`netlify.toml`; `VITE_SUPABASE_*` env vars are already set on the site.

### 4.3 Release flow

1. Feature branch → push → Netlify branch deploy for review
2. PR → merge to `main` → automatic production deploy (PWA users update on next visit)
3. Native releases (Phase 2): `npm run cap:sync`, then build/upload via Android
   Studio & Xcode; app-store review takes ~1–3 days

### 4.4 Operations

- **Monitoring:** Netlify deploy logs/analytics; Supabase logs + weekly
  `get_advisors` security/performance checks
- **Backups:** Supabase daily backups (7-day retention on free tier); schema is
  reproducible from migrations in this repo
- **Cost baseline:** $0/month (Netlify free, Supabase free, OpenFreeMap free);
  first real costs are the app-store accounts in Phase 2

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Seed coordinates are approximate | Phase 1 verification pass before public launch |
| Free-tier limits (500 MB DB, 1 GB storage, project pauses after 1 week idle) | Client-side image resize; upgrade to Pro when usage grows; keep-alive ping |
| Only 2 free Supabase projects (Bettermark now paused) | Unpause requires a plan change or pausing another project — revisit at Pro upgrade |
| Hurricane/closure info goes stale | `tags` field for advisories now; admin editing UI in Phase 4 |
| App-store review friction for a webview app | Capacitor apps pass review when they feel native — Phase 2 includes native plugins, splash, and offline support |
