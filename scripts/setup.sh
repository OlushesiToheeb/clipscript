#!/usr/bin/env bash
# One-time setup: yt-dlp binary, env files, dependencies.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -x "$ROOT/bin/yt-dlp" ]; then
  echo "Downloading yt-dlp..."
  mkdir -p "$ROOT/bin"
  curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o "$ROOT/bin/yt-dlp"
  chmod +x "$ROOT/bin/yt-dlp"
fi
"$ROOT/bin/yt-dlp" --version

[ -f "$ROOT/backend/.env" ] || cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
[ -f "$ROOT/frontend/.env.local" ] || cp "$ROOT/frontend/.env.local.example" "$ROOT/frontend/.env.local"

npm --prefix "$ROOT/backend" install
npm --prefix "$ROOT/frontend" install
echo "Setup complete. Start with: npm run db:up && npm run dev:backend & npm run dev:frontend"
