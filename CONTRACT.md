# Clipscript — Build Contract

Paste a YouTube / TikTok / Instagram Reel link → get the full transcript (every word said in the video).

This file is the single source of truth for the API contract, env vars, and conventions.
Both services MUST follow it exactly.

## Topology

| Piece      | Tech                                   | Port | Path                |
|------------|----------------------------------------|------|---------------------|
| backend    | NestJS 11 + Sequelize (sequelize-typescript) | 4600 | `backend/`   |
| frontend   | Next.js (App Router, TS, Tailwind)     | 4601 | `frontend/`         |
| database   | PostgreSQL 17 (docker compose, root)   | 5544 | `docker-compose.yml`|

- Project root: `/Users/toheebolushesi/Documents/clipscript`
- Package manager: **npm** (no pnpm on this machine).
- `yt-dlp` standalone binary lives at `<root>/bin/yt-dlp` (already downloaded).
- ffmpeg comes from the `ffmpeg-static` npm package (backend dependency) — pass
  `--ffmpeg-location <dirname of ffmpeg-static path>` to yt-dlp when extracting audio.

## Environment variables

`backend/.env` (commit `.env.example`, git-ignore `.env`):

```
PORT=4600
DATABASE_URL=postgres://clipscript:clipscript@localhost:5544/clipscript
OPENAI_API_KEY=            # only needed for TikTok / Instagram / uncaptioned YouTube
TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
MAX_AUDIO_MINUTES=30
YTDLP_PATH=                # optional override; default <root>/bin/yt-dlp, then `yt-dlp` on PATH
IG_COOKIES_BROWSER=        # optional, e.g. "chrome" — passed as --cookies-from-browser for Instagram
```

`frontend/.env.local` (commit `.env.local.example`):

```
NEXT_PUBLIC_API_URL=http://localhost:4600
```

## API (plain JSON, no envelope)

### Transcript resource

```jsonc
{
  "id": 1,
  "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw",   // normalized URL
  "platform": "youtube",            // "youtube" | "tiktok" | "instagram"
  "title": "Me at the zoo",         // string | null
  "status": "completed",            // "processing" | "completed" | "failed"
  "source": "captions",             // "captions" | "whisper" | null
  "text": "All right, so here we are...",  // string | null
  "error": null,                    // string | null (friendly message when failed)
  "durationSeconds": 19,            // number | null
  "createdAt": "2026-07-09T...",
  "updatedAt": "2026-07-09T..."
}
```

### Endpoints

- `POST /transcripts` body `{ "url": "https://..." }`
  - 400 if the URL is not a recognizable YouTube / TikTok / Instagram video URL.
  - Normalize the URL first. If a transcript already exists for the normalized URL
    with status `completed` or `processing`, return that existing row (200) — no reprocessing.
  - Otherwise create a row with status `processing`, kick off processing
    **asynchronously** (fire-and-forget; do NOT block the request), return 201.
- `GET /transcripts` → array, newest first, limit 50.
- `GET /transcripts/:id` → single row or 404.
- `DELETE /transcripts/:id` → 204 (hard delete) or 404.

CORS: allow origin `http://localhost:4601`.

## Processing pipeline (backend)

1. **Metadata**: spawn `yt-dlp -J --no-warnings <url>` → parse JSON for `title`, `duration`.
   On failure → status `failed` with a friendly error (include a hint about
   `IG_COOKIES_BROWSER=chrome` if platform is instagram and stderr mentions login/auth/rate).
2. **YouTube captions first (free, no key)**: only for platform `youtube`:
   `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs "en.*,en,-live_chat" --sub-format json3 -P <tmpdir> -o "sub" <url>`
   then read any `*.json3` file in tmpdir and join `events[].segs[].utf8`,
   normalize whitespace. Non-empty → save `text`, `source: "captions"`, status `completed`.
3. **Whisper fallback** (TikTok, Instagram, YouTube without captions):
   - If `OPENAI_API_KEY` is empty → status `failed`, error:
     `"This video has no captions — transcribing its audio needs an OpenAI API key. Set OPENAI_API_KEY in backend/.env and retry."`
   - If duration > MAX_AUDIO_MINUTES → `failed` with a clear message.
   - Download audio: `yt-dlp -x --audio-format mp3 --audio-quality 7 --ffmpeg-location <dir> -P <tmpdir> -o "audio.%(ext)s" <url>`
   - Transcribe with the `openai` npm SDK: `client.audio.transcriptions.create({ model: TRANSCRIBE_MODEL, file: fs.createReadStream(mp3) })`
   - Save `text`, `source: "whisper"`, status `completed`.
4. Always clean up tmpdir (use `fs.mkdtemp` under `os.tmpdir()`).
5. If `IG_COOKIES_BROWSER` is set and platform is instagram, append
   `--cookies-from-browser <value>` to every yt-dlp invocation.
6. Store errors truncated to ≤500 chars; log the full stderr with Nest Logger.

## URL rules

- **Detect platform**: youtube (`youtube.com/watch`, `youtube.com/shorts/`, `youtu.be/`),
  tiktok (`tiktok.com`, `vm.tiktok.com`), instagram (`instagram.com/reel(s)?/`, `instagram.com/p/`).
- **Normalize**: youtube → `https://www.youtube.com/watch?v=<id>` (shorts and youtu.be
  converted); tiktok/instagram → strip query string + hash, keep scheme/host/path,
  drop trailing slash. Keep these as pure exported functions (unit-testable).

## Database

Single table `transcripts` via sequelize-typescript model, options
`@Table({ tableName: 'transcripts', timestamps: true, underscored: true })`.
Columns: `id` (auto-int PK), `url` (text, not null), `platform` (varchar), `title` (text),
`status` (varchar, not null), `source` (varchar), `text` (text), `error` (text),
`duration_seconds` (integer). **No DB enums** — plain varchar, enforce values app-side.
Use `SequelizeModule.forRoot` with `uri: DATABASE_URL`, `autoLoadModels: true`,
`synchronize: true` (no migrations for this app).

## Conventions

- kebab-case filenames; TypeScript strict; class-validator DTO on POST body.
- No comments narrating the obvious; small files; keep the whole backend under ~10 source files.
- Statuses/platforms/sources as string-literal union types exported from one `types.ts`.
