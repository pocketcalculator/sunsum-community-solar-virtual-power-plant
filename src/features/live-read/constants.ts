export const LIVE_READ_LIMITS = Object.freeze({
  defaultTimeoutMs: 10_000,
  maxTimeoutMs: 30_000,
  jsonBytes: 2 * 1024 * 1024,
  downloadBytes: 10 * 1024 * 1024,
  maxItems: 5_000,
  maxStringLength: 16_384,
  maxDepth: 32,
});
