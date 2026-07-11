export function elapsedSeconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}
