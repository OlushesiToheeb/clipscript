import { Platform } from '../types';

const YOUTUBE_ID = /^[\w-]{6,}$/;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function bareHost(u: URL): string {
  return u.hostname.replace(/^www\./, '');
}

export function detectPlatform(url: string): Platform | null {
  const u = parse(url);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  const host = bareHost(u);

  if (host === 'youtu.be') return 'youtube';
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (u.pathname === '/watch' || u.pathname.startsWith('/shorts/')) return 'youtube';
    return null;
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    if (/^\/(reels?|p)\//.test(u.pathname)) return 'instagram';
    return null;
  }
  return null;
}

function youtubeVideoId(u: URL): string | null {
  const host = bareHost(u);
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2] ?? null;
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function normalizeUrl(url: string): string | null {
  const platform = detectPlatform(url);
  const u = parse(url);
  if (!platform || !u) return null;

  if (platform === 'youtube') {
    const id = youtubeVideoId(u);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host}${path}`;
}
