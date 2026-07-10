import { detectPlatform, normalizeUrl } from './url.utils';

describe('detectPlatform', () => {
  it.each([
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw', 'youtube'],
    ['https://youtube.com/shorts/abc123DEF45', 'youtube'],
    ['https://youtu.be/jNQXAC9IVRw', 'youtube'],
    ['https://www.tiktok.com/@user/video/7123456789012345678', 'tiktok'],
    ['https://vm.tiktok.com/ZM8abcdef/', 'tiktok'],
    ['https://www.instagram.com/reel/Cabc123defG/', 'instagram'],
    ['https://www.instagram.com/reels/Cabc123defG/', 'instagram'],
    ['https://www.instagram.com/p/Cabc123defG/', 'instagram'],
  ])('detects %s as %s', (url, platform) => {
    expect(detectPlatform(url)).toBe(platform);
  });

  it.each([
    'https://example.com/watch?v=abc',
    'https://www.instagram.com/some-user/',
    'https://www.youtube.com/channel/UCabc',
    'not a url at all',
    'ftp://youtube.com/watch?v=abc',
  ])('returns null for %s', (url) => {
    expect(detectPlatform(url)).toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('canonicalizes a youtube watch URL, dropping extra params', () => {
    expect(normalizeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=10s&list=PL1')).toBe(
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    );
  });

  it('converts youtube shorts to a watch URL', () => {
    expect(normalizeUrl('https://www.youtube.com/shorts/abc123DEF45?feature=share')).toBe(
      'https://www.youtube.com/watch?v=abc123DEF45',
    );
  });

  it('converts youtu.be to a watch URL', () => {
    expect(normalizeUrl('https://youtu.be/jNQXAC9IVRw?si=xyz')).toBe(
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    );
  });

  it('strips query, hash and trailing slash from tiktok URLs', () => {
    expect(
      normalizeUrl('https://www.tiktok.com/@user/video/7123456789012345678/?is_from_webapp=1#top'),
    ).toBe('https://www.tiktok.com/@user/video/7123456789012345678');
  });

  it('strips query and trailing slash from instagram reels', () => {
    expect(normalizeUrl('https://www.instagram.com/reel/Cabc123defG/?igsh=token')).toBe(
      'https://www.instagram.com/reel/Cabc123defG',
    );
  });

  it('returns null for a youtube watch URL without a video id', () => {
    expect(normalizeUrl('https://www.youtube.com/watch')).toBeNull();
  });

  it('returns null for unrecognized URLs', () => {
    expect(normalizeUrl('https://vimeo.com/12345')).toBeNull();
    expect(normalizeUrl('nonsense')).toBeNull();
  });
});
