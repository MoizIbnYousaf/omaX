# Security and privacy

omaX reads the X session that already exists in your browser. That session is
a credential: anyone holding it can act as you on X.

## What omaX does with credentials

- Cookies are read in-process at launch and held in memory only. omaX never
  writes them to disk, never caches them, and never logs them.
- On Linux, the Chromium "Safe Storage" password is read from the login
  keyring through `secret-tool` for the specific browser being used, and is
  passed in-process only.
- `omax doctor` and `omax cli browsers` report *availability* — which profiles
  exist and whether a keyring key is readable. They never print a cookie or a
  password.

## Reporting

Please do not include cookies, `auth_token` or `ct0` values, keyring output,
account tokens, or screenshots of a real timeline in an issue or pull request.
Reproduce with `omax demo`, which runs entirely on local fixtures.

Report a vulnerability through GitHub's private vulnerability reporting when
it is available for this repository; otherwise contact the maintainer
privately with the smallest synthetic reproduction possible.

## Scope notes

omaX sends API requests only to `x.com` / `twitter.com`, and downloads display
assets only from the explicit X media allowlist (`pbs.twimg.com`,
`abs.twimg.com`, `video.twimg.com`, and `ton.twimg.com`). It also reads the
local browser cookie stores and keyring. Image redirects are revalidated and
downloads are bounded by time, type, and size.

It uses the web client's GraphQL surface rather than the official API, so query
ids and feature flags drift over time; a breakage there is a bug, not a
security boundary.
