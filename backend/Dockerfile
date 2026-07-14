# ---- Build stage: compile TypeScript -> dist ----
FROM node:22-slim AS builder
WORKDIR /app

# Install all deps (incl. dev) for `nest build`. ffmpeg-static's postinstall
# downloads the Linux ffmpeg here; it's carried into the runtime image below.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: slim image with prod deps + the Linux yt-dlp binary ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# yt-dlp: the repo ships the macOS build; production is Linux, so fetch the
# self-contained Linux binary and point the app at it via YTDLP_PATH.
# ca-certificates lets yt-dlp/OpenAI make HTTPS calls; ffmpeg comes from
# ffmpeg-static (node_modules), so it isn't installed via apt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
       -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

# Production node_modules only (re-runs ffmpeg-static's postinstall for Linux).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled app.
COPY --from=builder /app/dist ./dist

# App reads process.env.PORT (Render injects it); 4600 is the local default.
EXPOSE 4600
CMD ["node", "dist/main.js"]
