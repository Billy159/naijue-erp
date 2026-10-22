// Retain the original strict reproduction as a regression after the local fix.
// The frozen review-v0 artifact remains unchanged and still reproduces the issue.
process.env.UNIFIED_ASSERT_DIRECT_NEW_REENTRY='1';
await import('./run-application-dom-tests.mjs');
