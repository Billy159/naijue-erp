/** Acceptance host configuration only. Never a backend role or grant. */
export type UnifiedReviewProfile = 'standard' | 'transfer-readonly';
export function reviewProfile(value: unknown): UnifiedReviewProfile {
  if (value !== 'standard' && value !== 'transfer-readonly') throw new TypeError('Unknown synthetic review profile.');
  return value;
}
