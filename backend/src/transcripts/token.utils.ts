import { createHmac, timingSafeEqual } from 'crypto';

// A transcript's public handle is a signed id, not the raw sequential id.
// Without the secret you cannot forge a valid token, so nobody can enumerate
// (1, 2, 3, …) and read transcripts they didn't create — the app has no login,
// so this is what keeps one person's transcripts from being reachable by another.
const SECRET = process.env.TOKEN_SECRET || 'clipscript-dev-secret-change-me';

function sign(id: number): string {
  return createHmac('sha256', SECRET).update(String(id)).digest('base64url').slice(0, 24);
}

export function tokenFor(id: number): string {
  return `${id}.${sign(id)}`;
}

export function idFromToken(token: string): number | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const id = Number(token.slice(0, dot));
  if (!Number.isInteger(id) || id < 1) return null;
  const provided = token.slice(dot + 1);
  const expected = sign(id);
  if (provided.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id;
}
