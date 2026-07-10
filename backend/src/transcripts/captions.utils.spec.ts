import { parseJson3Captions } from './captions.utils';

const fixture = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 1000 },
    { segs: [{ utf8: 'All right, so here' }, { utf8: ' we are' }] },
    { segs: [{ utf8: '\n' }] },
    { segs: [{ utf8: 'in front of the ' }, { utf8: 'elephants.' }] },
  ],
});

describe('parseJson3Captions', () => {
  it('joins segment text and normalizes whitespace', () => {
    expect(parseJson3Captions(fixture)).toBe('All right, so here we are in front of the elephants.');
  });

  it('separates adjacent events that carry no newline of their own', () => {
    const glued = JSON.stringify({
      events: [{ segs: [{ utf8: 'in front of the elephants.' }] }, { segs: [{ utf8: 'The cool thing' }] }],
    });
    expect(parseJson3Captions(glued)).toBe('in front of the elephants. The cool thing');
  });

  it('returns empty string when there are no events', () => {
    expect(parseJson3Captions(JSON.stringify({ events: [] }))).toBe('');
  });

  it('returns empty string for whitespace-only captions', () => {
    expect(parseJson3Captions(JSON.stringify({ events: [{ segs: [{ utf8: '\n \n' }] }] }))).toBe('');
  });

  it('returns empty string for invalid JSON', () => {
    expect(parseJson3Captions('not json')).toBe('');
  });
});
