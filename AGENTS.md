# omaX agent contract

## Scope

This repository is the omaX client. It contains no private personal data: no
cookies, tokens, timeline content, or screenshots of an authenticated account.
The public demo includes clearly labelled DHH and Jason Fried references.

## Source of truth

This repository is a one-way mirror. The canonical source is the private
`my-omarchy-plugins` monorepo at `packages/omax/`. Change it there, run the
gate there, deploy from there, then mirror. A fix that lands only here is lost
on the next sync.

## Safety

- Never commit or push cookies, `auth_token`/`ct0` values, keyring passwords,
  a browser profile path containing a real user name, or a screenshot of a
  real timeline. Screenshots are produced with `omax demo`, which uses local
  fixtures only.
- Credentials are read in-process on every run and never written to disk by
  omaX. Keep it that way: no cookie caching, no token files, no debug logging
  of header values.
- `omax cli` writes (post, reply, like, bookmark, follow) are public and
  effectively irreversible. Never run one to "test" a change; the demo client
  exists for that. Never retry a write automatically.
- Treat the X API surface as unversioned and hostile to scraping assumptions.
  Query ids and feature flags in `src/lib/x-client` are captured from the web
  client and will drift; fix them by re-capturing, not by widening scopes.

## Layout

```text
bin/omax                    launcher: TUI, demo, cli, doctor
plugins/omax/               Quickshell bar launcher (QML + manifest)
plugins/omax/app/           the TUI and CLI (TypeScript, Bun, OpenTUI)
  src/browsers.ts           browser/profile discovery and keyring resolution
  src/auth.ts               the one path the TUI and CLI share to get a session
  src/ui/                   views, components, theming, kitty graphics
  src/lib/                  vendored x-client and cookie extraction
  src/demo/                 offline fixture client
scripts/test                release gate
skills/omax/                agent skill
docs/screenshots/           per-theme demo captures used by the README
```

## Before a pull request

```bash
./scripts/test          # fast gate: typecheck, unit tests, demo smoke
./scripts/test --full   # adds the complete offline TUI suite
```

The gate must pass offline and logged out. If a change cannot be verified
without a real account, it is not finished — extend `src/demo/demo-client.ts`
instead.

## Local paths

```text
~/.local/state/omax/runtime/   installed runtime (generated; never edit)
~/.local/state/omax/gate/      release-gate working copy (generated)
~/.config/omarchy/plugins/greensnow.omax/   deployed plugin and app
```

Never edit a deployed or generated copy as if it were source.
