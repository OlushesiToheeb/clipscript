interface Json3Event {
  segs?: { utf8?: string }[];
}

export function parseJson3Captions(raw: string): string {
  let events: Json3Event[];
  try {
    events = (JSON.parse(raw) as { events?: Json3Event[] }).events ?? [];
  } catch {
    return '';
  }
  const text = events
    .map((event) => (event.segs ?? []).map((seg) => seg.utf8 ?? '').join(''))
    .join(' ');
  return text.replace(/\s+/g, ' ').trim();
}
