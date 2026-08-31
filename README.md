# omaX

**X in the terminal, dressed in your rice.**

omaX is a fast, keyboard-first X client for Omarchy. It combines a three-pane
terminal interface with an agent-safe JSON CLI: timelines, search, threads,
profiles, lists, bookmarks, notifications, compose, replies, profile photos,
and inline media without a browser window or official API key.

It uses the X session already in your browser. Cookies and keyring secrets stay
in memory, demo mode needs no account or network, and every public screenshot
uses local fixtures rather than an authenticated timeline.

![omaX in Tokyo Night](docs/screenshots/omax-tokyo-night.png)

## Install with your agent

Copy this entire block into Codex, Claude Code, OpenClaw, or another agent that
can run local commands:

```text
Install omaX for me from https://github.com/MoizIbnYousaf/omaX.

This is an Omarchy plugin. Read its README and security notes first, then:
1. Run `omarchy plugin add https://github.com/MoizIbnYousaf/omaX.git --enable`.
2. Run `~/.config/omarchy/plugins/greensnow.omax/scripts/install`.
3. Run `omax doctor` and report only prerequisite/profile availability — never
   print, copy, or inspect cookies, auth_token, ct0, keyring passwords, or a
   real timeline.
4. Run `omax demo` only if a visual smoke test is useful; demo mode is synthetic
   and offline. Do not post, reply, like, bookmark, follow, or otherwise write
   to X while testing.

If multiple browser profiles are available, ask me which one I want to use.
Finish by telling me whether the bar launcher, `omax`, and the omaX agent skill
are installed.
```

## Install manually

Requirements: Omarchy, [Bun](https://bun.sh), Kitty, `rsync`, `jq`, and
`libsecret` (`secret-tool`).

```bash
omarchy plugin add https://github.com/MoizIbnYousaf/omaX.git --enable
~/.config/omarchy/plugins/greensnow.omax/scripts/install
omax doctor
omax
```

The first command installs the bar widget. The tiny helper installer exposes
the checkout's `omax` launcher and agent skill through stable symlinks; it does
not copy the app, read a browser database, or create another source tree.
Runtime dependencies live under `${XDG_STATE_HOME:-~/.local/state}/omax`.

## What it does

- **Native terminal timeline** — For You and Following feeds, threads, replies,
  search, profiles, bookmarks, lists, notifications, news, and pagination.
- **Real profile photos and media** — rendered through Kitty's graphics
  protocol with visible text fallbacks when a terminal or image cannot render.
- **Keyboard-first actions** — navigate, open, like, save, reply, and compose
  without leaving the home row.
- **Omarchy-native theming** — reads the active `colors.toml`, re-themes live,
  and falls back cleanly outside a complete Omarchy session.
- **Browser-session login** — discovers the profiles already present in major
  Chromium and Firefox-family browsers and uses the most recently active first.
- **Agent JSON CLI** — read commands are scriptable; public write commands have
  an explicit authorization boundary in the bundled skill.
- **Offline demo and release gate** — the complete interface is testable with
  local avatars and synthetic posts. No login and no network required. DHH and
  Jason Fried appear as labelled references; their demo copy is not a post or
  quote.

## It wears your theme

omaX maps the active Omarchy palette onto every UI role and watches for theme
switches while it runs.

| Catppuccin | Gruvbox |
|---|---|
| ![Catppuccin](docs/screenshots/omax-catppuccin.png) | ![Gruvbox](docs/screenshots/omax-gruvbox.png) |

| Everforest | Tokyo Night |
|---|---|
| ![Everforest](docs/screenshots/omax-everforest.png) | ![Tokyo Night](docs/screenshots/omax-tokyo-night.png) |

These captures come from `omax demo`: synthetic local data and local avatar
fixtures, never a real timeline. The DHH and Jason Fried likenesses are
labelled references and do not imply real posts or endorsements. To preview
another palette without changing your desktop:

```bash
OMAX_THEME_FILE=/path/to/colors.toml omax demo
```

## Usage

```bash
omax                    # account picker, then the TUI
omax --auto             # use the most recently active browser session
omax --profile "Work"   # use a named browser profile
omax demo               # offline local fixtures
omax doctor             # prerequisites and available browser profiles

omax cli whoami
omax cli home -n 20
omax cli home --following -n 20
omax cli search "omarchy" -n 10
omax cli thread https://x.com/user/status/123
```

### Keys

| Key | Action |
|---|---|
| `j` / `k` | next / previous post |
| `Enter` | open the selected post |
| `Tab` | switch For You / Following |
| `l` | like or unlike |
| `b` | bookmark or remove bookmark |
| `r` | reply |
| `c` | compose |
| `p` | open the author's profile |
| `/` | search |
| `1`–`6` | switch sidebar view |
| `n` | load more |
| `q` | go back / quit |

Writes are public and can be effectively irreversible. omaX never retries a
write automatically; agents must show the exact action and receive explicit
approval before running it.

## Browser sessions

omaX discovers real profiles instead of guessing names. Supported layouts
include:

- Chromium, Chrome, Brave, Edge, Vivaldi, Opera, Thorium, and Ungoogled
  Chromium in native, Flatpak, and Snap locations on Linux.
- Firefox, LibreWolf, Zen, Floorp, and Waterfox.
- Matching browser-family locations on macOS and Windows, plus Safari on
  macOS for the underlying CLI.

Modern Chromium protects cookies with a browser-specific Safe Storage secret.
On Linux, omaX asks `secret-tool` for the matching build's key and decrypts the
cookie in process. It never prints or persists the cookie or key.

```console
$ omax doctor
ok   bun
ok   secret-tool (browser keyring readable)
ok   omarchy theme (.../colors.toml)
ok   Chromium — Personal  [Profile 6]  keyring=yes
ok   Firefox — default-release  [default-release]  keyring=n/a
```

`doctor` reports availability only. If it cannot find a session, log into
`x.com` in a supported browser, unlock the login keyring, close any stale
profile picker, and run it again.

## Update

```bash
omarchy plugin update greensnow.omax
~/.config/omarchy/plugins/greensnow.omax/scripts/install
omax doctor
```

The helper install is idempotent. The next launch hashes the updated source,
atomically refreshes the generated runtime copy, and performs a frozen Bun
install. Browser sessions and profile choices are not part of the checkout and
are not replaced during an update.

## Remove

```bash
~/.config/omarchy/plugins/greensnow.omax/scripts/uninstall
omarchy plugin remove greensnow.omax
```

Removal preserves browser sessions and omaX runtime state. If you also want to
discard generated runtime files, inspect and remove only your own
`${XDG_STATE_HOME:-~/.local/state}/omax` directory after uninstalling.

## Privacy and security

- No API key, OAuth app, browser password, or official paid API is required.
- Session cookies and keyring secrets are read into memory only; they are not
  logged, cached, committed, or included in diagnostics.
- Timeline content is private user data. Never paste a real feed or authenticated
  output into an issue. Reproduce with `omax demo`.
- Avatar/media downloads are restricted to X-owned HTTPS media hosts, with
  redirect revalidation, timeouts, response-type checks, and a 16 MiB limit.
- Local image URLs are rejected outside offline demo mode; demo files are
  confined to a private XDG state directory.
- The web GraphQL surface is unofficial and may change. Query drift can break a
  feature even when authentication is healthy.

See [SECURITY.md](SECURITY.md) for reporting and the complete trust boundary.

## For agents

The bundled `skills/omax` contract routes all access through `omax cli`. Read
operations may run without ceremony. Posting, replying, liking, bookmarking,
following, and their inverse operations each require explicit authorization;
the skill forbids automatic write retries.

```bash
omax cli read <url-or-id>
omax cli replies <url-or-id>
omax cli user <handle> -n 20
omax cli bookmarks -n 20
omax cli trending
```

The skill never authorizes direct browser-cookie access or raw calls into the
vendored X client.

## Architecture

```text
bin/omax                       stable launcher; syncs generated runtime state
plugins/omax/BarWidget.qml     Omarchy bar entry point
plugins/omax/app/src/index.ts  account selection and interactive TUI
plugins/omax/app/src/cli.ts    JSON command boundary
plugins/omax/app/src/auth.ts   shared browser-session authentication
plugins/omax/app/src/ui/       views, components, themes, Kitty media
plugins/omax/app/src/demo/     offline fixtures and avatar artwork
skills/omax/                   agent authorization contract
scripts/test                   release gate
```

There is one authentication path for the TUI and CLI, one user-image mapping
boundary for every view, and one hardened image loader for avatars and media.
The checked-out/deployed source stays immutable; `node_modules` and generated
files live only in XDG state.

## Test and contribute

```bash
./scripts/test          # typecheck, unit tests, install test, demo smoke
./scripts/test --full   # plus the complete tmux-driven TUI suite
```

The full gate runs offline and logged out. It must remain possible to test a
change without reading a real account. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [AGENTS.md](AGENTS.md) before changing code.

## Troubleshooting

### No profile photos or media

Use Kitty and launch from the bar or `kitty omax`. Text fallbacks remain visible
in terminals that do not implement Kitty graphics. Run `omax demo` to separate
terminal rendering from live X payload changes.

### No browser profile found

Run `omax doctor`, confirm you are logged into `x.com` in a supported browser,
and unlock the desktop login keyring. omaX will not ask for your X password.

### A command broke after X changed

Open a synthetic bug report with the command name and sanitized error. Never
attach cookies, request headers, browser databases, or a screenshot of a real
timeline.

### The bar button opens nothing

Re-run the helper install after updating, verify `kitty` is available, then run
`omax doctor` from a terminal for the concrete prerequisite error.

## Credits

omaX is a fork of [`xterminal`](https://github.com/MoizIbnYousaf/xterminal),
rebuilt as an Omarchy product by the same author. It uses
[OpenTUI](https://github.com/sst/opentui),
[Sharp](https://github.com/lovell/sharp), and a vendored, attributed build of
[`@steipete/sweet-cookie`](https://github.com/steipete/sweet-cookie).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

MIT licensed. Not affiliated with or endorsed by X Corp.
