const RATE_LIMIT_PATTERN = /\b429\b|rate.?limit|too.?many.?requests/i;
const NOT_CONFIGURED_PATTERN = /not configured|api key required/i;

export function isRateLimitedError(error: string): boolean {
  return RATE_LIMIT_PATTERN.test(error);
}

export function isNotConfiguredError(error: string): boolean {
  return NOT_CONFIGURED_PATTERN.test(error);
}
