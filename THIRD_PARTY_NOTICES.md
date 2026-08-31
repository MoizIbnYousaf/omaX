# Third-party notices

omaX is distributed under the MIT License (see `LICENSE`). It builds on the
components below.

## Origin

omaX is a fork of [`xterminal`](https://github.com/MoizIbnYousaf/xterminal)
at commit `26167879a9a4acc2a5153880354f963b5a4c1a23`, by the same author.

> **Note:** the upstream repository declares no license — it carries no
> `LICENSE` file and no `license` field in `package.json`. omaX is licensed
> MIT by its copyright holder, who is also the author of `xterminal`. Before
> this repository is ever made public, confirm the licensing of the vendored
> components listed below, since their upstream provenance is not recorded in
> the code.

## Runtime dependencies

- **[@opentui/core](https://github.com/sst/opentui)** — terminal UI renderer.
  MIT License.
- **[sharp](https://github.com/lovell/sharp)** — image decoding and resizing
  for inline avatars and media. Apache License 2.0.

## Vendored source

These live under `app/src/lib/` and are compiled JavaScript carried over from
the upstream fork rather than installed packages. They contain no license
headers; their upstream projects are noted where identifiable.

- **`lib/x-client/`** — client for X's web GraphQL surface: timelines,
  search, threads, bookmarks, lists, engagement and posting, plus the captured
  `query-ids.json` and `features.json` the web client sends.
- **`lib/cookies/`** — browser cookie extraction for Chromium (SQLite plus
  AES-128-CBC value decryption, libsecret / macOS Keychain / Windows DPAPI key
  retrieval), Firefox and Safari. Its `SWEET_COOKIE_*` environment prefix
  suggests an upstream "sweet-cookie" project; attribution should be confirmed
  before public release.

## Protocols and formats

- **Kitty graphics protocol** — used to draw avatars and inline media in
  terminals that support it.
- **Omarchy theme palette** (`colors.toml`) — read at runtime to theme the
  client; no Omarchy code is vendored.

## Not included

omaX uses no official X/Twitter API and ships no API keys, OAuth application,
tokens, cookies, or account data.
