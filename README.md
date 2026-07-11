# Clipscript

**Paste a link to any YouTube video/Short, TikTok, or Instagram Reel — get the full transcript of everything said in it.**

Captions when the video already has them (free, instant), a clean audio transcription when it doesn't. Every transcript you make is kept, searchable in your history, and never fetched twice.

> 📊 **Prefer a visual tour?** Open [`architecture.html`](./architecture.html) in a browser for an illustrated, end-to-end walkthrough of the whole system.

---

## How it works

One paste kicks off a chain that runs on its own. The link is validated, the video is reached, and Clipscript takes the fastest route to the words — captions if they exist, audio transcription if they don't — rejoining at the same place no matter which path it took.

```mermaid
flowchart TD
    A[Paste a link] --> B["Validate & normalize the URL"]
    B --> C{Already transcribed?}
    C -->|yes| Z[Return the cached transcript instantly]
    C -->|no| D["Fetch title + captions<br/>single yt-dlp call"]
    D --> E{Captions available?}
    E -->|YouTube · yes| F["Read the captions<br/>free · ~40s"]
    E -->|no captions| G["Download the audio<br/>yt-dlp to ffmpeg to mp3"]
    G --> H["Transcribe the speech<br/>OpenAI · gpt-4o-mini-transcribe"]
    F --> S[(Save to PostgreSQL)]
    H --> S
    S --> R[Read it on the page]
```

**The two paths to a transcript:**

- **YouTube with captions → straight from the source.** The transcript comes from the caption track. Free, needs no API key, takes about 40 seconds.
- **TikTok / Instagram / caption-less YouTube → listen, then write it down.** The audio is downloaded, converted to mp3, and transcribed with OpenAI (`gpt-4o-mini-transcribe` by default). Needs an `OPENAI_API_KEY`; capped at 30 minutes of audio.

Processing is fire-and-forget: the API returns a `processing` row immediately and the page polls until it flips to `completed` or `failed`. If the server restarts mid-job, any interrupted row is recovered to `failed` on startup (with a clear "please try again" message) instead of spinning forever, and each external call has a hard timeout so a stalled download can't hang.

---

## Architecture

A Next.js page in the browser, a NestJS backend that runs the pipeline, one Postgres table, and the local tools it drives to reach each platform.

```mermaid
flowchart LR
    UI["Next.js page<br/>:4601"] -->|HTTP| API["NestJS API<br/>:4600"]
    API --> SVC["Transcripts service<br/>validate · dedupe · run pipeline"]
    SVC --> YT["Ytdlp service<br/>→ yt-dlp binary"]
    SVC --> TX["Transcription service<br/>→ OpenAI"]
    SVC <-->|Sequelize| DB[("PostgreSQL<br/>:5544")]
    YT --> PLAT["YouTube · TikTok · Instagram"]
    YT --> FF["ffmpeg"]
```

| Piece | Job |
|-------|-----|
| **Next.js page** | Paste box, live status, transcript, history. Talks to the backend over `fetch`. |
| **NestJS API** | Four routes (see [API](#api)); thin controller over the service. |
| **Transcripts service** | URL validation, dedupe/cache, and the async processing pipeline. |
| **Ytdlp service** | Wraps the bundled `yt-dlp` binary: metadata, captions, audio download. |
| **Transcription service** | Wraps OpenAI speech-to-text — the swappable piece. |
| **PostgreSQL** | Stores every transcript; doubles as the cache and the history feed. |

---

## What's stored (and where)

Clipscript has **no login**, so it's careful about what lives on the server versus your device.

- **The server is a public-content cache.** A transcript of a public video is public
  content — the same for everyone — so it's cached in one `transcripts` table (keyed by
  the normalized URL) and reused across requests. This saves time and OpenAI cost, and it
  holds no notion of *who* made it. Caching applies to **YouTube and TikTok** only;
  **Instagram is never served from the cache** (a reel may be private), so each Instagram
  request re-processes and is only reachable with its own unguessable token.
- **Your history lives in your browser** (localStorage), on your device alone. There's no
  shared "everyone's transcripts" list, and deleting a history item just removes it
  locally. That's how the no-login experience stays private.
- **Reads use an unguessable token**, never a sequential id — so nobody can guess
  `1, 2, 3, …` and read transcripts they didn't create.

Clipscript keeps **no audio or video files** — those are downloaded to a temp folder and
deleted immediately after each run. Only text and metadata are stored, a few KB per video.
The normalized URL collapses `youtu.be/x`, `/shorts/x`, and `watch?v=x&…tracking…` to one
cache entry, so a public video is fetched and transcribed only **once**.

| Field | Type | What it holds |
|-------|------|---------------|
| `url` | text | Normalized link — the cache key |
| `platform` | string | `youtube` · `tiktok` · `instagram` |
| `title` | text | Filled in once the video is reached |
| `status` | string | `processing` → `completed` \| `failed` |
| `source` | string | `captions` or `whisper` (audio) — how the text was made |
| `text` | text | The transcript itself |
| `error` | text | A plain-English reason when something fails |
| `durationSeconds` | integer | Length of the video |
| `createdAt` / `updatedAt` | timestamp | Bookkeeping |

---

## Getting started

### Prerequisites

- **Node.js 20+** and **npm**
- **Docker** (for the Postgres container)
- **macOS** — the setup script downloads the macOS `yt-dlp` build; on Linux, install `yt-dlp` yourself and point `YTDLP_PATH` at it

### First-time setup

```bash
npm run setup       # downloads yt-dlp if missing, creates .env files, installs deps
```

Then add your OpenAI key to `backend/.env` (only needed for the audio-transcription path — captioned YouTube works without it):

```
OPENAI_API_KEY=sk-...
```

### Run it

Three processes, three terminals (or background them):

```bash
npm run db:up            # Postgres in Docker (port 5544)
npm run dev:backend      # API on http://localhost:4600
npm run dev:frontend     # UI  on http://localhost:4601
```

Open **http://localhost:4601**, paste a link, done. Stop the database later with `npm run db:down`.

---

## Configuration

All backend settings live in `backend/.env` (created from `backend/.env.example` by `npm run setup`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `TOKEN_SECRET` | _(dev default)_ | Signs transcript tokens. Set a long random string before deploying. |
| `OPENAI_API_KEY` | _(empty)_ | Required for TikTok / Instagram / uncaptioned YouTube. Leave empty to run captions-only. |
| `TRANSCRIBE_MODEL` | `gpt-4o-mini-transcribe` | OpenAI transcription model. |
| `MAX_AUDIO_MINUTES` | `30` | Cap on the audio-transcription path (OpenAI charges per audio minute). |
| `IG_COOKIES_BROWSER` | _(empty)_ | e.g. `chrome` — lets yt-dlp use your logged-in session for private Instagram Reels. |
| `YTDLP_PATH` | `<root>/bin/yt-dlp` | Override the yt-dlp binary location. |
| `OPENAI_TIMEOUT_MS` | `240000` | Hard timeout on the OpenAI call. |
| `YTDLP_TIMEOUT_MS` | `240000` | Hard timeout on each yt-dlp call. |
| `PORT` | `4600` | Backend port. |
| `DATABASE_URL` | `postgres://clipscript:clipscript@localhost:5544/clipscript` | Postgres connection. |

The frontend reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4600`) from `frontend/.env.local`.

---

## API

Backend on port `4600`. Plain JSON, no envelope. Each transcript's only public handle is
a signed `token` (never a raw id).

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/transcripts` | `{ "url": "…" }` | The transcript with its `token` — `201` if new (now `processing`), `200` if served from cache (YouTube/TikTok) |
| `GET` | `/transcripts/:token` | — | One transcript — poll this while `status` is `processing`. Invalid/forged token → `404` |

There's deliberately **no list endpoint and no server-side delete** — history lives in the
browser, so one visitor can't see or remove another's transcripts. See [`CONTRACT.md`](./CONTRACT.md) for the full contract.

---

## Notes & troubleshooting

- **Instagram** — public Reels sometimes work anonymously, but Instagram often demands a login. Set `IG_COOKIES_BROWSER=chrome` in `backend/.env` so yt-dlp uses your logged-in browser cookies (close Chrome first if it complains about a locked cookie store). Instagram is inherently slower than YouTube — no captions means it always takes the download-and-transcribe path.
- **A job stuck on "processing"** — shouldn't happen anymore. Interrupted jobs are auto-recovered to `failed` on the next backend start, and each external call times out. Just paste the link again.
- **Long videos** — the audio path is capped at `MAX_AUDIO_MINUTES` (30). Raise it in `backend/.env` if you need to.
- **Non-English YouTube** — caption extraction looks for English tracks; anything else falls through to OpenAI transcription, which auto-detects the language.
- **Extraction suddenly failing** — platforms change their sites, so `yt-dlp` goes stale. `bin/yt-dlp` is git-ignored and re-downloaded by `npm run setup`; to refresh manually:
  ```bash
  curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o bin/yt-dlp && chmod +x bin/yt-dlp
  ```

---

## Project layout

```
clipscript/
├── backend/            # NestJS API — the pipeline, yt-dlp + OpenAI wrappers, Sequelize model
├── frontend/           # Next.js page — paste, poll, read, history
├── bin/yt-dlp          # bundled binary (git-ignored, re-downloaded by setup)
├── docker-compose.yml  # PostgreSQL 17
├── architecture.html   # visual, self-contained walkthrough of the system
├── ARCHITECTURE.md     # the same, as Mermaid diagrams
└── CONTRACT.md         # the API + processing contract
```

## Tech stack

NestJS · Next.js (App Router) · React · Tailwind CSS · Sequelize · PostgreSQL 17 · yt-dlp · ffmpeg · OpenAI
