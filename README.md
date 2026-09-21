# Listen To Your Heart

A private, browser-native music player. Search, queue, favorite and organise music
into playlists — all stored in your own browser, with no account and no tracking.

Built with Next.js 16 (App Router), React 19, Zustand, Dexie (IndexedDB) and
Tailwind CSS 4.

## Features

**Playback**

- A Watch button that finds the artist's real music video — not the
  still-image Art Track — and opens the watch layout without interrupting
  what is already playing
- Full controls on the video itself: play, skip, scrub, volume, speed,
  picture-in-picture and fullscreen, fading away while you watch
- Watch layout: video beside the queue, so the queue stays reachable
- A dockable video stage that follows you between pages
- When a video rendition cannot be extracted, the audio one plays instead of
  the track being skipped
- Playback speed from 0.5x to 2x, sleep timer, shuffle and repeat in the
  player overflow menu
- Gapless queue with working shuffle and repeat (off / all / one)
- Drag-to-reorder queue, play next, add to queue
- Scrub bar with buffered-ahead indicator and hover time preview
- Autoplay radio: the queue tops itself up with related tracks before it runs dry
- OS media keys, lock-screen artwork and seek via the Media Session API
- HLS support for live streams

**Library** (all local to your browser)

- Playlists: create, rename, describe, reorder by drag, delete
- Favorites, with one-tap hearting from anywhere
- Listening history with play counts, plus an "On repeat" shelf
- JSON export and import, so a library can move between browsers
- Optional Google sign-in: with a database configured, playlists, favorites and
  history follow an account between devices (see below)

**Interface**

- Responsive down to phone width: sidebar on desktop, tab bar and a full-screen
  now-playing sheet on mobile
- Light and dark themes, applied before first paint (no flash)
- Search split into songs and videos, with a combined view and a tab for each
- Search with provider suggestions and locally stored recent searches
- Keyboard shortcuts throughout — press <kbd>?</kbd> for the full list
- Skeleton loaders, toasts with undo, and empty states that say what to do next

## Getting started

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
npm run dev
```

Then open http://localhost:3000.

## Configuration

Search and stream resolution go through public [Piped](https://github.com/TeamPiped/Piped)
and [Invidious](https://invidious.io) API instances. Configure them in `.env.local`:

```bash
PIPED_INSTANCES=https://api.piped.private.coffee,https://pipedapi.ducks.party
INVIDIOUS_INSTANCES=https://invidious.darkness.services,https://invidious.f5.si
```

Both are comma-separated lists of **API** origins (not web frontends — a
frontend answers with HTML and is rejected). They are tried in order, and an
instance that fails is skipped for 30 seconds before being retried.

### A caveat worth knowing before you deploy

Public instances are unreliable by nature, and the two halves fail
independently:

- **Search and suggestions** work well across most live instances.
- **Stream resolution** is the scarce capability. Two sweeps of ~25-30 public
  instances each found exactly **one** that still extracts streams, and it fails
  transiently — observed returning HTTP 400 and then succeeding minutes later,
  unchanged. `INVIDIOUS_INSTANCES` is the setting most likely to need changing.

Because of that, instances are queried **hedged** rather than one after another:
the first starts immediately and each other joins 2s later, first usable answer
wins and cancels the rest, with a hard deadline over the whole thing. Where only
one instance is configured it is hedged against itself, since a second staggered
attempt is the only redundancy available. This replaced sequential per-instance
timeouts whose worst case was a full minute of waiting before reporting failure.

Streams are requested with Invidious' `local=true`, which serves media from the
instance's own domain. This matters more than it sounds: direct upstream URLs
are refused with 403 for most uploads — including nearly every auto-generated
"– Topic" upload, which is the bulk of what a music search returns — because the
upstream only honours them for the session that extracted them. Proxied through
the instance, the same track plays.

If playback fails, check `/api/health` first: it probes every configured
instance from wherever the app is deployed and reports per-instance status.
Public instances often allow home IPs while throttling datacenter ranges, so a
working local setup does not guarantee a working deployment. Current instance
lists live at [api.invidious.io/instances.json](https://api.invidious.io/instances.json).
Self-hosting remains the only way to make playback fully dependable.

Video is served as a 360p muxed rendition. Higher resolutions exist only as
adaptive video-only tracks, which would need Media Source Extensions to be
stitched to a separate audio stream — more machinery than a music player
warrants.

A music search mostly returns YouTube Art Tracks: the auto-generated
"<artist> - Topic" uploads, which are a single still image plus audio (their
"1080p" track runs at roughly 90 kbps, against ~9,800 kbps for a real video).
They are ideal for listening and useless for watching, so video mode looks up
the artist's actual upload and switches to it, keeping your position.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm run check:sync` | Runs the sync route SQL against a real Postgres (PGlite) |

`next typegen` must run before `tsc` because `typedRoutes` is enabled: route
types are generated into `.next/types`.

## Accounts and cross-device sync (optional)

Without any of this configured the app is unchanged: the library lives in the
browser, there is no sign-in control, and nothing leaves the device. Adding a
database and Google credentials turns on **Sign in with Google**, and each
account's playlists, favorites and listening history follow them to any device
they sign in on.

The local database stays the source of truth for everything on screen. The
cloud copy is a replica that is merged in the background, so the app keeps
working offline and a failed sync never blocks playback.

### What to create

1. **A Postgres database.** [Neon](https://neon.com)'s free tier is the easiest
   fit on Vercel: it is in the Vercel marketplace, injects the connection
   string for you, and scales to zero without the project going to sleep. Copy
   the **pooled** connection string into `DATABASE_URL`.
2. **A Google OAuth client.** Google Cloud console → *APIs & Services* →
   *Credentials* → *Create credentials* → *OAuth client ID* → *Web application*.
   Add an authorised redirect URI of
   `https://YOUR-DOMAIN/api/auth/callback/google` (and
   `http://localhost:3000/api/auth/callback/google` for local work). Copy the
   two values into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. **A session secret.** `openssl rand -base64 32` into `BETTER_AUTH_SECRET`.

Set all four under **Project → Settings → Environment Variables** and redeploy.
No migration step is needed: the tables are created on the first request that
needs them.

`GET /api/accounts` reports whether accounts are on and, if not, exactly which
variables are still missing.

### How conflicts resolve

Every saved row carries the time it last changed, and the newest version wins.
Deletes are recorded as tombstones rather than as absent rows, so removing a
favorite on your phone removes it on your laptop instead of being restored by
the next sync. `npm run check:sync` runs those rules against a real Postgres.

Signing a *second* account into a browser that already has a library pulls that
account's data down but does not upload what was already there — otherwise a
friend signing in on your machine would quietly absorb your playlists.

## Deploying to Vercel

```bash
npm i -g vercel
vercel          # link and deploy a preview
vercel --prod   # promote to production
```

Set `PIPED_INSTANCES` and `INVIDIOUS_INSTANCES` under **Project → Settings →
Environment Variables**, then redeploy so the build picks them up.

Audio bytes are **not** proxied through the deployment: the API routes return a
resolved stream URL and the browser fetches audio directly from it. That keeps
bandwidth off your hosting bill, and it is why resolved URLs are returned with
`Cache-Control: no-store` — they are short-lived and signed.

## Data and privacy

Everything personal — playlists, favorites, history, searches, theme — lives in
IndexedDB and `localStorage` in your browser. None of it reaches the server.

The practical consequence is that your library is **per browser and per device**,
and clearing site data erases it. Use **Library → Export** for a backup you can
import elsewhere.

## Project layout

```
src/
  app/              Routes, API handlers, error and loading boundaries
  components/
    player/         Player bar, seek bar, queue, now-playing, video stage, video controls
    shell/          Sidebar, top bar, search box, mobile nav
    track/          Track rows, cards, collection headers, dialogs
    ui/             Artwork, menu, modal, toasts, skeletons, empty states
  hooks/            Audio controller, keyboard shortcuts, live DB queries
  lib/
    audio/engine.ts Singleton that owns the media element and hls.js
    auth/           Better Auth server config and browser client (optional)
    db/             Dexie schema, library reads/writes, the Postgres pool
    providers/      Provider clients, normalisation and failover
    sync/           Wire format, change notifications, the browser sync engine
  store/            Zustand stores for the player and UI
  types/            Shared domain types
```

Two pieces are worth knowing about before changing things:

- **`lib/audio/engine.ts`** owns the media element outside React. React effects
  are a poor fit for media elements: routing `currentTime` through state makes
  seeking fight `timeupdate`, and a re-run can tear down a stream mid-play. The
  store subscribes to engine events; every command is an explicit method call.
  The element is a `<video>` even in audio mode, so switching modes never has to
  rebuild the player. `components/player/VideoStage.tsx` adopts it once and
  repositions it with CSS — re-parenting a playing element drops its buffer.
- **`store/playerStore.ts`** addresses the queue by **index**, not track id, with
  a separate `order` array for shuffle. The same track can legitimately appear
  in a queue twice, which id-based lookup silently breaks.

## License

MIT
