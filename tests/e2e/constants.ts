// Shared by playwright.config.ts and the specs. Not a secret: it only unlocks the exclusion cookie of
// the throwaway server Playwright starts. The server treats a token under 32 characters as unset.
export const E2E_EXCLUDE_TOKEN = 'e2e-exclude-token-0f3a9c1d-throwaway';
