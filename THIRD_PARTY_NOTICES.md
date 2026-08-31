# Third-party notices

omaX is distributed under the MIT License (see `LICENSE`). It builds on the
components below. Versions and source commits are pinned so the notices remain
auditable after upstream projects change.

## Origin

omaX is a fork of [`xterminal`](https://github.com/MoizIbnYousaf/xterminal)
at commit `26167879a9a4acc2a5153880354f963b5a4c1a23`, by the same author.

The upstream repository carries no separate license declaration. omaX is
released under MIT by Moiz Ibn Yousaf, the copyright holder and author of both
repositories.

## Runtime dependencies

- **[@opentui/core](https://github.com/sst/opentui)** — terminal UI renderer.
  MIT License.
- **[sharp](https://github.com/lovell/sharp)** — image decoding and resizing
  for inline avatars and media. Apache License 2.0.

## Vendored source

These live under `app/src/lib/` and are carried with the application rather
than installed as packages.

- **`lib/x-client/`** — client for X's web GraphQL surface: timelines,
  search, threads, bookmarks, lists, engagement and posting, plus the captured
  `query-ids.json` and `features.json` the web client sends.
- **`lib/cookies/`** — compiled output from
  [`@steipete/sweet-cookie`](https://github.com/steipete/sweet-cookie) v0.1.0,
  source commit `41d609fe862e1a5bce35d403e68ec56248c84693`, with omaX integration changes.
  Copyright 2025 Peter Steinberger, MIT License. The license is preserved at
  `plugins/omax/app/src/lib/cookies/LICENSE`.

## Protocols and formats

- **Kitty graphics protocol** — used to draw avatars and inline media in
  terminals that support it.
- **Omarchy theme palette** (`colors.toml`) — read at runtime to theme the
  client; no Omarchy code is vendored.

## Not included

omaX uses no official X/Twitter API and ships no API keys, OAuth application,
tokens, cookies, or account data.

The fictional people and organizations shown in demo mode and project
screenshots are repository-owned synthetic fixtures. They do not represent X
accounts or endorsements.
