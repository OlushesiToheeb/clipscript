# Clipscript

Paste a link to any **YouTube video/Short, TikTok, or Instagram Reel** — get the full
transcript of everything said in it.

## How it works

```
Next.js (4601)  →  NestJS API (4600)  →  yt-dlp (bundled binary)
                          │                    │
                     PostgreSQL 17        1. YouTube captions (free, no key)
                     (Docker, 5544)       2. Otherwise: audio → OpenAI transcription
```

- **YouTube with captions** → transcript comes from the captions. Free, needs no API key.
- **TikTok / Instagram / YouTube without captions** → the audio is downloaded and
  transcribed with OpenAI (`gpt-4o-mini-transcribe` by default). Needs `OPENAI_API_KEY`.
- Every transcript is cached in Postgres — pasting the same link twice returns instantly.

## First-time setup

```bash
npm run setup       # downloads yt-dlp if missing, creates .env files, installs deps
```

Then add your OpenAI key to `backend/.env` (only needed for the audio-transcription path):

```
OPENAI_API_KEY=sk-...
```

## Run it

```bash
npm run db:up            # Postgres in Docker (port 5544)
npm run dev:backend      # API on http://localhost:4600
npm run dev:frontend     # UI on  http://localhost:4601
```

Open http://localhost:4601, paste a link, done.

## Notes & limits

- **Instagram**: public Reels usually work anonymously; if Instagram demands a login,
  set `IG_COOKIES_BROWSER=chrome` in `backend/.env` (yt-dlp reads your logged-in
  browser cookies — close Chrome first if it complains about a locked cookie store).
- **Long videos**: the audio-transcription path is capped at `MAX_AUDIO_MINUTES=30`
  (raise it in `backend/.env`; OpenAI charges per audio minute).
- **Non-English YouTube**: caption extraction looks for English tracks; anything else
  falls through to OpenAI transcription, which auto-detects the language.
- `bin/yt-dlp` is git-ignored and re-downloaded by `npm run setup`. If extraction ever
  starts failing (platforms change their sites), refresh it:
  `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o bin/yt-dlp && chmod +x bin/yt-dlp`.

## API (backend, port 4600)

| Method | Path              | Body            | Returns                          |
|--------|-------------------|-----------------|----------------------------------|
| POST   | `/transcripts`    | `{ "url": "…" }` | transcript row (processing/cached) |
| GET    | `/transcripts`    | —               | latest 50, newest first          |
| GET    | `/transcripts/:id`| —               | one row (poll while `processing`)|
| DELETE | `/transcripts/:id`| —               | 204                              |

See `CONTRACT.md` for the full contract.
