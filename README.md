# Listen To Your Heart

A private, browser-native music player. Search, queue, favorite and organise music
into playlists — all stored in your own browser, with no account and no tracking.

Built with Next.js 16 (App Router), React 19, Zustand, Dexie (IndexedDB) and
Tailwind CSS 4.

## Features

**Playback**

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

**Interface**

- Responsive down to phone width: sidebar on desktop, tab bar and a full-screen
  now-playing sheet on mobile
- Light and dark themes, applied before first paint (no flash)
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
INVIDIOUS_INSTANCES=https://invidious.f5.si
```

Both are comma-separated lists of **API** origins (not web frontends — a
frontend answers with HTML and is rejected). They are tried in order, and an
instance that fails is skipped for 30 seconds before being retried.

### A caveat worth knowing before you deploy

Public instances are unreliable by nature, and the two halves fail
independently:

- **Search and suggestions** work well across most live instances.
- **Stream resolution** is regularly blocked by the upstream source, which
  rate-limits anonymous extraction from known instance IPs. When every
  configured instance is blocked, search still returns results but pressing play
  reports that no instance could resolve audio.

If playback fails, the instances are the thing to change — not the app. Current
lists live at [api.invidious.io/instances.json](https://api.invidious.io/instances.json)
and in the Piped project's documentation. Self-hosting an instance is the only
way to make playback genuinely dependable.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |

`next typegen` must run before `tsc` because `typedRoutes` is enabled: route
types are generated into `.next/types`.

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
    player/         Player bar, seek bar, queue panel, now-playing sheet
    shell/          Sidebar, top bar, search box, mobile nav
    track/          Track rows, cards, collection headers, dialogs
    ui/             Artwork, menu, modal, toasts, skeletons, empty states
  hooks/            Audio controller, keyboard shortcuts, live DB queries
  lib/
    audio/engine.ts Singleton that owns the <audio> element and hls.js
    db/             Dexie schema and all library reads/writes
    providers/      Provider clients, normalisation and failover
  store/            Zustand stores for the player and UI
  types/            Shared domain types
```

Two pieces are worth knowing about before changing things:

- **`lib/audio/engine.ts`** owns the media element outside React. React effects
  are a poor fit for `<audio>`: routing `currentTime` through state makes
  seeking fight `timeupdate`, and a re-run can tear down a stream mid-play. The
  store subscribes to engine events; every command is an explicit method call.
- **`store/playerStore.ts`** addresses the queue by **index**, not track id, with
  a separate `order` array for shuffle. The same track can legitimately appear
  in a queue twice, which id-based lookup silently breaks.

## License

MIT
