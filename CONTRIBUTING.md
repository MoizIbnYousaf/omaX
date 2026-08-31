# Contributing to omaX

omaX keeps one narrow boundary: the browser owns authentication, the vendored
client owns X's GraphQL surface, and the TUI owns rendering. Changes should
preserve that split — no embedded browser, no API keys, no credential storage.

## Before opening a pull request

```bash
./scripts/test          # typecheck, unit tests, offline demo smoke
./scripts/test --full   # adds the full offline TUI suite (49 assertions)
```

Everything must pass **offline and logged out**. If a change cannot be
verified that way, extend the fixture client in `src/demo/demo-client.ts`
rather than reaching for a real account.

## House rules

- Never run a write command (`post`, `reply`, `like`, `follow`) to test a
  change. Use demo mode.
- Never include cookies, tokens, keyring output, or screenshots of a real
  timeline in a commit, issue, or pull request. Screenshots come from
  `omax demo`.
- Colors come from the theme, never from literals. Read roles off `theme`
  in `src/ui/theme.ts`; if a role is missing, add it and map it in
  `src/ui/omarchy-theme.ts` so every Omarchy theme stays covered.
- Run every string that came from X through `sanitizeText()` before rendering.
- Image URLs must pass `isAllowedImageUrl()` before they are fetched.
- Imports carry `.js` extensions, matching the existing modules.

## Adding a browser

Add it to `CHROMIUM_BROWSERS` or `FIREFOX_BROWSERS` in `src/browsers.ts` with
its config roots per platform and, for Chromium builds, its libsecret
`application` name. Cover it in `test/browsers.test.ts` with a fixture tree —
those tests build real directories in a temp dir, so no real profile is
touched.
